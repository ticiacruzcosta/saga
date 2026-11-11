import { prisma } from "@/lib/prisma";
import { enviarMensagem, enviarFoto } from "@/lib/telegram/api";
import { interpretarComando, idPositivo, chatPrivado, DIAS_TELEGRAM } from "@/lib/telegram/comandos.mjs";
import { horarioPng } from "@/lib/telegram/horario";

type Atualizacao = { update_id?: number; message?: { chat?: { id?: number; type?: string }; from?: { first_name?: string }; text?: string } };
const ajuda = "SAGA • Avisos Acadêmicos\n/start — inscrever-se para receber avisos\n/turmas — listar turmas\n/turma 12 — selecionar sua turma pelo número\n/horario — imagem das aulas de hoje\n/segunda, /terca, /quarta, /quinta, /sexta ou /sabado — imagem do dia\n/avisos — últimos avisos\n/sair — cancelar inscrição\n/help — ver comandos";

export async function receberAtualizacao(update: Atualizacao) {
  if (!Number.isSafeInteger(update.update_id) || (update.update_id ?? -1) < 0) return;
  const evento = String(update.update_id);
  try { await prisma.telegramEvento.create({ data: { updateId: evento } }); }
  catch (erro) { if ((erro as { code?: string })?.code === "P2002") return; throw erro; }
  try {
    const msg = chatPrivado(update);
    if (!msg) return; // Em grupos, nenhum cadastro automático; exige conversa privada.
    const chatId = String(msg.chat.id);
    const { nome, argumento } = interpretarComando(msg.text);
    const inscrito = await prisma.telegramAssinante.findUnique({ where: { chatId } });
    if (nome === "start" || nome === "inscrever") {
      await prisma.telegramAssinante.upsert({ where: { chatId },
        create: { chatId, nome: String(msg.from?.first_name ?? "Aluno").slice(0, 90), ativo: true },
        update: { ativo: true, cancelouEm: null, aceitouEm: new Date() },
      });
      await enviarMensagem(chatId, "Inscrição confirmada! Você receberá os avisos acadêmicos do SAGA.\n\n" + ajuda);
      return;
    }
    if (nome === "sair" || nome === "stop" || nome === "cancelar") {
      if (inscrito) {
        await prisma.telegramAssinante.update({ where: { chatId }, data: { ativo: false, cancelouEm: new Date() } });
        await prisma.telegramMensagem.updateMany({ where: { assinanteId: inscrito.id, status: "PENDENTE" }, data: { status: "CANCELADO" } });
      }
      await enviarMensagem(chatId, "Inscrição cancelada. Você não receberá novos avisos. Para voltar, envie /start.");
      return;
    }
    if (nome === "help" || nome === "ajuda") { await enviarMensagem(chatId, ajuda); return; }
    if (!inscrito?.ativo) { await enviarMensagem(chatId, "Para receber avisos e consultar o horário, envie /start. Você pode cancelar com /sair."); return; }
    if (nome === "turmas") {
      const pagina = idPositivo(argumento) ?? 1;
      const grupos = await prisma.grupoAlunos.findMany({ orderBy: { nome: "asc" }, skip: (Math.min(pagina, 100) - 1) * 15, take: 15 });
      await enviarMensagem(chatId, grupos.length ? `Turmas (página ${pagina}):\n${grupos.map(g => `${g.id} — ${g.nome}`).join("\n")}\n\nUse /turma ID para selecionar. Outras turmas: /turmas ${pagina+1}` : "Não encontrei turmas nessa página. Tente /turmas 1.");
      return;
    }
    if (nome === "turma") {
      const id = idPositivo(argumento);
      if (!id) { await enviarMensagem(chatId, "Informe o número da turma. Ex.: /turma 12. Veja /turmas."); return; }
      const grupo = await prisma.grupoAlunos.findUnique({ where: { id } });
      if (!grupo) { await enviarMensagem(chatId, "Turma não encontrada. Veja /turmas."); return; }
      await prisma.telegramAssinante.update({ where: { chatId }, data: { grupoId: id } });
      await enviarMensagem(chatId, `Turma selecionada: ${grupo.nome}. Agora envie /horario ou /sexta. Os avisos gerais continuam ativos.`);
      return;
    }
    if (nome === "avisos") {
      const avisos = await prisma.aviso.findMany({ include: { grupo: true }, orderBy: { criadoEm: "desc" }, take: 5 });
      await enviarMensagem(chatId, avisos.length ? `Últimos avisos do SAGA:\n\n${avisos.map(a => `• ${a.grupo.nome}: ${a.conteudo}`).join("\n\n")}`.slice(0, 3900) : "Nenhum aviso registrado ainda.");
      return;
    }
    if (nome === "horario" || nome === "hoje" || DIAS_TELEGRAM[nome]) {
      if (!inscrito.grupoId) { await enviarMensagem(chatId, "Selecione primeiro sua turma: use /turmas e depois /turma ID."); return; }
      const result = await horarioPng(inscrito.grupoId, DIAS_TELEGRAM[nome]);
      if (!result) { await enviarMensagem(chatId, "Hoje não há aulas regulares. Use /segunda, /terca, /quarta, /quinta, /sexta ou /sabado."); return; }
      if ("erro" in result) { await enviarMensagem(chatId, result.erro ?? "Erro ao gerar horário."); return; }
      await enviarFoto(chatId, result.imagem, result.legenda);
      return;
    }
    await enviarMensagem(chatId, ajuda);
  } catch (e) {
    // Se houve erro de rede, permitir retry do update. As operações de cadastro são idempotentes.
    await prisma.telegramEvento.deleteMany({ where: { updateId: evento } });
    throw e;
  }
}
