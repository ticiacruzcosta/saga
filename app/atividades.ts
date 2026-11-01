"use server";

// Desfazer uma ação registrada em Atividades (só administradores, dentro do prazo).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirAdmin } from "@/lib/auth";
import { PRAZO_DESFAZER_MS, registrar, type Desfazer } from "@/lib/atividade";

export async function desfazerAtividade(id: number): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirAdmin();
  const a = await prisma.atividade.findUnique({ where: { id } });
  if (!a?.desfazer) return { ok: false, erro: "Esta ação não pode ser desfeita." };
  if (a.desfeitaEm) return { ok: false, erro: "Esta ação já foi desfeita." };
  if (Date.now() - a.criadaEm.getTime() > PRAZO_DESFAZER_MS) return { ok: false, erro: "O prazo para desfazer (24 horas) já passou." };

  const d = JSON.parse(a.desfazer) as Desfazer;
  try {
    await prisma.$transaction(async (tx) => {
      if (d.tipo === "restaurarTurmas") {
        for (const { id: turmaId, ...campos } of d.turmas) {
          await tx.turma.updateMany({ where: { id: turmaId }, data: campos });
        }
      }
      if (d.tipo === "recriarTurmas") {
        // a aula principal antes das que assistem a ela
        const ordem = [...d.turmas].sort((x, y) => Number(x.consomeDeId != null) - Number(y.consomeDeId != null));
        for (const t of ordem) await tx.turma.create({ data: t });
      }
      if (d.tipo === "recriarAmbiente") {
        await tx.ambiente.create({ data: d.registro });
        await tx.turma.updateMany({ where: { id: { in: d.turmas } }, data: { ambienteId: d.registro.id } });
        await tx.disciplina.updateMany({ where: { id: { in: d.disciplinas } }, data: { ambienteFixoId: d.registro.id } });
      }
      if (d.tipo === "recriarProfessor") {
        await tx.professor.create({ data: d.registro });
        await tx.turma.updateMany({ where: { id: { in: d.turmas } }, data: { professorId: d.registro.id } });
        for (const disciplinaId of d.disciplinas) {
          await tx.professorDisciplina.create({ data: { professorId: d.registro.id, disciplinaId } });
        }
      }
      if (d.tipo === "recriarGrupo") {
        await tx.grupoAlunos.create({ data: d.registro });
        for (const aviso of d.avisos) await tx.aviso.create({ data: aviso });
      }
      await tx.atividade.update({ where: { id }, data: { desfeitaEm: new Date() } });
    });
  } catch {
    return { ok: false, erro: "Não foi possível desfazer: algo ligado a esta ação mudou depois (ex.: nome repetido ou cadastro excluído)." };
  }
  await registrar(eu, "Desfazer", `Desfez: ${a.descricao}`);
  revalidatePath("/");
  return { ok: true };
}
