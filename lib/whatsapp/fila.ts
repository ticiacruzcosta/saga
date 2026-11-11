import { prisma } from "@/lib/prisma";
import { credenciaisReaisValidas, enviarTemplate, modoBot } from "@/lib/whatsapp/meta";

/** Fotografa o aviso e a lista atual de inscritos. Nunca envia nesta etapa. */
export async function prepararLote(avisoId: number) {
  const aviso = await prisma.aviso.findUnique({ where: { id: avisoId }, include: { grupo: true } });
  if (!aviso || aviso.status !== "PENDENTE") throw new Error("Selecione um aviso pendente válido.");
  const existente = await prisma.whatsappLote.findUnique({ where: { avisoId } });
  if (existente) return existente; // um lote por aviso; evita duplicações em cliques repetidos
  const assinantes = await prisma.whatsappAssinante.findMany({
    where: { ativo: true, ...(modoBot() === "REAL" ? { apenasSimulacao: false } : {}) },
    select: { id: true },
  });
  if (!assinantes.length) throw new Error("Nenhum aluno se inscreveu para receber avisos.");
  const conteudo = `SAGA | Aviso acadêmico\nTurma: ${aviso.grupo.nome}\n${aviso.conteudo}`.slice(0, 900);
  return prisma.$transaction(async (tx) => {
    const lote = await tx.whatsappLote.create({ data: { avisoId, conteudo } });
    await tx.whatsappMensagem.createMany({
      data: assinantes.map((a) => ({ loteId: lote.id, assinanteId: a.id })),
    });
    return lote;
  });
}

/** O modo fica registrado no banco na confirmação, nunca é inferido depois. */
export async function confirmarLote(loteId: number, modoEsperado: "REAL" | "SIMULACAO") {
  if (modoBot() !== modoEsperado) throw new Error("O modo do bot mudou. Atualize a página antes de confirmar.");
  if (modoEsperado === "REAL" && !credenciaisReaisValidas()) throw new Error("Configure a Meta e um template aprovado antes de confirmar disparos reais.");
  const alterado = await prisma.whatsappLote.updateMany({
    where: { id: loteId, status: "PREPARADO" },
    data: { status: "CONFIRMADO", modoConfirmado: modoEsperado, confirmadoEm: new Date() },
  });
  if (!alterado.count) throw new Error("O lote não foi encontrado ou já foi confirmado.");
}

/** Processa até 20 itens com trava CAS, preservando consentimento e modo congelado. */
export async function processarFila(limite = 10) {
  const modoAtual = modoBot();
  if (modoAtual === "REAL" && !credenciaisReaisValidas()) throw new Error("A configuração da Meta está incompleta.");
  // Lotes de modo diferente NÃO mudam de comportamento após editar o .env.
  const mensagens = await prisma.whatsappMensagem.findMany({
    where: { status: "PENDENTE", lote: { is: { status: "CONFIRMADO", modoConfirmado: modoAtual } } },
    include: { assinante: true, lote: true }, orderBy: { id: "asc" }, take: Math.max(1, Math.min(limite, 20)),
  });
  const resultado = { processadas: 0, simuladas: 0, enviadas: 0, falhas: 0, canceladas: 0 };
  for (const item of mensagens) {
    const trava = await prisma.whatsappMensagem.updateMany({
      where: { id: item.id, status: "PENDENTE" }, data: { status: "PROCESSANDO", tentativas: { increment: 1 } },
    });
    if (!trava.count) continue;
    resultado.processadas++;
    const ativo = await prisma.whatsappAssinante.findUnique({ where: { id: item.assinanteId }, select: { ativo: true } });
    if (!ativo?.ativo || (modoAtual === "REAL" && item.assinante.apenasSimulacao)) {
      await prisma.whatsappMensagem.update({ where: { id: item.id }, data: { status: "CANCELADO" } });
      resultado.canceladas++;
      continue;
    }
    if (modoAtual === "SIMULACAO") {
      await prisma.whatsappMensagem.update({ where: { id: item.id }, data: { status: "SIMULADO" } });
      resultado.simuladas++;
      continue;
    }
    try {
      const metaId = await enviarTemplate(item.assinante.telefone, item.lote.conteudo);
      await prisma.whatsappMensagem.update({ where: { id: item.id }, data: { status: "ENVIADO", metaId, erro: null } });
      resultado.enviadas++;
    } catch (erro) {
      await prisma.whatsappMensagem.update({ where: { id: item.id }, data: {
        status: "FALHOU", erro: (erro instanceof Error ? erro.message : "Erro no envio").slice(0, 250),
      } });
      resultado.falhas++;
    }
  }
  for (const id of new Set(mensagens.map((m) => m.loteId))) {
    const pendentes = await prisma.whatsappMensagem.count({ where: { loteId: id, status: { in: ["PENDENTE", "PROCESSANDO"] } } });
    if (pendentes) continue;
    const lote = await prisma.whatsappLote.update({ where: { id }, data: { status: "CONCLUIDO" } });
    const falharam = await prisma.whatsappMensagem.count({ where: { loteId: id, status: { in: ["FALHOU", "CANCELADO"] } } });
    const enviadas = await prisma.whatsappMensagem.count({ where: { loteId: id, status: { in: ["ENVIADO", "ENTREGUE", "LIDO"] } } });
    if (lote.modoConfirmado === "REAL") {
      const status = falharam ? "FALHOU" : enviadas ? "ENVIADO" : "PENDENTE";
      await prisma.aviso.update({ where: { id: lote.avisoId }, data: { status } });
    }
    // Simulação nunca marca aviso real como ENVIADO.
  }
  return resultado;
}
