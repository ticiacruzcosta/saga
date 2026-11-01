// Registro de atividades (auditoria) e os dados guardados para desfazer uma ação.

import type { Ambiente, Aviso, GrupoAlunos, Professor, Turma } from "@prisma/client";
import { prisma } from "./prisma";
import type { UsuarioLogado } from "./auth";

/** O que precisa ser guardado para desfazer cada tipo de ação. */
export type Desfazer =
  | { tipo: "restaurarTurmas"; turmas: Turma[] } // edição/realocação: volta os campos das aulas
  | { tipo: "recriarTurmas"; turmas: Turma[] } // exclusão de aula (com as que assistiam junto)
  | { tipo: "recriarAmbiente"; registro: Ambiente; turmas: number[]; disciplinas: number[] }
  | { tipo: "recriarProfessor"; registro: Professor; turmas: number[]; disciplinas: number[] }
  | { tipo: "recriarGrupo"; registro: GrupoAlunos; avisos: Aviso[] };

export async function registrar(usuario: UsuarioLogado | null, acao: string, descricao: string, desfazer?: Desfazer) {
  await prisma.atividade.create({
    data: {
      usuarioId: usuario?.id ?? null,
      usuarioNome: usuario?.nome ?? "Sistema",
      acao,
      descricao,
      desfazer: desfazer ? JSON.stringify(desfazer) : null,
    },
  });
}

/** Estado atual de uma aula e das que assistem junto, antes de alterá-las. */
export async function fotoTurmas(turmaId: number): Promise<Turma[]> {
  return prisma.turma.findMany({ where: { OR: [{ id: turmaId }, { consomeDeId: turmaId }] }, orderBy: { id: "asc" } });
}
