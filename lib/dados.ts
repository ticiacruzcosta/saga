import { cookies } from "next/headers";
import { prisma } from "./prisma";
import type { DiaSemana, Formato, TurmaParaValidar } from "./validacao-choque";

/** Cookie com o semestre escolhido no seletor da tela ("2027.1"). */
export const COOKIE_OFERTA = "saga_oferta";

/** A publicada mais recente (ou a última criada). */
export async function ofertaPublicada() {
  return (
    (await prisma.oferta.findFirst({ where: { status: "PUBLICADA" }, orderBy: { codigo: "desc" } })) ??
    (await prisma.oferta.findFirst({ orderBy: { id: "desc" } }))
  );
}

/** A oferta que o sistema mostra: a escolhida no seletor ou, se nenhuma, a publicada. */
export async function ofertaAtual() {
  let codigo: string | undefined;
  try {
    codigo = (await cookies()).get(COOKIE_OFERTA)?.value;
  } catch {
    // fora de uma requisição (scripts): usa a publicada
  }
  const escolhida = codigo ? await prisma.oferta.findUnique({ where: { codigo } }) : null;
  return escolhida ?? (await ofertaPublicada());
}

/** Todas as turmas de uma oferta, já com tudo que as telas precisam. */
export async function carregarTurmas(ofertaId: number) {
  return prisma.turma.findMany({
    where: { ofertaId },
    include: {
      disciplina: true,
      professor: true,
      ambiente: true,
      grupo: { include: { curso: true } },
      consumidoras: { include: { grupo: true } },
    },
    orderBy: [{ diaSemana: "asc" }, { horaInicio: "asc" }, { id: "asc" }],
  });
}

export type TurmaCompleta = Awaited<ReturnType<typeof carregarTurmas>>[number];

/** Traduz uma turma do banco para o formato que o validador de choque entende. */
export function paraValidar(t: TurmaCompleta): TurmaParaValidar {
  return {
    id: t.id,
    grupoId: t.grupoId,
    disciplinaId: t.disciplinaId,
    disciplinaNome: t.nomeNaPlanilha ?? t.disciplina.nome,
    disciplinaCodigo: t.disciplina.codigo ?? "",
    cursoId: t.grupo?.cursoId ?? 0,
    periodo: t.grupo?.periodo ?? 0,
    letra: t.letra,
    turno: t.turno ?? t.grupo?.turno ?? "NOTURNO",
    formato: (t.formato ?? t.disciplina.formato) as Formato,
    professorId: t.professorId,
    professorNome: t.professor?.nome,
    ambienteId: t.ambienteId,
    ambienteCodigo: t.ambiente?.codigo,
    ambienteCapacidade: t.ambiente?.capacidade ?? null,
    diaSemana: (t.diaSemana as DiaSemana | null) ?? null,
    horaInicio: t.horaInicio,
    horaFim: t.horaFim,
    vagas: t.vagas,
    limiteAlunos: t.disciplina.limiteAlunos,
    consomeDeId: t.consomeDeId,
    permiteRodizio: t.disciplina.permiteRodizio,
  };
}

/** Pares de disciplinas em rodízio, no formato [idA, idB]. */
export async function paresRodizio(): Promise<Array<[number, number]>> {
  const r = await prisma.rodizio.findMany();
  return r.map((x) => [x.disciplinaAId, x.disciplinaBId]);
}
