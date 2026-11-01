"use server";

// Calendário letivo: período de aulas da oferta aberta e dias sem aula (feriados, recessos).

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { exigirUsuario } from "@/lib/auth";
import { ofertaAtual } from "@/lib/dados";
import { registrar } from "@/lib/atividade";
import { diaMes } from "@/lib/datas";

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const paraData = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function salvarPeriodoLetivo(input: { inicio: string; fim: string }): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirUsuario();
  const oferta = await ofertaAtual();
  if (!oferta) return { ok: false, erro: "Nenhuma oferta aberta." };
  for (const d of [input.inicio, input.fim]) if (d && !DATA_ISO.test(d)) return { ok: false, erro: "Data inválida." };
  if (input.inicio && input.fim && input.fim < input.inicio) return { ok: false, erro: "O fim das aulas precisa ser depois do início." };
  await prisma.oferta.update({
    where: { id: oferta.id },
    data: { inicioAulas: input.inicio ? paraData(input.inicio) : null, fimAulas: input.fim ? paraData(input.fim) : null },
  });
  await registrar(eu, "Calendário", `Período letivo de ${oferta.codigo}: ${input.inicio || "—"} a ${input.fim || "—"}`);
  revalidatePath("/");
  return { ok: true };
}

export async function adicionarDiaSemAula(input: { data: string; descricao: string }): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirUsuario();
  const descricao = input.descricao.trim();
  if (!DATA_ISO.test(input.data)) return { ok: false, erro: "Escolha a data." };
  if (!descricao) return { ok: false, erro: "Informe o motivo (ex.: Feriado de Finados)." };
  try {
    await prisma.diaSemAula.create({ data: { data: paraData(input.data), descricao } });
  } catch {
    return { ok: false, erro: "Esta data já está cadastrada." };
  }
  await registrar(eu, "Calendário", `Dia sem aula: ${diaMes(input.data)} (${descricao})`);
  revalidatePath("/");
  return { ok: true };
}

export async function removerDiaSemAula(id: number): Promise<{ ok: boolean }> {
  const eu = await exigirUsuario();
  const dia = await prisma.diaSemAula.delete({ where: { id } });
  await registrar(eu, "Calendário", `Removeu dia sem aula: ${diaMes(dia.data.toISOString().slice(0, 10))} (${dia.descricao})`);
  revalidatePath("/");
  return { ok: true };
}
