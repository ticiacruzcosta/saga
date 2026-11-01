import { prisma } from "./prisma";
import { carregarTurmas, ofertaAtual, ofertaPublicada, paraValidar, paresRodizio, type TurmaCompleta } from "./dados";
import { validarOferta } from "./validacao-choque";
import { dataHora, diaDeHoje, faixa, minutosParaHora } from "./rotulos";
import { PRAZO_DESFAZER_MS } from "./atividade";
import type { DadosSaga, TurmaVM } from "./tipos";

/** O banco guarda o dia sem acento; a tela mostra com acento. */
export const DIA_TELA: Record<string, string> = {
  SEGUNDA: "SEGUNDA", TERCA: "TERÇA", QUARTA: "QUARTA", QUINTA: "QUINTA", SEXTA: "SEXTA", SABADO: "SÁBADO",
};
export const DIA_BANCO: Record<string, string> = {
  SEGUNDA: "SEGUNDA", "TERÇA": "TERCA", QUARTA: "QUARTA", QUINTA: "QUINTA", SEXTA: "SEXTA", "SÁBADO": "SABADO",
};
const FORMATO_TELA: Record<string, string> = {
  PRESENCIAL: "Presencial", HIBRIDA: "Híbrida", SINCRONA: "Síncrona", ASSINCRONA: "Assíncrona",
};

export function ehLab(tipo: string | null | undefined) {
  return tipo === "LABORATORIO" || tipo === "LAB_ESPECIFICO";
}

/** Meia-noite (UTC) da data de hoje em Porto Velho: a data que a tabela de alterações usa. */
export function hojeData(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho" }).format(new Date());
  return new Date(`${iso}T00:00:00.000Z`);
}

/** `admin`: só administradores recebem a lista de usuários. */
export async function carregarDados(admin = false): Promise<DadosSaga> {
  const hoje = diaDeHoje();
  const [oferta, publicada, ofertas] = await Promise.all([
    ofertaAtual(), ofertaPublicada(), prisma.oferta.findMany({ orderBy: { codigo: "desc" } }),
  ]);

  const [ambientes, professores, grupos, avisos, disciplinas, usuarios, atividades, semAula] = await Promise.all([
    prisma.ambiente.findMany({ where: { NOT: { codigo: { in: ["EAD", "SALA_COMUM"] } } }, orderBy: { codigo: "asc" } }),
    prisma.professor.findMany({ orderBy: { nome: "asc" } }),
    prisma.grupoAlunos.findMany({ orderBy: [{ cursoId: "asc" }, { periodo: "asc" }, { letra: "asc" }, { turno: "asc" }] }),
    prisma.aviso.findMany({ include: { grupo: true }, orderBy: { criadoEm: "desc" }, take: 200 }),
    prisma.disciplina.findMany({ select: { nome: true }, orderBy: { nome: "asc" } }),
    // pedidos de acesso pendentes primeiro
    admin ? prisma.usuario.findMany({ orderBy: [{ ativo: "asc" }, { nome: "asc" }] }) : [],
    admin ? prisma.atividade.findMany({ orderBy: { criadaEm: "desc" }, take: 300 }) : [],
    prisma.diaSemAula.findMany({ orderBy: { data: "asc" } }),
  ]);
  const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

  const base: DadosSaga = {
    oferta: oferta?.codigo ?? "—",
    ofertaStatus: oferta?.status ?? "",
    ofertaPublicada: publicada?.status === "PUBLICADA" ? publicada.codigo : null,
    ofertas: ofertas.map((o) => ({ codigo: o.codigo, status: o.status })),
    diaHoje: hoje ? DIA_TELA[hoje] : null,
    dataHoje: hojeData().toISOString().slice(0, 10),
    turmas: [],
    salas: ambientes.map((a) => ({
      id: a.id, nome: a.codigo, cap: a.capacidade, predio: a.predio ?? "—",
      tipo: ehLab(a.tipo) ? "Laboratório/Prático" : "Presencial Teórico",
    })),
    professores: professores.map((p) => ({
      id: p.id, nome: p.nome, email: p.email ?? "—", dias: p.diasIndisponiveis ? p.diasIndisponiveis.split(",") : [],
    })),
    grupos: grupos.map((g) => ({ id: g.id, nome: g.nome, alunos: g.qtdAlunos, wa: g.linkWhatsapp ?? "—" })),
    avisos: avisos.map((a) => ({
      id: a.id, quando: dataHora(a.criadoEm), turma: a.grupo.nome, mensagem: a.conteudo,
      status: a.status === "ENTREGUE" ? "Entregue" : a.status === "ENVIADO" ? "Enviado" : a.status === "FALHOU" ? "Falhou" : "Pendente",
    })),
    disciplinas: [...new Set(disciplinas.map((d) => d.nome))],
    atividades: atividades.map((a) => ({
      id: a.id, quando: dataHora(a.criadaEm), usuario: a.usuarioNome, acao: a.acao, descricao: a.descricao,
      desfeita: Boolean(a.desfeitaEm),
      podeDesfazer: Boolean(a.desfazer) && !a.desfeitaEm && Date.now() - a.criadaEm.getTime() < PRAZO_DESFAZER_MS,
    })),
    calendario: {
      inicio: iso(oferta?.inicioAulas), fim: iso(oferta?.fimAulas),
      semAula: semAula.map((d) => ({ id: d.id, data: iso(d.data), descricao: d.descricao })),
    },
    usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email, ativo: u.ativo, admin: u.perfil === "ADMIN", desde: dataHora(u.criadoEm).slice(0, 10) })),
    totalConflitos: 0,
    totalConfirmar: 0,
  };
  if (!oferta) return base;

  const turmas = await carregarTurmas(oferta.id);

  // Conflitos: o validador roda na oferta inteira (sem as turmas que só assistem a outra)
  const conflitos = validarOferta(turmas.filter((t) => !t.consomeDeId).map(paraValidar), await paresRodizio());
  conflitos.forEach((lista) => {
    if (lista.some((c) => c.gravidade === "ERRO")) base.totalConflitos++;
    else base.totalConfirmar++;
  });

  // Alterações pontuais de HOJE (sala/professor)
  const alteracoes = await prisma.alteracao.findMany({ where: { data: hojeData() }, orderBy: { id: "asc" } });
  const salaHoje = new Map<number, string>();
  const profHoje = new Map<number, string>();
  for (const a of alteracoes) {
    if (a.tipo === "TROCA_SALA" && a.valorNovo) salaHoje.set(a.turmaId, a.valorNovo);
    if (a.tipo === "TROCA_PROFESSOR" && a.valorNovo) profHoje.set(a.turmaId, a.valorNovo);
  }

  base.turmas = turmas.map((t: TurmaCompleta): TurmaVM => {
    const fmt = t.formato ?? t.disciplina.formato;
    const ead = fmt === "ASSINCRONA" || fmt === "SINCRONA";
    const d = t.disciplina;
    return {
      id: t.id,
      grupoId: t.grupoId,
      turma: t.grupo?.nome ?? "—",
      nome: t.nomeNaPlanilha ?? d.nome,
      formato: FORMATO_TELA[fmt] ?? fmt,
      prof: profHoje.get(t.id) ?? t.professor?.nome ?? "A definir",
      sala: salaHoje.get(t.id) ?? t.ambiente?.codigo ?? (ead ? "EAD" : "Sala comum"),
      profGrade: t.professor?.nome ?? "A definir",
      salaGrade: t.ambiente?.codigo ?? (ead ? "EAD" : "Sala comum"),
      alteradaHoje: salaHoje.has(t.id) || profHoje.has(t.id),
      profId: t.professorId,
      salaId: t.ambienteId,
      inicio: t.horaInicio != null ? minutosParaHora(t.horaInicio) : "",
      fim: t.horaFim != null ? minutosParaHora(t.horaFim) : "",
      vagas: t.vagas,
      reqespaco: d.tipoAmbiente === "LABORATORIO" || d.tipoAmbiente === "LAB_ESPECIFICO" ? "Laboratório/Prático" : "Presencial Teórico",
      dia: t.diaSemana ? DIA_TELA[t.diaSemana] : "",
      horario: faixa(t.horaInicio, t.horaFim),
      cht: d.cargaTeorica != null ? `${d.cargaTeorica}h` : "",
      chp: d.cargaPratica != null ? `${d.cargaPratica}h` : "",
      alunos: t.vagas ?? t.grupo?.qtdAlunos ?? null,
      rodizio: d.permiteRodizio ? (d.tipoRodizio === "2X2" ? "Sim (2x2)" : "Sim (1x1)") : "Não",
      predio: t.ambiente?.predio ?? "—",
      tambemAtende: t.consumidoras.map((c) => c.grupo?.nome).filter((n): n is string => Boolean(n)),
      consome: Boolean(t.consomeDeId),
      conflitos: (conflitos.get(t.id) ?? []).map((c) => ({ gravidade: c.gravidade, mensagem: c.mensagem })),
    };
  });
  return base;
}
