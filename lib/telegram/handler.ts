import { prisma } from "@/lib/prisma";
import { enviarMensagem, enviarFoto, responderCallbackTelegram, type BotaoInlineTelegram } from "@/lib/telegram/api";
import { interpretarComando, idPositivo, chatPrivado, DIAS_TELEGRAM } from "@/lib/telegram/comandos.mjs";
import { horarioPng } from "@/lib/telegram/horario";
import { diaHojePV, DIAS, DIA_NOME, minutosEmHora } from "@/lib/whatsapp/texto.mjs";

type Atualizacao = {
  update_id?: number;
  message?: { chat?: { id?: number; type?: string }; from?: { first_name?: string }; text?: string };
  callback_query?: { id?: string; data?: string; from?: { first_name?: string }; message?: { chat?: { id?: number; type?: string } } };
};

const BOTOES_MENU: BotaoInlineTelegram[][] = [
  [
    { text: "📅 Hoje", callback_data: "/hoje" },
    { text: "⏭️ Amanhã", callback_data: "/amanha" },
    { text: "🗓️ Semana", callback_data: "/semana" },
  ],
  [
    { text: "🔔 Avisos", callback_data: "/avisos" },
    { text: "🎓 Minha Turma", callback_data: "/minhaturma" },
    { text: "🔄 Trocar Turma", callback_data: "/turmas 1" },
  ],
];

const BOTOES_DIAS: BotaoInlineTelegram[][] = [
  [
    { text: "Seg", callback_data: "/segunda" },
    { text: "Ter", callback_data: "/terca" },
    { text: "Qua", callback_data: "/quarta" },
    { text: "Qui", callback_data: "/quinta" },
    { text: "Sex", callback_data: "/sexta" },
    { text: "Sáb", callback_data: "/sabado" },
  ],
  [
    { text: "🗓️ Semana inteira", callback_data: "/semana" },
    { text: "🔔 Avisos", callback_data: "/avisos" },
  ],
];

const ajuda = [
  "🎓 SAGA • Assistente Acadêmico Unisapiens",
  "",
  "Comandos rápidos:",
  "• /start — inscrever-se e abrir menu interativo",
  "• /hoje ou /horario — imagem das aulas de hoje",
  "• /amanha — imagem das aulas de amanhã",
  "• /semana — resumo completo das aulas da semana",
  "• /segunda, /terca, /quarta, /quinta, /sexta, /sabado — aulas do dia",
  "• /minhaturma — ver sua turma vinculada",
  "• /turmas [busca ou página] — listar ou buscar turmas (ex.: /turmas SI)",
  "• /turma ID — selecionar sua turma pelo número",
  "• /avisos — últimos avisos da sua turma",
  "• /sair — pausar notificações",
].join("\n");

function diaAmanhaPV(): string {
  const { iso } = diaHojePV();
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const mapa: Record<number, string> = { 1: "SEGUNDA", 2: "TERCA", 3: "QUARTA", 4: "QUINTA", 5: "SEXTA", 6: "SABADO" };
  return mapa[d.getUTCDay()] ?? "SEGUNDA";
}

export async function receberAtualizacao(update: Atualizacao) {
  if (!Number.isSafeInteger(update.update_id) || (update.update_id ?? -1) < 0) return;
  const evento = String(update.update_id);
  try { await prisma.telegramEvento.create({ data: { updateId: evento } }); }
  catch (erro) { if ((erro as { code?: string })?.code === "P2002") return; throw erro; }
  try {
    const msg = chatPrivado(update);
    if (!msg) return; // Em grupos, nenhum cadastro automático; exige conversa privada.
    if (msg.callbackQueryId) {
      await responderCallbackTelegram(msg.callbackQueryId);
    }
    const chatId = String(msg.chat.id);
    const { nome, argumento } = interpretarComando(msg.text);
    const inscrito = await prisma.telegramAssinante.findUnique({ where: { chatId }, include: { grupo: true } });

    if (nome === "start" || nome === "inscrever" || nome === "menu") {
      const atualizado = await prisma.telegramAssinante.upsert({
        where: { chatId },
        create: { chatId, nome: String(msg.from?.first_name ?? "Aluno").slice(0, 90), ativo: true },
        update: { ativo: true, cancelouEm: null, aceitouEm: new Date(), nome: String(msg.from?.first_name ?? inscrito?.nome ?? "Aluno").slice(0, 90) },
        include: { grupo: true },
      });
      const saudacao = atualizado.grupo
        ? `✅ Inscrição ativa, ${atualizado.nome ?? "Aluno"}!\n🎓 Sua turma atual: ${atualizado.grupo.nome}\n\nUse os botões abaixo ou envie um comando:`
        : `✅ Inscrição confirmada, ${atualizado.nome ?? "Aluno"}!\nVocê receberá os avisos acadêmicos do SAGA.\n\n👉 Primeiro passo: escolha sua turma clicando em "🔄 Trocar Turma" ou enviando /turmas.`;
      await enviarMensagem(chatId, `${saudacao}\n\n${ajuda}`, { botoes: BOTOES_MENU });
      return;
    }

    if (nome === "sair" || nome === "stop" || nome === "cancelar") {
      if (inscrito) {
        await prisma.telegramAssinante.update({ where: { chatId }, data: { ativo: false, cancelouEm: new Date() } });
        await prisma.telegramMensagem.updateMany({ where: { assinanteId: inscrito.id, status: "PENDENTE" }, data: { status: "CANCELADO" } });
      }
      await enviarMensagem(chatId, "🔕 Inscrição pausada. Você não receberá novos avisos.\nPara reativar quando quiser, envie /start.", {
        botoes: [[{ text: "🔔 Reativar inscrição (/start)", callback_data: "/start" }]],
      });
      return;
    }

    if (nome === "help" || nome === "ajuda") {
      await enviarMensagem(chatId, ajuda, { botoes: BOTOES_MENU });
      return;
    }

    if (!inscrito?.ativo) {
      await enviarMensagem(chatId, "Para receber avisos e consultar o horário, envie /start. Você pode cancelar com /sair.", {
        botoes: [[{ text: "✅ Inscrever-se agora (/start)", callback_data: "/start" }]],
      });
      return;
    }

    if (nome === "minhaturma" || nome === "perfil" || nome === "status") {
      if (!inscrito.grupo) {
        await enviarMensagem(chatId, "🎓 Você ainda não selecionou uma turma.\nClique abaixo para escolher sua turma:", {
          botoes: [[{ text: "🎓 Escolher minha turma", callback_data: "/turmas 1" }]],
        });
        return;
      }
      const oferta = await prisma.oferta.findFirst({ where: { status: "PUBLICADA" }, orderBy: { codigo: "desc" } });
      const qtdAulas = oferta
        ? await prisma.turma.count({ where: { ofertaId: oferta.id, grupoId: inscrito.grupo.id, consomeDeId: null } })
        : 0;
      await enviarMensagem(
        chatId,
        `🎓 Sua turma atual:\n• ${inscrito.grupo.nome}\n• Semestre publicado: ${oferta?.codigo ?? "—"}\n• Disciplinas na semana: ${qtdAulas}\n\nO que deseja consultar?`,
        { botoes: BOTOES_MENU }
      );
      return;
    }

    if (nome === "turmas") {
      const argLimpo = argumento.trim();
      const paginaNum = idPositivo(argLimpo);
      const ehBusca = argLimpo.length > 0 && paginaNum === null;
      const pagina = paginaNum ?? 1;

      const todas = await prisma.grupoAlunos.findMany({ include: { curso: true }, orderBy: { nome: "asc" } });
      const filtradas = ehBusca
        ? todas.filter((g) => `${g.nome} ${g.curso.nome} ${g.curso.sigla}`.toLowerCase().includes(argLimpo.toLowerCase()))
        : todas;

      const porPagina = 10;
      const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
      const pagAtual = Math.min(Math.max(1, pagina), totalPaginas);
      const fatia = filtradas.slice((pagAtual - 1) * porPagina, pagAtual * porPagina);

      if (!fatia.length) {
        await enviarMensagem(chatId, "Não encontrei turmas para esse filtro. Tente /turmas 1 ou /turmas SI.", {
          botoes: [[{ text: "📋 Ver todas as turmas", callback_data: "/turmas 1" }]],
        });
        return;
      }

      const botoesTurmas: BotaoInlineTelegram[][] = [];
      for (let i = 0; i < fatia.length; i += 2) {
        const linha: BotaoInlineTelegram[] = fatia.slice(i, i + 2).map((g) => ({
          text: `${inscrito.grupoId === g.id ? "✅ " : ""}${g.nome.slice(0, 26)}`,
          callback_data: `/turma ${g.id}`,
        }));
        botoesTurmas.push(linha);
      }
      if (!ehBusca && totalPaginas > 1) {
        const nav: BotaoInlineTelegram[] = [];
        if (pagAtual > 1) nav.push({ text: `⬅️ Pág. ${pagAtual - 1}`, callback_data: `/turmas ${pagAtual - 1}` });
        if (pagAtual < totalPaginas) nav.push({ text: `Pág. ${pagAtual + 1} ➡️`, callback_data: `/turmas ${pagAtual + 1}` });
        if (nav.length) botoesTurmas.push(nav);
      }

      await enviarMensagem(
        chatId,
        `🎓 Turmas disponíveis (${ehBusca ? `filtro "${argLimpo}"` : `página ${pagAtual}/${totalPaginas}`}):\n\n${fatia.map((g) => `• ${g.id} — ${g.nome}`).join("\n")}\n\nToque no botão da sua turma abaixo ou envie /turma ID:`,
        { botoes: botoesTurmas }
      );
      return;
    }

    if (nome === "turma") {
      const id = idPositivo(argumento);
      if (!id) {
        await enviarMensagem(chatId, "Informe o número da turma. Ex.: /turma 12. Veja /turmas.", {
          botoes: [[{ text: "📋 Listar turmas", callback_data: "/turmas 1" }]],
        });
        return;
      }
      const grupo = await prisma.grupoAlunos.findUnique({ where: { id } });
      if (!grupo) {
        await enviarMensagem(chatId, "Turma não encontrada. Veja /turmas.", {
          botoes: [[{ text: "📋 Listar turmas", callback_data: "/turmas 1" }]],
        });
        return;
      }
      await prisma.telegramAssinante.update({ where: { chatId }, data: { grupoId: id } });
      await enviarMensagem(
        chatId,
        `✅ Turma selecionada: ${grupo.nome}!\n\nAgora você receberá os avisos desta turma e pode consultar os horários nos botões abaixo:`,
        { botoes: BOTOES_MENU }
      );
      return;
    }

    if (nome === "avisos") {
      const filtroGrupo = inscrito.grupoId ? { grupoId: inscrito.grupoId } : {};
      let avisos = await prisma.aviso.findMany({
        where: filtroGrupo,
        include: { grupo: true },
        orderBy: { criadoEm: "desc" },
        take: 5,
      });
      let titulo = inscrito.grupo ? `🔔 Últimos avisos de ${inscrito.grupo.nome}:` : "🔔 Últimos avisos do SAGA:";
      if (!avisos.length && inscrito.grupoId) {
        avisos = await prisma.aviso.findMany({ include: { grupo: true }, orderBy: { criadoEm: "desc" }, take: 5 });
        titulo = `🔔 Nenhum aviso específico para ${inscrito.grupo?.nome}. Últimos avisos gerais:`;
      }
      await enviarMensagem(
        chatId,
        avisos.length
          ? `${titulo}\n\n${avisos.map((a) => `📌 ${a.grupo.nome}:\n${a.conteudo}`).join("\n\n")}`.slice(0, 3900)
          : "Nenhum aviso registrado ainda.",
        { botoes: BOTOES_MENU }
      );
      return;
    }

    if (nome === "semana") {
      if (!inscrito.grupoId) {
        await enviarMensagem(chatId, "Selecione primeiro sua turma: use /turmas e depois /turma ID.", {
          botoes: [[{ text: "🎓 Escolher minha turma", callback_data: "/turmas 1" }]],
        });
        return;
      }
      const oferta = await prisma.oferta.findFirst({ where: { status: "PUBLICADA" }, orderBy: { codigo: "desc" } });
      if (!oferta) {
        await enviarMensagem(chatId, "Não existe semestre publicado no SAGA no momento.");
        return;
      }
      const aulas = await prisma.turma.findMany({
        where: { ofertaId: oferta.id, grupoId: inscrito.grupoId, consomeDeId: null },
        include: { disciplina: true, professor: true, ambiente: true },
        orderBy: [{ horaInicio: "asc" }, { id: "asc" }],
      });
      if (!aulas.length) {
        await enviarMensagem(chatId, `Nenhuma aula cadastrada na semana para ${inscrito.grupo?.nome ?? "sua turma"}.`);
        return;
      }
      const blocosPorDia: string[] = [];
      for (const d of DIAS) {
        const doDia = aulas.filter((a) => a.diaSemana === d);
        if (!doDia.length) continue;
        const itens = doDia.map((a) => {
          const online = ["SINCRONA", "ASSINCRONA"].includes(a.formato ?? a.disciplina.formato);
          const local = online ? "ON-LINE" : a.ambiente?.codigo ?? "Sala comum";
          const hr = a.horaInicio != null && a.horaFim != null ? `${minutosEmHora(a.horaInicio)}–${minutosEmHora(a.horaFim)}` : "EAD";
          return `  • ${hr} — ${a.nomeNaPlanilha ?? a.disciplina.nome}\n    📍 ${local} · 👨‍🏫 ${a.professor?.nome ?? "A definir"}`;
        });
        blocosPorDia.push(`📅 ${DIA_NOME[d] ?? d}:\n${itens.join("\n")}`);
      }
      await enviarMensagem(
        chatId,
        `🗓️ Horário da Semana • ${inscrito.grupo?.nome ?? ""}\nSemestre ${oferta.codigo}\n\n${blocosPorDia.join("\n\n")}`.slice(0, 3900),
        { botoes: BOTOES_DIAS }
      );
      return;
    }

    if (nome === "horario" || nome === "hoje" || nome === "amanha" || DIAS_TELEGRAM[nome]) {
      if (!inscrito.grupoId) {
        await enviarMensagem(chatId, "Selecione primeiro sua turma: use /turmas e depois /turma ID.", {
          botoes: [[{ text: "🎓 Escolher minha turma", callback_data: "/turmas 1" }]],
        });
        return;
      }
      const diaAlvo = nome === "amanha" ? diaAmanhaPV() : DIAS_TELEGRAM[nome];
      const result = await horarioPng(inscrito.grupoId, diaAlvo);
      if (!result) {
        await enviarMensagem(chatId, "Hoje não há aulas regulares. Escolha um dia abaixo:", { botoes: BOTOES_DIAS });
        return;
      }
      if ("erro" in result) {
        await enviarMensagem(chatId, result.erro ?? "Erro ao gerar horário.", { botoes: BOTOES_DIAS });
        return;
      }
      await enviarFoto(chatId, result.imagem, result.legenda, BOTOES_DIAS);
      return;
    }

    await enviarMensagem(chatId, ajuda, { botoes: BOTOES_MENU });
  } catch (e) {
    // Se houve erro de rede, permitir retry do update. As operações de cadastro são idempotentes.
    await prisma.telegramEvento.deleteMany({ where: { updateId: evento } });
    throw e;
  }
}
