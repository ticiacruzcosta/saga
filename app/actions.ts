"use server";

import { exigirUsuario } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/atividade";
import { chamadaTelegram, enviarMensagem, modoTelegram, sincronizarComandosTelegram, telegramConfigurado } from "@/lib/telegram/api";
import { receberAtualizacao } from "@/lib/telegram/handler";
import { carregarTurmas, ofertaAtual, paraValidar, paresRodizio } from "@/lib/dados";
import { sugerirSigla } from "@/lib/cursos-importacao";
import { norm } from "@/lib/texto";
import { DIA_BANCO, ehLab, hojeData } from "@/lib/vm";
import { faixa, horaParaMinutos } from "@/lib/rotulos";
import { validarTurma, type Conflito, type DiaSemana, type Formato } from "@/lib/validacao-choque";
import type { OfertaInput, ResultadoOferta } from "@/lib/tipos";

const atualizar = () => revalidatePath("/");

const FORMATO_BANCO: Record<string, Formato> = {
  Presencial: "PRESENCIAL", "Híbrida": "HIBRIDA", "Síncrona": "SINCRONA", "Assíncrona": "ASSINCRONA",
};

/** "40" ou "40h" -> 40; vazio -> null */
const horas = (txt: string) => {
  const n = parseInt(txt, 10);
  return Number.isNaN(n) ? null : n;
};

/** Campo "Ativar Rodízio?" da tela -> colunas da disciplina */
const rodizioBanco = (txt: string) => ({
  permiteRodizio: txt !== "Não",
  tipoRodizio: txt === "Sim (2x2)" ? "2X2" : txt === "Sim (1x1)" ? "1X1" : "NAO",
});

// ---------------------------------------------------------------- nova oferta (cadastro e edição)

type Plano = {
  disciplinaId: number | null;
  nomeNovo: string;
  formato: Formato;
  diaBanco: string | null;
  inicio: number | null;
  fim: number | null;
  ambienteId: number | null;
  ambienteCodigo: string | null;
  vagas: number | null;
};

async function planejar(input: OfertaInput): Promise<{ conflitos: Conflito[]; plano: Plano | null; erro?: string }> {
  const oferta = await ofertaAtual();
  if (!oferta) return { conflitos: [], plano: null, erro: "Nenhuma oferta no banco. Importe a planilha de oferta." };
  const nome = input.nome.trim();
  if (!nome || !input.grupoId) return { conflitos: [], plano: null };

  const [grupo, prof, habilitacoes, disciplinas, ambientes, existentesBrutos, pares] = await Promise.all([
    prisma.grupoAlunos.findUnique({ where: { id: input.grupoId } }),
    input.profId ? prisma.professor.findUnique({ where: { id: input.profId } }) : null,
    input.profId ? prisma.professorDisciplina.findMany({ where: { professorId: input.profId } }) : [],
    prisma.disciplina.findMany(),
    prisma.ambiente.findMany({ orderBy: { codigo: "asc" } }),
    carregarTurmas(oferta.id),
    paresRodizio(),
  ]);
  if (!grupo) return { conflitos: [], plano: null, erro: "Turma não encontrada." };

  // Edição: a aula não pode conflitar com ela mesma
  const editada = input.turmaId ? existentesBrutos.find((t) => t.id === input.turmaId) ?? null : null;
  if (input.turmaId && !editada) return { conflitos: [], plano: null, erro: "Aula não encontrada nesta oferta." };

  // A disciplina já existe? (compara sem acento e sem pontuação)
  const alvo = norm(nome);
  let disc =
    (editada && alvo === norm(editada.nomeNaPlanilha ?? editada.disciplina.nome) ? editada.disciplina : null) ??
    disciplinas.find((d) => norm(d.nome) === alvo) ?? null;
  if (!disc && alvo.length >= 6) {
    const parecidas = disciplinas.filter((d) => norm(d.nome).includes(alvo));
    if (parecidas.length === 1) disc = parecidas[0];
  }

  // Na edição vale o formato escolhido; no cadastro, disciplina EAD mantém o formato dela
  const escolhido: Formato = FORMATO_BANCO[input.formato] ?? "PRESENCIAL";
  const formato: Formato =
    !editada && disc && (disc.formato === "ASSINCRONA" || disc.formato === "SINCRONA") && escolhido === "PRESENCIAL"
      ? (disc.formato as Formato)
      : escolhido;
  const assincrona = formato === "ASSINCRONA";
  const diaBanco = DIA_BANCO[input.dia] ?? null;

  // Horário informado pelo usuário (no cadastro ou na edição): usa exatamente esse horário;
  // se ficar em branco no cadastro, escolhe automaticamente pelo turno da turma.
  const iniDigitado = input.inicio ? horaParaMinutos(input.inicio) : null;
  const fimDigitado = input.fim ? horaParaMinutos(input.fim) : null;
  const informouHorario = Boolean(input.inicio || input.fim);
  if ((editada || informouHorario) && !assincrona && (iniDigitado == null || fimDigitado == null || fimDigitado <= iniDigitado)) {
    return { conflitos: [], plano: null, erro: "Informe o horário de início e fim (o fim depois do início)." };
  }
  const duracao = (editada || informouHorario) && !assincrona ? fimDigitado! - iniDigitado! : disc?.duracaoMinutos ?? 165;
  const baseInicio = grupo.turno === "VESPERTINO" ? 15 * 60 : 19 * 60;
  // Aula curta (extensão = 1h): tenta 19:00, 20:00, 21:00. Aula normal: bloco único.
  const horarios: Array<number | null> =
    assincrona ? [null] : editada || informouHorario ? [iniDigitado] : duracao <= 90 ? [0, 1, 2].map((k) => baseInicio + k * duracao) : [baseInicio];

  const fixo = disc?.ambienteFixoId ?? ambientes.find((a) => a.codigo === input.lockSala)?.id ?? null;
  const exigeLab = disc?.tipoAmbiente === "LABORATORIO" || input.reqespaco === "Laboratório/Prático";
  // Laboratórios com capacidade conhecida primeiro; os sem capacidade cadastrada só como último recurso
  const labs = ambientes
    .filter((a) => a.tipo === "LABORATORIO")
    .sort((a, b) => Number(a.capacidade == null) - Number(b.capacidade == null) || a.codigo.localeCompare(b.codigo));
  const salasTeste: Array<number | null> =
    assincrona || formato === "SINCRONA" ? [null] : fixo ? [fixo] : exigeLab ? labs.map((l) => l.id) : [null];

  const vagas = input.alunos ?? disc?.limiteAlunos ?? grupo.qtdAlunos ?? null;
  const existentes = existentesBrutos.filter((t) => t.id !== input.turmaId).map(paraValidar);
  const permiteRodizio = disc?.permiteRodizio ?? input.rodizio !== "Não";

  let primeiro: { conflitos: Conflito[]; plano: Plano } | null = null;
  let pontosMelhor = Infinity;
  for (const inicio of horarios) {
    for (const salaId of salasTeste) {
      const amb = salaId ? ambientes.find((a) => a.id === salaId) ?? null : null;
      const fim = inicio != null ? inicio + duracao : null;
      const conflitos = validarTurma(
        {
          grupoId: grupo.id,
          disciplinaId: disc?.id ?? 0,
          disciplinaNome: disc?.nome ?? nome,
          disciplinaCodigo: disc?.codigo ?? "",
          cursoId: grupo.cursoId,
          periodo: grupo.periodo ?? 0,
          letra: grupo.letra,
          turno: grupo.turno,
          formato,
          professorId: prof?.id ?? null,
          professorNome: prof?.nome,
          ambienteId: amb?.id ?? null,
          ambienteCodigo: amb?.codigo,
          ambienteCapacidade: amb?.capacidade ?? null,
          diaSemana: assincrona ? null : ((diaBanco as DiaSemana | null) ?? null),
          horaInicio: assincrona ? null : inicio,
          horaFim: assincrona ? null : fim,
          vagas,
          limiteAlunos: disc?.limiteAlunos ?? null,
          permiteRodizio,
        },
        existentes,
        pares
      );

      if (prof && diaBanco && !assincrona && prof.diasIndisponiveis?.split(",").includes(diaBanco)) {
        conflitos.push({ regra: "RN-01", gravidade: "ERRO", mensagem: `${prof.nome} não dá aula neste dia (cadastro do professor).` });
      }
      if (prof && disc && habilitacoes.length > 0 && !habilitacoes.some((h) => h.disciplinaId === disc!.id)) {
        conflitos.push({ regra: "RN-HAB", gravidade: "AVISO", mensagem: `${prof.nome} nunca lecionou ${disc.nome}. Confirme se está certo.` });
      }
      if (exigeLab && !fixo && !amb && !assincrona && formato !== "SINCRONA") {
        conflitos.push({ regra: "RN-AMB", gravidade: "ERRO", mensagem: "Nenhum laboratório cadastrado para esta disciplina prática." });
      }

      if (amb && amb.capacidade == null && vagas != null) {
        conflitos.push({ regra: "RN-07", gravidade: "AVISO", mensagem: `A capacidade de ${amb.codigo} não está cadastrada. Confirme se cabem ${vagas} alunos.` });
      }

      const plano: Plano = {
        disciplinaId: disc?.id ?? null, nomeNovo: nome.toUpperCase(), formato,
        diaBanco: assincrona ? null : diaBanco, inicio: assincrona ? null : inicio, fim: assincrona ? null : fim,
        ambienteId: amb?.id ?? null, ambienteCodigo: amb?.codigo ?? null, vagas,
      };
      // Guarda a tentativa com menos problemas, para mostrar o motivo principal se nada couber
      const pontos = conflitos.filter((c) => c.gravidade === "ERRO").length * 100 + conflitos.length;
      if (pontos < pontosMelhor) {
        pontosMelhor = pontos;
        primeiro = { conflitos, plano };
      }
      if (!conflitos.some((c) => c.gravidade === "ERRO")) return { conflitos, plano };
    }
  }
  // Nenhuma combinação livre: mostra os problemas da primeira tentativa
  return primeiro ?? { conflitos: [], plano: null };
}

function resumo(p: Plano | null): string {
  if (!p) return "";
  if (!p.diaBanco) return "EAD (sem dia e horário)";
  return `${p.diaBanco.replace("TERCA", "TERÇA").replace("SABADO", "SÁBADO")} ${faixa(p.inicio, p.fim)}${p.ambienteCodigo ? ` em ${p.ambienteCodigo}` : ""}`;
}

/** Chamada enquanto a janela "Nova Oferta" é preenchida: só confere, não grava. */
export async function conferirOferta(input: OfertaInput): Promise<ResultadoOferta> {
  await exigirUsuario();
  const r = await planejar(input);
  const conflitos = r.conflitos.map((c) => ({ gravidade: c.gravidade, mensagem: c.mensagem }));
  return { ok: Boolean(r.plano) && !conflitos.some((c) => c.gravidade === "ERRO"), conflitos, resumo: resumo(r.plano), erro: r.erro };
}

/** "Salvar Oferta": confere de novo no servidor e grava a turma (e a disciplina, se for nova). */
export async function cadastrarOferta(input: OfertaInput): Promise<ResultadoOferta> {
  const eu = await exigirUsuario();
  const r = await planejar(input);
  const conflitos = r.conflitos.map((c) => ({ gravidade: c.gravidade, mensagem: c.mensagem }));
  if (!r.plano || r.erro || conflitos.some((c) => c.gravidade === "ERRO")) {
    return { ok: false, conflitos, resumo: resumo(r.plano), erro: r.erro };
  }
  const oferta = await ofertaAtual();
  const grupo = input.grupoId ? await prisma.grupoAlunos.findUnique({ where: { id: input.grupoId } }) : null;
  if (!oferta || !grupo) return { ok: false, conflitos, resumo: "", erro: "Oferta ou turma não encontrada." };
  const p = r.plano;

  let disciplinaId = p.disciplinaId;
  if (!disciplinaId) {
    const nova = await prisma.disciplina.create({
      data: {
        nome: p.nomeNovo, codigo: null, formato: p.formato,
        tipoAmbiente: input.reqespaco === "Laboratório/Prático" ? "LABORATORIO" : "SALA",
        ambienteFixoId: input.lockSala ? (await prisma.ambiente.findUnique({ where: { codigo: input.lockSala } }))?.id ?? null : null,
        ...rodizioBanco(input.rodizio),
        cargaTeorica: horas(input.cht), cargaPratica: horas(input.chp),
        observacoes: "Cadastrada pelo sistema (sem código de matriz)",
      },
    });
    disciplinaId = nova.id;
  }

  const dados = {
    disciplinaId, grupoId: grupo.id, letra: grupo.letra,
    professorId: input.profId, ambienteId: p.ambienteId, formato: p.formato,
    diaSemana: p.diaBanco, horaInicio: p.inicio, horaFim: p.fim, turno: grupo.turno, vagas: p.vagas,
  };
  if (input.turmaId) {
    const antes = await prisma.turma.findUnique({ where: { id: input.turmaId }, include: { disciplina: true } });
    const mesmoNome = antes && norm(input.nome) === norm(antes.nomeNaPlanilha ?? antes.disciplina.nome);
    await prisma.$transaction([
      prisma.turma.update({ where: { id: input.turmaId }, data: { ...dados, nomeNaPlanilha: mesmoNome ? antes!.nomeNaPlanilha : null } }),
      // quem assiste junto acompanha dia, horário, sala e professor
      prisma.turma.updateMany({
        where: { consomeDeId: input.turmaId },
        data: { diaSemana: p.diaBanco, horaInicio: p.inicio, horaFim: p.fim, ambienteId: p.ambienteId, professorId: input.profId },
      }),
      // carga horária e rodízio são da disciplina (valem para todas as turmas dela)
      prisma.disciplina.update({
        where: { id: disciplinaId },
        data: {
          cargaTeorica: horas(input.cht), cargaPratica: horas(input.chp), ...rodizioBanco(input.rodizio),
        },
      }),
    ]);
    await registrar(eu, "Edição de aula", `${input.nome.trim()} (${grupo.nome}): ${resumo(p)}`);
  } else {
    await prisma.turma.create({ data: { ofertaId: oferta.id, ...dados } });
    await registrar(eu, "Nova oferta", `${input.nome.trim()} (${grupo.nome}): ${resumo(p)}`);
  }
  atualizar();
  return { ok: true, conflitos, resumo: resumo(p) };
}

// ---------------------------------------------------------------- dashboard

export async function salvarAlteracao(input: {
  turmaId: number;
  salaId: number | null;
  profId: number | null;
  cancelada?: boolean;
  motivo?: string;
  dataIso?: string;
  mensagemCustomizada?: string;
  gerarAviso?: boolean;
}) {
  const eu = await exigirUsuario();
  const turma = await prisma.turma.findUnique({
    where: { id: input.turmaId }, include: { ambiente: true, professor: true, disciplina: true, grupo: true },
  });
  if (!turma) return { ok: false, erro: "Turma não encontrada." };
  const sala = input.salaId ? await prisma.ambiente.findUnique({ where: { id: input.salaId } }) : null;
  const prof = input.profId ? await prisma.professor.findUnique({ where: { id: input.profId } }) : null;
  if (input.salaId && !sala) return { ok: false, erro: "Sala não encontrada." };
  if (input.profId && !prof) return { ok: false, erro: "Professor não encontrado." };

  const data = input.dataIso && /^\d{4}-\d{2}-\d{2}$/.test(input.dataIso) ? new Date(`${input.dataIso}T00:00:00.000Z`) : hojeData();
  const dataBr = data.toISOString().slice(0, 10).split("-").reverse().join("/");
  const atuais = await prisma.alteracao.findMany({
    where: { turmaId: turma.id, data, tipo: { in: ["TROCA_SALA", "TROCA_PROFESSOR", "CANCELAMENTO"] } }, orderBy: { criadaEm: "asc" },
  });
  const salaBase = turma.ambiente?.codigo ?? "Sala comum";
  const profBase = turma.professor?.nome ?? "A definir";
  const salaAtual = atuais.filter((a) => a.tipo === "TROCA_SALA").at(-1)?.valorNovo ?? salaBase;
  const profAtual = atuais.filter((a) => a.tipo === "TROCA_PROFESSOR").at(-1)?.valorNovo ?? profBase;
  const cancelamentoAtual = atuais.filter((a) => a.tipo === "CANCELAMENTO").at(-1);
  const estavaCancelada = Boolean(cancelamentoAtual);
  const motivoLimpo = input.motivo?.trim().slice(0, 240) || null;

  const aula = turma.nomeNaPlanilha ?? turma.disciplina.nome;
  const nomeTurma = turma.grupo?.nome ?? "Turma";
  const criarAviso = input.gerarAviso !== false;

  // Caso 1: Cancelar a aula no dia
  if (input.cancelada) {
    const motivoMudou = (cancelamentoAtual?.motivo ?? null) !== motivoLimpo;
    if (estavaCancelada && !motivoMudou && !input.mensagemCustomizada?.trim()) return { ok: true };
    const padrao = `NÃO HAVERÁ AULA de ${aula} na turma ${nomeTurma} em ${dataBr}.${motivoLimpo ? ` Motivo: ${motivoLimpo}.` : ""}`;
    const mensagem = input.mensagemCustomizada?.trim() || padrao;
    await prisma.$transaction(async (tx) => {
      await tx.alteracao.deleteMany({ where: { turmaId: turma.id, data, tipo: "CANCELAMENTO" } });
      await tx.alteracao.create({
        data: {
          turmaId: turma.id,
          data,
          tipo: "CANCELAMENTO",
          valorAnterior: `${salaAtual} · ${profAtual}`,
          valorNovo: "SEM AULA",
          motivo: motivoLimpo,
          mensagemGerada: mensagem,
        },
      });
      if (criarAviso && turma.grupoId) {
        await tx.aviso.create({ data: { grupoId: turma.grupoId, conteudo: mensagem, status: "PENDENTE" } });
      }
    });
    await registrar(eu, "Cancelamento de aula", mensagem);
    atualizar();
    revalidatePath("/bot-telegram");
    revalidatePath("/bot-whatsapp");
    return { ok: true, resumo: "Aula cancelada" };
  }

  // Caso 2: Reativar aula que estava cancelada e/ou alterar sala/professor
  const salaNova = sala?.codigo ?? salaBase;
  const profNovo = prof?.nome ?? profBase;
  const salaMudou = salaNova !== salaAtual;
  const profMudou = profNovo !== profAtual;
  const reativou = estavaCancelada && input.cancelada === false;

  if (!salaMudou && !profMudou && !reativou) return { ok: true };

  const detalhes: string[] = [];
  if (reativou) detalhes.push("Aula confirmada/reativada");
  if (salaMudou) detalhes.push(`Sala: ${salaAtual} → ${salaNova}`);
  if (profMudou) detalhes.push(`Professor: ${profAtual} → ${profNovo}`);
  const padrao = reativou && !salaMudou && !profMudou
    ? `Aula confirmada em ${dataBr}: ${aula} (${nomeTurma}) acontecerá normalmente na sala/lab ${salaNova} com ${profNovo}.`
    : `Alteração de aula em ${dataBr}: ${aula} (${nomeTurma}). ${detalhes.join("; ")}.`;
  const mensagem = input.mensagemCustomizada?.trim() || padrao;

  await prisma.$transaction(async (tx) => {
    if (reativou) {
      await tx.alteracao.deleteMany({ where: { turmaId: turma.id, data, tipo: "CANCELAMENTO" } });
    }
    if (salaMudou) {
      await tx.alteracao.deleteMany({ where: { turmaId: turma.id, data, tipo: "TROCA_SALA" } });
      if (salaNova !== salaBase) await tx.alteracao.create({
        data: { turmaId: turma.id, data, tipo: "TROCA_SALA", valorAnterior: salaBase, valorNovo: salaNova, mensagemGerada: mensagem },
      });
    }
    if (profMudou) {
      await tx.alteracao.deleteMany({ where: { turmaId: turma.id, data, tipo: "TROCA_PROFESSOR" } });
      if (profNovo !== profBase) await tx.alteracao.create({
        data: { turmaId: turma.id, data, tipo: "TROCA_PROFESSOR", valorAnterior: profBase, valorNovo: profNovo, mensagemGerada: mensagem },
      });
    }
    // Cria UM aviso pendente para revisão no painel; nunca envia automaticamente aqui.
    if (criarAviso && turma.grupoId) {
      await tx.aviso.create({ data: { grupoId: turma.grupoId, conteudo: mensagem, status: "PENDENTE" } });
    }
  });
  await registrar(eu, reativou ? "Reativação de aula" : "Troca do dia", mensagem);
  atualizar();
  revalidatePath("/bot-telegram");
  revalidatePath("/bot-whatsapp");
  return { ok: true, resumo: reativou ? "Aula reativada" : "Alteração salva" };
}

export async function enviarAviso(input: { turmaId: number; mensagem: string }) {
  await exigirUsuario();
  const texto = input.mensagem.trim();
  if (!texto) return { ok: false, erro: "A mensagem do aviso não pode ficar vazia." };
  const turma = await prisma.turma.findUnique({ where: { id: input.turmaId } });
  if (!turma?.grupoId) return { ok: false, erro: "Esta turma não tem grupo de alunos vinculado." };
  await prisma.aviso.create({ data: { grupoId: turma.grupoId, conteudo: texto, status: "PENDENTE" } });
  atualizar();
  revalidatePath("/bot-telegram");
  revalidatePath("/bot-whatsapp");
  return { ok: true };
}

/** Edita o texto de um aviso antes do envio (e atualiza lotes ainda não concluídos). */
export async function editarAviso(input: { id: number; mensagem: string }) {
  const eu = await exigirUsuario();
  const texto = input.mensagem.trim();
  if (!texto) return { ok: false, erro: "A mensagem do aviso não pode ficar vazia." };
  const existente = await prisma.aviso.findUnique({ where: { id: input.id }, include: { grupo: true } });
  if (!existente) return { ok: false, erro: "Aviso não encontrado." };

  await prisma.$transaction(async (tx) => {
    await tx.aviso.update({
      where: { id: input.id },
      data: { conteudo: texto },
    });
    await tx.whatsappLote.updateMany({
      where: { avisoId: input.id, status: { not: "CONCLUIDO" } },
      data: { conteudo: `SAGA • Aviso acadêmico\nTurma: ${existente.grupo.nome}\n${texto}`.slice(0, 3900) },
    }).catch(() => {});
    await tx.telegramLote.updateMany({
      where: { avisoId: input.id, status: { not: "CONCLUIDO" } },
      data: { conteudo: `SAGA • Aviso acadêmico\nTurma: ${existente.grupo.nome}\n${texto}`.slice(0, 3900) },
    }).catch(() => {});
  });

  await registrar(eu, "Edição de aviso", `Editou o aviso de ${existente.grupo.nome}`);
  atualizar();
  revalidatePath("/bot-telegram");
  revalidatePath("/bot-whatsapp");
  return { ok: true };
}

/** Envio manual pelo WhatsApp: depois de mandar no grupo, a pessoa marca o aviso como enviado (ou volta para pendente). */
export async function marcarAviso(id: number, enviado: boolean) {
  const eu = await exigirUsuario();
  const jaEnfileirado = await prisma.whatsappLote.findUnique({ where: { avisoId: id }, select: { id: true } });
  if (jaEnfileirado) return { ok: false, erro: "Este aviso já entrou na fila do bot. Gerencie-o no painel WhatsApp." };
  if (!enviado) {
    await prisma.telegramLote.deleteMany({ where: { avisoId: id } }).catch(() => {});
  }
  const aviso = await prisma.aviso.update({
    where: { id },
    data: { status: enviado ? "ENVIADO" : "PENDENTE" },
    include: { grupo: true },
  });
  await registrar(eu, "Aviso", `${enviado ? "Marcou como enviado" : "Voltou para pendente"} o aviso de ${aviso.grupo.nome}`);
  atualizar();
  return { ok: true };
}

/** Disparo integrado pelo Telegram direto do Histórico de Avisos: valida chave, envia aos inscritos e atualiza status. */
export async function enviarAvisoTelegram(id: number, mensagemEditada?: string) {
  const eu = await exigirUsuario();
  if (!telegramConfigurado()) {
    return { ok: false, erro: "Chave do Telegram não configurada." };
  }
  let aviso = await prisma.aviso.findUnique({ where: { id }, include: { grupo: true } });
  if (!aviso) return { ok: false, erro: "Aviso não encontrado." };

  const novoTexto = mensagemEditada?.trim();
  if (novoTexto && novoTexto !== aviso.conteudo) {
    aviso = await prisma.aviso.update({
      where: { id },
      data: { conteudo: novoTexto },
      include: { grupo: true },
    });
  }

  try {
    // Valida a chave do bot junto à API oficial do Telegram
    await chamadaTelegram("getMe", {});
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao validar chave do Telegram." };
  }

  const assinantes = await prisma.telegramAssinante.findMany({ where: { ativo: true } });
  const conteudo = `SAGA • Aviso acadêmico\nTurma: ${aviso.grupo.nome}\n${aviso.conteudo}`.slice(0, 3900);
  const modo = modoTelegram();

  let lote = await prisma.telegramLote.findUnique({ where: { avisoId: id } });
  if (!lote) {
    lote = await prisma.telegramLote.create({
      data: { avisoId: id, conteudo, status: "CONFIRMADO", modoConfirmado: modo, confirmadoEm: new Date() },
    });
  } else {
    lote = await prisma.telegramLote.update({
      where: { id: lote.id },
      data: { status: "CONFIRMADO", modoConfirmado: lote.modoConfirmado ?? modo, confirmadoEm: new Date() },
    });
  }

  let enviadas = 0;
  let falhas = 0;
  let ultimoErro = "";

  for (const a of assinantes) {
    try {
      const res = await enviarMensagem(a.chatId, conteudo);
      await prisma.telegramMensagem.upsert({
        where: { loteId_assinanteId: { loteId: lote.id, assinanteId: a.id } },
        create: { loteId: lote.id, assinanteId: a.id, status: "ENVIADO", telegramId: String(res.message_id), tentativas: 1 },
        update: { status: "ENVIADO", telegramId: String(res.message_id), erro: null, tentativas: { increment: 1 } },
      });
      enviadas++;
    } catch (e) {
      falhas++;
      ultimoErro = e instanceof Error ? e.message : "Erro ao enviar mensagem";
      await prisma.telegramMensagem.upsert({
        where: { loteId_assinanteId: { loteId: lote.id, assinanteId: a.id } },
        create: { loteId: lote.id, assinanteId: a.id, status: "FALHOU", erro: ultimoErro.slice(0, 230), tentativas: 1 },
        update: { status: "FALHOU", erro: ultimoErro.slice(0, 230), tentativas: { increment: 1 } },
      });
    }
  }

  const semProblemas = falhas === 0;
  await prisma.telegramLote.update({
    where: { id: lote.id },
    data: { status: "CONCLUIDO" },
  });
  await prisma.aviso.update({
    where: { id },
    data: { status: semProblemas ? "ENVIADO" : "FALHOU" },
  });
  await registrar(
    eu,
    "Aviso Telegram",
    semProblemas
      ? `Enviou aviso de ${aviso.grupo.nome} via Telegram (${enviadas} inscrito(s))`
      : `Falha ao enviar aviso de ${aviso.grupo.nome} via Telegram: ${ultimoErro}`
  );
  atualizar();
  revalidatePath("/bot-telegram");

  if (!semProblemas) {
    return { ok: false, erro: `Falha em ${falhas} envio(s) no Telegram: ${ultimoErro}` };
  }
  return {
    ok: true,
    resumo:
      assinantes.length > 0
        ? `Enviado pelo Telegram para ${enviadas} inscrito(s)!`
        : "Validado e registrado no Telegram sem problemas de chave ou envio!",
  };
}

/** Sincroniza comandos e interações do bot Telegram diretamente pela aba Status do Bot. */
export async function sincronizarBotPainel() {
  await exigirUsuario();
  if (!telegramConfigurado()) return { ok: false, erro: "Token do Telegram não configurado." };
  try {
    const me = await chamadaTelegram<{ username?: string; first_name?: string }>("getMe", {});
    const botUser = me.username ? `@${me.username}` : (me.first_name ?? "Bot");
    await sincronizarComandosTelegram();
    const updates = await chamadaTelegram<Array<{ update_id: number }>>("getUpdates", { limit: 25, timeout: 0 }).catch(() => []);
    for (const u of updates) {
      await receberAtualizacao(u);
    }
    atualizar();
    revalidatePath("/bot-telegram");
    return {
      ok: true,
      resumo: `Conectado a ${botUser}! Comandos sincronizados${updates.length ? ` e ${updates.length} interação(ões) recebida(s)` : ""}.`,
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao sincronizar o bot." };
  }
}

/** Atualiza a turma vinculada a um assinante do Telegram direto da aba Status do Bot. */
export async function definirTurmaAssinantePainel(assinanteId: number, grupoId: number | null) {
  await exigirUsuario();
  try {
    await prisma.telegramAssinante.update({
      where: { id: assinanteId },
      data: { grupoId },
    });
    atualizar();
    revalidatePath("/bot-telegram");
    return { ok: true };
  } catch {
    return { ok: false, erro: "Não foi possível atualizar a turma do aluno." };
  }
}

// ---------------------------------------------------------------- cadastros base

/** Cadastra (sem id) ou edita (com id) uma sala/laboratório. */
export async function criarSala(input: { id?: number; nome: string; tipo: string; cap: number | null; predio: string }) {
  const eu = await exigirUsuario();
  const codigo = input.nome.trim().toUpperCase();
  if (!codigo) return { ok: false, erro: "Informe a identificação." };
  const lab = input.tipo === "Laboratório/Prático";
  const dados = { nome: codigo, tipo: lab ? "LABORATORIO" : "SALA", capacidade: input.cap, predio: input.predio.trim() || null };
  if (input.id) {
    const atual = await prisma.ambiente.findUnique({ where: { id: input.id } });
    if (!atual) return { ok: false, erro: "Sala não encontrada." };
    // Não perde o tipo especial (lab de química, sala 26) se a categoria continuar a mesma
    if (ehLab(atual.tipo) === lab || (atual.tipo === "SALA_ESPECIFICA" && !lab)) dados.tipo = atual.tipo;
    try {
      await prisma.ambiente.update({ where: { id: input.id }, data: { codigo, ...dados } });
    } catch {
      return { ok: false, erro: `Já existe outra sala chamada ${codigo}.` };
    }
  } else {
    await prisma.ambiente.upsert({ where: { codigo }, update: dados, create: { codigo, ...dados } });
  }
  await registrar(eu, input.id ? "Edição de cadastro" : "Novo cadastro", `Sala ${codigo}`);
  atualizar();
  return { ok: true };
}

/** Cadastra (sem id) ou edita (com id) um professor. `dias`: dias em que NÃO pode dar aula (formato do banco). */
export async function criarProfessor(input: { id?: number; nome: string; email: string; dias?: string[] }) {
  const eu = await exigirUsuario();
  const nome = input.nome.trim().toUpperCase();
  if (!nome) return { ok: false, erro: "Informe o nome." };
  const dados = { email: input.email.trim() || null, diasIndisponiveis: input.dias?.length ? input.dias.join(",") : null };
  if (input.id) {
    try {
      await prisma.professor.update({ where: { id: input.id }, data: { nome, ...dados } });
    } catch {
      return { ok: false, erro: `Já existe outro professor chamado ${nome}.` };
    }
  } else {
    await prisma.professor.upsert({ where: { nome }, update: dados, create: { nome, ...dados } });
  }
  await registrar(eu, input.id ? "Edição de cadastro" : "Novo cadastro", `Professor ${nome}`);
  atualizar();
  return { ok: true };
}

const PALAVRAS_CURSO: Array<[string, string]> = [
  ["COMPUT", "ENG. COMPUTAÇÃO"], ["CIVIL", "ENG. CIVIL"], ["ELETRICA", "ENG. ELÉTRICA"], ["SOFTWARE", "ENG. SOFTWARE"],
  ["BIG DATA", "BIG DATA E I.A."], ["JOGOS", "JOGOS DIGITAIS"], ["SISTEMAS", "SIST. DE INFORM."], ["INFORM", "SIST. DE INFORM."],
];

/** Gera sigla única a partir do nome ou da sigla informada. */
function siglaUnica(nome: string, siglaInformada: string | undefined, usadas: Set<string>): string {
  const base = (siglaInformada?.trim().toUpperCase() || sugerirSigla(nome)).slice(0, 10);
  if (!usadas.has(base)) return base;
  let i = 2;
  while (usadas.has(`${base}${i}`)) i++;
  return `${base}${i}`.slice(0, 12);
}

/** Cadastrar ou editar um Curso. */
export async function criarCurso(input: { id?: number; nome: string; sigla?: string }) {
  const eu = await exigirUsuario();
  const nome = input.nome.trim().replace(/\s+/g, " ").toUpperCase();
  if (!nome) return { ok: false, erro: "Informe o nome do curso." };
  const existentes = await prisma.curso.findMany();
  const usadas = new Set(existentes.filter((c) => c.id !== input.id).map((c) => c.sigla.toUpperCase()));
  const sigla = siglaUnica(nome, input.sigla, usadas);
  try {
    if (input.id) await prisma.curso.update({ where: { id: input.id }, data: { nome, sigla } });
    else await prisma.curso.create({ data: { nome, sigla } });
  } catch {
    return { ok: false, erro: "Já existe um curso com esse nome ou sigla." };
  }
  await registrar(eu, input.id ? "Edição de cadastro" : "Novo cadastro", `Curso ${nome} (${sigla})`);
  atualizar();
  return { ok: true };
}

/** "Nova Turma" / editar: aceita curso selecionado (`cursoId`), novo curso (`novoCurso`) ou descoberta pelo nome. */
export async function criarGrupo(input: {
  id?: number;
  nome: string;
  cursoId?: number | null;
  novoCurso?: string;
  siglaCurso?: string;
  alunos: number | null;
  wa: string;
}) {
  const eu = await exigirUsuario();
  const nomeBruto = input.nome.trim();
  const n = norm(nomeBruto);
  if (!n) return { ok: false, erro: "Informe a turma ou período." };

  const cursos = await prisma.curso.findMany();
  let cursoEscolhido = input.cursoId ? cursos.find((c) => c.id === input.cursoId) ?? null : null;

  if (!cursoEscolhido && input.novoCurso?.trim()) {
    const nomeCursoNovo = input.novoCurso.trim().replace(/\s+/g, " ").toUpperCase();
    cursoEscolhido = cursos.find((c) => norm(c.nome) === norm(nomeCursoNovo)) ?? null;
    if (!cursoEscolhido) {
      const usadas = new Set(cursos.map((c) => c.sigla.toUpperCase()));
      const sigla = siglaUnica(nomeCursoNovo, input.siglaCurso, usadas);
      try {
        cursoEscolhido = await prisma.curso.create({ data: { nome: nomeCursoNovo, sigla } });
        await registrar(eu, "Novo cadastro", `Curso ${nomeCursoNovo} (${sigla})`);
      } catch {
        return { ok: false, erro: "Não foi possível criar o novo curso (nome ou sigla já existe)." };
      }
    }
  }

  if (!cursoEscolhido) {
    cursoEscolhido =
      cursos.find((c) => n.includes(norm(c.nome))) ??
      cursos.find((c) => c.nome === PALAVRAS_CURSO.find(([k]) => n.includes(k))?.[1]) ??
      null;
  }

  if (!cursoEscolhido) {
    return { ok: false, erro: "Selecione um curso ou informe o nome do novo curso." };
  }

  // Se o usuário digitou apenas o período/turma (ex.: "1º A" ou "4º Período") e selecionou o curso,
  // compomos o nome completo caso não contenha o nome do curso.
  const jaTemCursoNoNome = n.includes(norm(cursoEscolhido.nome)) || PALAVRAS_CURSO.some(([k]) => n.includes(k));
  const nomeFinal = (jaTemCursoNoNome ? nomeBruto : `${cursoEscolhido.nome} ${nomeBruto}`).replace(/\s+/g, " ").toUpperCase();
  const nFinal = norm(nomeFinal);

  const periodo = /\d+/.exec(nFinal)?.[0];
  const letra = nFinal.split(" ").find((t) => /^[A-D]$/.test(t)) ?? "A";
  const data = {
    nome: nomeFinal,
    cursoId: cursoEscolhido.id,
    periodo: periodo ? Number(periodo) : null,
    letra,
    turno: nFinal.includes("VESP") ? "VESPERTINO" : "NOTURNO",
    qtdAlunos: input.alunos,
    linkWhatsapp: input.wa.trim() || null,
  };
  try {
    if (input.id) await prisma.grupoAlunos.update({ where: { id: input.id }, data });
    else await prisma.grupoAlunos.create({ data });
  } catch {
    return { ok: false, erro: "Já existe uma turma com esse nome." };
  }
  await registrar(eu, input.id ? "Edição de cadastro" : "Novo cadastro", `Turma ${data.nome}`);
  atualizar();
  return { ok: true };
}

// ---------------------------------------------------------------- excluir

export type TipoCadastro = "sala" | "professor" | "turma" | "curso" | "aula";

/** Diz o que vai acontecer ao excluir, sem apagar nada. `pode = false` bloqueia. */
export async function previaExclusao(tipo: TipoCadastro, id: number): Promise<{ pode: boolean; mensagem: string }> {
  await exigirUsuario();
  if (tipo === "sala") {
    const a = await prisma.ambiente.findUnique({ where: { id }, include: { _count: { select: { turmas: true, disciplinasFixas: true } } } });
    if (!a) return { pode: false, mensagem: "Sala não encontrada." };
    const n = a._count.turmas;
    return { pode: true, mensagem: `Excluir ${a.codigo}?` + (n ? `\n\n${n} aula(s) dela passam para "Sala comum".` : "") + (a._count.disciplinasFixas ? `\n${a._count.disciplinasFixas} disciplina(s) deixam de ter esta sala fixa.` : "") };
  }
  if (tipo === "professor") {
    const p = await prisma.professor.findUnique({ where: { id }, include: { _count: { select: { turmas: true } } } });
    if (!p) return { pode: false, mensagem: "Professor não encontrado." };
    return { pode: true, mensagem: `Excluir ${p.nome}?` + (p._count.turmas ? `\n\n${p._count.turmas} aula(s) dele ficam com professor "A definir".` : "") };
  }
  if (tipo === "curso") {
    const c = await prisma.curso.findUnique({ where: { id }, include: { _count: { select: { grupos: true, matriz: true } } } });
    if (!c) return { pode: false, mensagem: "Curso não encontrado." };
    if (c._count.grupos) return { pode: false, mensagem: `O curso ${c.nome} possui ${c._count.grupos} turma(s) vinculada(s). Exclua ou altere as turmas antes.` };
    return { pode: true, mensagem: `Excluir o curso ${c.nome} (${c.sigla})?` + (c._count.matriz ? `\n\n${c._count.matriz} vínculo(s) da matriz curricular deste curso também serão removidos.` : "") };
  }
  if (tipo === "turma") {
    const g = await prisma.grupoAlunos.findUnique({ where: { id }, include: { _count: { select: { turmas: true, avisos: true } } } });
    if (!g) return { pode: false, mensagem: "Turma não encontrada." };
    if (g._count.turmas) return { pode: false, mensagem: `${g.nome} tem ${g._count.turmas} aula(s) cadastrada(s). Exclua as aulas dela em Ofertas & Disciplinas antes.` };
    return { pode: true, mensagem: `Excluir ${g.nome}?` + (g._count.avisos ? `\n\nO histórico de ${g._count.avisos} aviso(s) dela também é apagado.` : "") };
  }
  const t = await prisma.turma.findUnique({ where: { id }, include: { disciplina: true, grupo: true, consumidoras: { include: { grupo: true } }, _count: { select: { alteracoes: true } } } });
  if (!t) return { pode: false, mensagem: "Aula não encontrada." };
  return {
    pode: true,
    mensagem: `Excluir a aula ${t.nomeNaPlanilha ?? t.disciplina.nome} de ${t.grupo?.nome ?? "—"}?` +
      (t.consumidoras.length ? `\n\nAs turmas que assistem junto também perdem a aula: ${t.consumidoras.map((c) => c.grupo?.nome).join(", ")}.` : "") +
      (t._count.alteracoes ? `\n${t._count.alteracoes} alteração(ões) registrada(s) no dashboard também são apagadas.` : ""),
  };
}

export async function excluirCadastro(tipo: TipoCadastro, id: number): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirUsuario();
  const previa = await previaExclusao(tipo, id);
  if (!previa.pode) return { ok: false, erro: previa.mensagem };
  if (tipo === "sala") {
    const sala = await prisma.ambiente.delete({ where: { id } }); // aulas e disciplinas ficam sem sala (SET NULL)
    await registrar(eu, "Exclusão", `Sala ${sala.codigo}`);
  }
  if (tipo === "professor") {
    const professor = await prisma.professor.delete({ where: { id } }); // aulas ficam "A definir"
    await registrar(eu, "Exclusão", `Professor ${professor.nome}`);
  }
  if (tipo === "curso") {
    const [, curso] = await prisma.$transaction([prisma.matrizItem.deleteMany({ where: { cursoId: id } }), prisma.curso.delete({ where: { id } })]);
    await registrar(eu, "Exclusão", `Curso ${curso.nome}`);
  }
  if (tipo === "turma") {
    const [, grupo] = await prisma.$transaction([prisma.aviso.deleteMany({ where: { grupoId: id } }), prisma.grupoAlunos.delete({ where: { id } })]);
    await registrar(eu, "Exclusão", `Turma ${grupo.nome}`);
  }
  if (tipo === "aula") {
    const principal = await prisma.turma.findUnique({ where: { id }, include: { disciplina: true, grupo: true } });
    // quem assiste junto não tem aula própria: sai junto (as alterações caem em cascata)
    await prisma.$transaction([prisma.turma.deleteMany({ where: { consomeDeId: id } }), prisma.turma.delete({ where: { id } })]);
    await registrar(eu, "Exclusão", `Aula ${principal?.nomeNaPlanilha ?? principal?.disciplina.nome} (${principal?.grupo?.nome ?? "—"})`);
  }
  atualizar();
  return { ok: true };
}
