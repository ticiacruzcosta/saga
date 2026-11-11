import { prisma } from "@/lib/prisma";
import { modoTelegram, obterTokenTelegram, telegramConfigurado } from "@/lib/telegram/api";
import { enviarMensagemHttps } from "@/lib/telegram/transporte-https.mjs";

export async function prepararTelegram(avisoId: number, escopo: "TURMA" | "TODOS" = "TURMA") {
  const aviso = await prisma.aviso.findUnique({ where: { id: avisoId }, include: { grupo: true } });
  if (!aviso) throw new Error("Aviso não encontrado.");
  const existente = await prisma.telegramLote.findUnique({ where: { avisoId } });
  if (existente) return existente;

  // Se escopo === "TURMA", prioriza alunos vinculados à turma do aviso + alunos ainda sem turma definida;
  // se não houver nenhum, usa todos os inscritos ativos para não bloquear o disparo.
  let assinantes = await prisma.telegramAssinante.findMany({
    where:
      escopo === "TURMA"
        ? { ativo: true, OR: [{ grupoId: aviso.grupoId }, { grupoId: null }] }
        : { ativo: true },
    select: { id: true },
  });
  if (!assinantes.length && escopo === "TURMA") {
    assinantes = await prisma.telegramAssinante.findMany({ where: { ativo: true }, select: { id: true } });
  }
  if (!assinantes.length) throw new Error("Nenhum aluno inscrito pelo Telegram. Solicite /start primeiro.");
  const conteudo = `SAGA • Aviso acadêmico\nTurma: ${aviso.grupo.nome}\n${aviso.conteudo}`.slice(0, 3900);
  return prisma.$transaction(async tx => {
    const lote = await tx.telegramLote.create({ data: { avisoId, conteudo } });
    await tx.telegramMensagem.createMany({ data: assinantes.map(a => ({ loteId: lote.id, assinanteId: a.id })) });
    return lote;
  });
}

export async function confirmarTelegram(loteId: number, esperado: "SIMULACAO" | "REAL") {
  if (modoTelegram() !== esperado) throw new Error("O modo mudou; atualize a página.");
  if (esperado === "REAL" && !telegramConfigurado()) throw new Error("Configure o token do BotFather antes do envio real.");
  const result = await prisma.telegramLote.updateMany({ where: { id: loteId, status: "PREPARADO" },
    data: { status: "CONFIRMADO", modoConfirmado: esperado, confirmadoEm: new Date() } });
  if (!result.count) throw new Error("Lote não encontrado ou já confirmado.");
}

/** Reabre apenas mensagens marcadas como FALHOU, mediante confirmação do admin.
 * Nunca reabre simulações como reais e não reenvia mensagens ENVIADO/SIMULADO.
 * Só use após verificar que o destinatário não recebeu o aviso.
 */
export async function reabrirFalhasTelegram(loteId: number, esperado: "SIMULACAO" | "REAL") {
  if (modoTelegram() !== esperado) throw new Error("O modo do Telegram mudou. Atualize a página.");
  if (esperado === "REAL" && !telegramConfigurado()) throw new Error("Token Telegram ausente.");
  return prisma.$transaction(async tx => {
    const lote = await tx.telegramLote.findUnique({ where: { id: loteId }, select: { status: true, modoConfirmado: true } });
    if (!lote || lote.status !== "CONCLUIDO" || lote.modoConfirmado !== esperado) {
      throw new Error("Somente lotes concluídos no mesmo modo podem ter falhas reabertas.");
    }
    const reabertas = await tx.telegramMensagem.updateMany({
      where: { loteId, status: "FALHOU" },
      data: { status: "PENDENTE", erro: null },
    });
    if (!reabertas.count) throw new Error("Não há mensagens com falha nesse lote.");
    await tx.telegramLote.update({ where: { id: loteId }, data: { status: "CONFIRMADO" } });
    return reabertas.count;
  });
}

export async function processarTelegram(limite = 10) {
  const modo = modoTelegram();
  if (modo === "REAL" && !telegramConfigurado()) throw new Error("Token Telegram ausente.");
  const mensagens = await prisma.telegramMensagem.findMany({ where: { status: "PENDENTE", lote: { is: { status: "CONFIRMADO", modoConfirmado: modo } } },
    include: { lote: true, assinante: true }, orderBy: { id: "asc" }, take: Math.min(20, Math.max(1, limite)) });
  const res = { processadas: 0, simuladas: 0, enviadas: 0, falhas: 0, canceladas: 0 };
  for (const m of mensagens) {
    const lock = await prisma.telegramMensagem.updateMany({ where: { id: m.id, status: "PENDENTE" }, data: { status: "PROCESSANDO", tentativas: { increment: 1 } } });
    if (!lock.count) continue;
    res.processadas++;
    const atual = await prisma.telegramAssinante.findUnique({ where: { id: m.assinanteId }, select: { ativo: true } });
    if (!atual?.ativo) {
      await prisma.telegramMensagem.update({ where: { id: m.id }, data: { status: "CANCELADO" } }); res.canceladas++; continue;
    }
    if (modo === "SIMULACAO") {
      await prisma.telegramMensagem.update({ where: { id: m.id }, data: { status: "SIMULADO" } }); res.simuladas++; continue;
    }
    try {
      const enviado = await enviarMensagemHttps(obterTokenTelegram(), m.assinante.chatId, m.lote.conteudo);
      await prisma.telegramMensagem.update({ where: { id: m.id }, data: { status: "ENVIADO", telegramId: String(enviado.message_id), erro: null } }); res.enviadas++;
    } catch (erro) {
      const msg = String(erro instanceof Error ? erro.message : "Erro desconhecido").slice(0, 230);
      await prisma.telegramMensagem.update({ where: { id: m.id }, data: { status: "FALHOU", erro: msg } }); res.falhas++;
      // Bot bloqueado pelo usuário: interrompe mensagens futuras, inclusive outros lotes.
      if (/Telegram \(403\)/.test(msg)) await prisma.telegramAssinante.update({ where: { id: m.assinanteId }, data: { ativo: false, cancelouEm: new Date() } });
    }
  }
  for (const id of new Set(mensagens.map(m => m.loteId))) {
    const restantes = await prisma.telegramMensagem.count({ where: { loteId: id, status: { in: ["PENDENTE", "PROCESSANDO"] } } });
    if (!restantes) {
      const lote = await prisma.telegramLote.update({ where: { id }, data: { status: "CONCLUIDO" } });
      const falhas = await prisma.telegramMensagem.count({ where: { loteId: id, status: "FALHOU" } });
      await prisma.aviso.update({ where: { id: lote.avisoId }, data: { status: falhas > 0 ? "FALHOU" : "ENVIADO" } });
    }
  }
  return res;
}
