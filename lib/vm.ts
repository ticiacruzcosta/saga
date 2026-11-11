import { prisma } from "./prisma";
import { carregarTurmas, ofertaAtual, ofertaPublicada, paraValidar, paresRodizio, type TurmaCompleta } from "./dados";
import { validarOferta } from "./validacao-choque";
import { dataHora, diaDeHoje, faixa, minutosParaHora } from "./rotulos";
import { telegramConfigurado } from "./telegram/api";
import type { AvisoVM, DadosSaga, TurmaVM } from "./tipos";

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

  const [ambientes, professores, cursos, grupos, avisos, disciplinas, usuarios, assinantesTg, lotesWhatsapp, lotesTelegram] = await Promise.all([
    prisma.ambiente.findMany({ where: { NOT: { codigo: { in: ["EAD", "SALA_COMUM"] } } }, orderBy: { codigo: "asc" } }),
    prisma.professor.findMany({ orderBy: { nome: "asc" } }),
    prisma.curso.findMany({ include: { _count: { select: { grupos: true } } }, orderBy: { nome: "asc" } }),
    prisma.grupoAlunos.findMany({ include: { curso: true }, orderBy: [{ cursoId: "asc" }, { periodo: "asc" }, { letra: "asc" }, { turno: "asc" }] }),
    prisma.aviso.findMany({ include: { grupo: true }, orderBy: { criadoEm: "desc" }, take: 200 }),
    prisma.disciplina.findMany({ select: { nome: true }, orderBy: { nome: "asc" } }),
    // pedidos de acesso pendentes primeiro
    admin ? prisma.usuario.findMany({ orderBy: [{ ativo: "asc" }, { nome: "asc" }] }) : [],
    prisma.telegramAssinante.findMany({ include: { grupo: true }, orderBy: [{ ativo: "desc" }, { atualizadoEm: "desc" }], take: 50 }).catch(() => []),
    prisma.whatsappLote.findMany({ select: { avisoId: true } }).catch(() => []),
    prisma.telegramLote.findMany({ include: { mensagens: { select: { status: true, erro: true } } } }).catch(() => []),
  ]);
  const avisosNaFila = new Set(lotesWhatsapp.map((l) => l.avisoId));
  const lotesTgPorAviso = new Map(lotesTelegram.map((l) => [l.avisoId, l]));
  const chaveTelegramOk = telegramConfigurado();

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
    cursos: cursos.map((c) => ({
      id: c.id, nome: c.nome, sigla: c.sigla, turmas: c._count.grupos,
    })),
    grupos: grupos.map((g) => ({
      id: g.id,
      nome: g.nome,
      cursoId: g.cursoId,
      cursoNome: g.curso.nome,
      cursoSigla: g.curso.sigla,
      periodo: g.periodo,
      letra: g.letra,
      turno: g.turno,
      alunos: g.qtdAlunos,
      wa: g.linkWhatsapp ?? "—",
    })),
    avisos: avisos.map((a) => {
      const loteTg = lotesTgPorAviso.get(a.id);
      const falhaTg = loteTg?.mensagens.find((m) => m.status === "FALHOU");
      let statusTelegram: AvisoVM["statusTelegram"] = "Integrado";
      let detalheTelegram: string | undefined;
      if (!chaveTelegramOk) {
        statusTelegram = "Chave pendente";
        detalheTelegram = "Token do Telegram não configurado";
      } else if (falhaTg) {
        statusTelegram = "Falhou";
        detalheTelegram = falhaTg.erro ?? "Falha no envio pelo Telegram";
      } else if (loteTg?.status === "CONCLUIDO" || a.status === "ENVIADO" || a.status === "ENTREGUE") {
        statusTelegram = "Enviado";
        detalheTelegram = "Sem problemas de chave ou envio";
      } else if (loteTg) {
        statusTelegram = "Na fila";
        detalheTelegram = `Lote #${loteTg.id} (${loteTg.status})`;
      } else {
        statusTelegram = "Integrado";
        detalheTelegram = "Chave ativa • pronto para disparo";
      }
      const enviadoPorTelegram = loteTg?.status === "CONCLUIDO" && !falhaTg;
      return {
        id: a.id,
        quando: dataHora(a.criadoEm),
        turma: a.grupo.nome,
        mensagem: a.conteudo,
        status: a.status === "ENTREGUE" ? "Entregue" : a.status === "ENVIADO" || enviadoPorTelegram ? "Enviado" : a.status === "FALHOU" ? "Falhou" : "Pendente",
        enfileirado: avisosNaFila.has(a.id),
        statusTelegram,
        detalheTelegram,
      };
    }),
    disciplinas: [...new Set(disciplinas.map((d) => d.nome))],
    usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome, email: u.email, ativo: u.ativo, admin: u.perfil === "ADMIN", desde: dataHora(u.criadoEm).slice(0, 10) })),
    assinantesTelegram: assinantesTg.map((s) => ({
      id: s.id,
      chatId: s.chatId,
      nome: s.nome ?? "Aluno",
      ativo: s.ativo,
      grupoId: s.grupoId,
      grupoNome: s.grupo?.nome ?? null,
    })),
    totalConflitos: 0,
    totalConfirmar: 0,
    telegramOk: chaveTelegramOk,
  };
  if (!oferta) return base;

  const turmas = await carregarTurmas(oferta.id);

  // Conflitos: o validador roda na oferta inteira (sem as turmas que só assistem a outra)
  const conflitos = validarOferta(turmas.filter((t) => !t.consomeDeId).map(paraValidar), await paresRodizio());
  conflitos.forEach((lista) => {
    if (lista.some((c) => c.gravidade === "ERRO")) base.totalConflitos++;
    else base.totalConfirmar++;
  });

  // Alterações pontuais (sala, professor e cancelamento de aula) por data
  const alteracoes = await prisma.alteracao.findMany({
    where: {
      turma: { ofertaId: oferta.id },
      tipo: { in: ["TROCA_SALA", "TROCA_PROFESSOR", "CANCELAMENTO"] },
    },
    orderBy: { id: "asc" },
  });
  const isoHoje = base.dataHoje;
  const salaHoje = new Map<number, string>();
  const profHoje = new Map<number, string>();
  const canceladaHoje = new Map<number, string | null>();
  const porTurmaData = new Map<number, Record<string, { sala?: string; prof?: string; cancelada?: boolean; motivo?: string | null }>>();

  for (const a of alteracoes) {
    const iso = a.data.toISOString().slice(0, 10);
    let mapaData = porTurmaData.get(a.turmaId);
    if (!mapaData) {
      mapaData = {};
      porTurmaData.set(a.turmaId, mapaData);
    }
    const item = (mapaData[iso] ??= {});
    if (a.tipo === "TROCA_SALA" && a.valorNovo) {
      item.sala = a.valorNovo;
      if (iso === isoHoje) salaHoje.set(a.turmaId, a.valorNovo);
    }
    if (a.tipo === "TROCA_PROFESSOR" && a.valorNovo) {
      item.prof = a.valorNovo;
      if (iso === isoHoje) profHoje.set(a.turmaId, a.valorNovo);
    }
    if (a.tipo === "CANCELAMENTO") {
      item.cancelada = true;
      item.motivo = a.motivo ?? null;
      if (iso === isoHoje) canceladaHoje.set(a.turmaId, a.motivo ?? null);
    }
  }

  base.turmas = turmas.map((t: TurmaCompleta): TurmaVM => {
    const fmt = t.formato ?? t.disciplina.formato;
    const ead = fmt === "ASSINCRONA" || fmt === "SINCRONA";
    const d = t.disciplina;
    const isCanceladaHoje = canceladaHoje.has(t.id);
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
      alteradaHoje: salaHoje.has(t.id) || profHoje.has(t.id) || isCanceladaHoje,
      canceladaHoje: isCanceladaHoje,
      motivoCancelamento: canceladaHoje.get(t.id) ?? null,
      alteracoesPorData: porTurmaData.get(t.id) ?? {},
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
