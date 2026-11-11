"use server";

import { exigirUsuario } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/atividade";
import { carregarTurmas, ofertaAtual, paraValidar, paresRodizio } from "@/lib/dados";
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

  // Edição com horário informado: usa exatamente esse horário (sem procurar outro)
  const iniDigitado = input.inicio ? horaParaMinutos(input.inicio) : null;
  const fimDigitado = input.fim ? horaParaMinutos(input.fim) : null;
  if (editada && !assincrona && (iniDigitado == null || fimDigitado == null || fimDigitado <= iniDigitado)) {
    return { conflitos: [], plano: null, erro: "Informe o horário de início e fim (o fim depois do início)." };
  }
  const duracao = editada && !assincrona ? fimDigitado! - iniDigitado! : disc?.duracaoMinutos ?? 165;
  const baseInicio = grupo.turno === "VESPERTINO" ? 15 * 60 : 19 * 60;
  // Aula curta (extensão = 1h): tenta 19:00, 20:00, 21:00. Aula normal: bloco único.
  const horarios: Array<number | null> =
    assincrona ? [null] : editada ? [iniDigitado] : duracao <= 90 ? [0, 1, 2].map((k) => baseInicio + k * duracao) : [baseInicio];

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
          disciplinaId: disc?.id ?? 0,
          disciplinaNome: disc?.nome ?? nome,
          disciplinaCodigo: disc?.codigo ?? "",
          cursoId: grupo.cursoId,
          periodo: grupo.periodo ?? 0,
          letra: grupo.letra,
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

export async function salvarAlteracao(input: { turmaId: number; salaId: number | null; profId: number | null }) {
  const eu = await exigirUsuario();
  const turma = await prisma.turma.findUnique({
    where: { id: input.turmaId }, include: { ambiente: true, professor: true, disciplina: true, grupo: true },
  });
  if (!turma) return { ok: false, erro: "Turma não encontrada." };
  const sala = input.salaId ? await prisma.ambiente.findUnique({ where: { id: input.salaId } }) : null;
  const prof = input.profId ? await prisma.professor.findUnique({ where: { id: input.profId } }) : null;
  if (input.salaId && !sala) return { ok: false, erro: "Sala não encontrada." };
  if (input.profId && !prof) return { ok: false, erro: "Professor não encontrado." };

  const data = hojeData();
  const atuais = await prisma.alteracao.findMany({
    where: { turmaId: turma.id, data, tipo: { in: ["TROCA_SALA", "TROCA_PROFESSOR"] } }, orderBy: { criadaEm: "asc" },
  });
  const salaBase = turma.ambiente?.codigo ?? "Sala comum";
  const profBase = turma.professor?.nome ?? "A definir";
  const salaAtual = atuais.filter((a) => a.tipo === "TROCA_SALA").at(-1)?.valorNovo ?? salaBase;
  const profAtual = atuais.filter((a) => a.tipo === "TROCA_PROFESSOR").at(-1)?.valorNovo ?? profBase;
  const salaNova = sala?.codigo ?? salaBase;
  const profNovo = prof?.nome ?? profBase;
  const salaMudou = salaNova !== salaAtual;
  const profMudou = profNovo !== profAtual;
  if (!salaMudou && !profMudou) return { ok: true };

  const aula = turma.nomeNaPlanilha ?? turma.disciplina.nome;
  const detalhes: string[] = [];
  if (salaMudou) detalhes.push(`Sala: ${salaAtual} → ${salaNova}`);
  if (profMudou) detalhes.push(`Professor: ${profAtual} → ${profNovo}`);
  const mensagem = `Alteração de aula em ${data.toISOString().slice(0, 10).split("-").reverse().join("/")}: ${aula} (${turma.grupo?.nome ?? "Turma"}). ${detalhes.join("; ")}.`;
  await prisma.$transaction(async (tx) => {
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
    if (turma.grupoId) await tx.aviso.create({ data: { grupoId: turma.grupoId, conteudo: mensagem, status: "PENDENTE" } });
  });
  await registrar(eu, "Troca do dia", mensagem);
  atualizar();
  return { ok: true };
}

export async function enviarAviso(input: { turmaId: number; mensagem: string }) {
  await exigirUsuario();
  const turma = await prisma.turma.findUnique({ where: { id: input.turmaId } });
  if (!turma?.grupoId) return { ok: false, erro: "Esta turma não tem grupo de alunos vinculado." };
  await prisma.aviso.create({ data: { grupoId: turma.grupoId, conteudo: input.mensagem, status: "PENDENTE" } });
  atualizar();
  return { ok: true };
}

/** Envio manual pelo WhatsApp: depois de mandar no grupo, a pessoa marca o aviso como enviado (ou volta para pendente). */
export async function marcarAviso(id: number, enviado: boolean) {
  const eu = await exigirUsuario();
  const jaEnfileirado = await prisma.whatsappLote.findUnique({ where: { avisoId: id }, select: { id: true } });
  if (jaEnfileirado) return { ok: false, erro: "Este aviso já entrou na fila do bot. Gerencie-o no painel WhatsApp." };
  const aviso = await prisma.aviso.update({
    where: { id },
    data: { status: enviado ? "ENVIADO" : "PENDENTE" },
    include: { grupo: true },
  });
  await registrar(eu, "Aviso", `${enviado ? "Marcou como enviado" : "Voltou para pendente"} o aviso de ${aviso.grupo.nome}`);
  atualizar();
  return { ok: true };
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

/** "Nova Turma" / editar: o nome é livre (ex.: "04º B ENG. CIVIL"); o sistema descobre curso, período e turma. */
export async function criarGrupo(input: { id?: number; nome: string; alunos: number | null; wa: string }) {
  const eu = await exigirUsuario();
  const nome = input.nome.trim();
  const n = norm(nome);
  if (!n) return { ok: false, erro: "Informe a turma." };
  const cursos = await prisma.curso.findMany();
  const achado =
    cursos.find((c) => n.includes(norm(c.nome))) ??
    cursos.find((c) => c.nome === PALAVRAS_CURSO.find(([k]) => n.includes(k))?.[1]);
  if (!achado) {
    return { ok: false, erro: "Não reconheci o curso. Escreva no formato: 04º B ENG. CIVIL (ou ENG. COMPUTAÇÃO, ENG. SOFTWARE, SIST. DE INFORM., ...)." };
  }
  const periodo = /\d+/.exec(n)?.[0];
  const letra = n.split(" ").find((t) => /^[A-D]$/.test(t)) ?? "A";
  const data = {
    nome: nome.toUpperCase(), cursoId: achado.id, periodo: periodo ? Number(periodo) : null, letra,
    turno: n.includes("VESP") ? "VESPERTINO" : "NOTURNO", qtdAlunos: input.alunos, linkWhatsapp: input.wa.trim() || null,
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

export type TipoCadastro = "sala" | "professor" | "turma" | "aula";

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
