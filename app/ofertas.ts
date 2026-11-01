"use server";

// Semestres: escolher qual ver, publicar e gerar o próximo como rascunho.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { COOKIE_OFERTA, ofertaAtual, paresRodizio } from "@/lib/dados";
import { gerarOferta, nomeGrupo, proximoCodigo, type DisciplinaGer } from "@/lib/gerar-oferta";
import type { ResultadoGeracao } from "@/lib/tipos";

/** Muda o semestre que a tela mostra (só para quem escolheu: fica num cookie). */
export async function selecionarOferta(codigo: string) {
  (await cookies()).set(COOKIE_OFERTA, codigo, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/");
}

/** Publica um semestre: ele passa a ser o padrão; o publicado anterior é arquivado. */
export async function publicarOferta(codigo: string) {
  const o = await prisma.oferta.findUnique({ where: { codigo } });
  if (!o) return { ok: false, erro: "Semestre não encontrado." };
  await prisma.$transaction([
    prisma.oferta.updateMany({ where: { status: "PUBLICADA", NOT: { id: o.id } }, data: { status: "ARQUIVADA" } }),
    prisma.oferta.update({ where: { id: o.id }, data: { status: "PUBLICADA" } }),
  ]);
  revalidatePath("/");
  return { ok: true };
}

/** Monta o semestre seguinte ao que está aberto na tela e grava como RASCUNHO. */
export async function gerarProximaOferta(input: { abrirPrimeiro: boolean; substituir: boolean }): Promise<ResultadoGeracao> {
  const origem = await ofertaAtual();
  if (!origem) return { ok: false, erro: "Nenhuma oferta no banco para servir de base." };
  const codigo = proximoCodigo(origem.codigo);
  const existente = await prisma.oferta.findUnique({ where: { codigo } });
  if (existente && existente.status !== "RASCUNHO") {
    return { ok: false, codigo, erro: `O semestre ${codigo} já existe e está ${existente.status}. Só um rascunho pode ser gerado de novo.` };
  }
  if (existente && !input.substituir) {
    return { ok: false, codigo, existe: true, erro: `Já existe um rascunho ${codigo}. Marque "Substituir rascunho" para gerar de novo.` };
  }

  const [turmasOrigem, matriz, habilitacoes, historico, ambientes, pares, consumidas] = await Promise.all([
    prisma.turma.findMany({ where: { ofertaId: origem.id }, include: { grupo: { include: { curso: true } } } }),
    prisma.matrizItem.findMany({ include: { disciplina: true } }),
    prisma.professorDisciplina.findMany({ include: { professor: true } }),
    // quem deu cada disciplina mais recentemente vem primeiro
    prisma.turma.findMany({ where: { professorId: { not: null } }, select: { disciplinaId: true, professorId: true }, orderBy: { id: "desc" } }),
    prisma.ambiente.findMany({ orderBy: { codigo: "asc" } }),
    paresRodizio(),
    prisma.turma.findMany({ where: { consomeDeId: { not: null } }, select: { disciplinaId: true } }),
  ]);

  const mapaMatriz = new Map<number, Map<number, DisciplinaGer[]>>();
  for (const m of matriz) {
    if (!mapaMatriz.has(m.cursoId)) mapaMatriz.set(m.cursoId, new Map());
    const p = mapaMatriz.get(m.cursoId)!;
    p.set(m.periodo, [...(p.get(m.periodo) ?? []), m.disciplina]);
  }
  const habs = new Map<number, number[]>();
  const ativos = new Set(habilitacoes.filter((h) => h.professor.ativo).map((h) => `${h.professorId}:${h.disciplinaId}`));
  for (const h of historico) {
    if (!ativos.has(`${h.professorId}:${h.disciplinaId}`)) continue;
    const lista = habs.get(h.disciplinaId) ?? [];
    if (!lista.includes(h.professorId!)) habs.set(h.disciplinaId, [...lista, h.professorId!]);
  }
  const grupos = new Map<string, { cursoId: number; cursoNome: string; periodo: number; letra: string; turno: string; qtdAlunos: number | null }>();
  for (const t of turmasOrigem) {
    const g = t.grupo;
    if (!g || g.periodo == null) continue;
    const gg = { cursoId: g.cursoId, cursoNome: g.curso.nome, periodo: g.periodo, letra: g.letra, turno: g.turno, qtdAlunos: g.qtdAlunos };
    grupos.set(nomeGrupo(gg), gg);
  }

  const r = gerarOferta({
    grupos: [...grupos.values()], matriz: mapaMatriz, habilitacoes: habs,
    ambientes: ambientes.map((a) => ({ id: a.id, codigo: a.codigo, tipo: a.tipo, capacidade: a.capacidade })),
    pares, compartilhadas: new Set(consumidas.map((c) => c.disciplinaId)), abrirPrimeiro: input.abrirPrimeiro,
  });

  await prisma.$transaction(
    async (tx) => {
      let oferta = existente;
      if (oferta) {
        await tx.turma.updateMany({ where: { ofertaId: oferta.id }, data: { consomeDeId: null } });
        await tx.turma.deleteMany({ where: { ofertaId: oferta.id } });
      } else {
        oferta = await tx.oferta.create({ data: { codigo, status: "RASCUNHO" } });
      }
      // turmas de alunos novas (5º A, 1º A...) entram no cadastro; as existentes são reaproveitadas
      const grupoId = new Map((await tx.grupoAlunos.findMany()).map((g) => [g.nome, g.id]));
      for (const g of r.grupos) {
        if (grupoId.has(nomeGrupo(g))) continue;
        const novo = await tx.grupoAlunos.create({
          data: { nome: nomeGrupo(g), cursoId: g.cursoId, periodo: g.periodo, letra: g.letra, turno: g.turno, qtdAlunos: g.qtdAlunos },
        });
        grupoId.set(novo.nome, novo.id);
      }
      const ids: number[] = [];
      for (const t of r.turmas) {
        const criada = await tx.turma.create({
          data: {
            ofertaId: oferta.id, disciplinaId: t.disciplina.id, grupoId: grupoId.get(nomeGrupo(t.grupo))!, letra: t.grupo.letra,
            professorId: t.professorId, ambienteId: t.ambienteId, formato: t.formato, diaSemana: t.dia, horaInicio: t.inicio,
            horaFim: t.fim, turno: t.grupo.turno, vagas: t.grupo.qtdAlunos,
            observacao: [`Gerada automaticamente a partir de ${origem.codigo}`, ...t.problemas].join("; "),
          },
        });
        ids.push(criada.id);
      }
      for (const [i, t] of r.turmas.entries()) {
        if (t.consomeDe != null) await tx.turma.update({ where: { id: ids[i] }, data: { consomeDeId: ids[t.consomeDe] } });
      }
    },
    { timeout: 60_000 }
  );

  (await cookies()).set(COOKIE_OFERTA, codigo, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/");
  const comHorario = r.turmas.filter((t) => t.formato !== "ASSINCRONA" && t.consomeDe == null);
  return {
    ok: true, codigo, origem: origem.codigo,
    turmas: r.turmas.length,
    alocadas: comHorario.filter((t) => t.dia).length,
    comHorario: comHorario.length,
    semProfessor: r.turmas.filter((t) => t.consomeDe == null && !t.professorId).map((t) => `${t.disciplina.nome} · ${nomeGrupo(t.grupo)}`),
    semHorario: comHorario.filter((t) => !t.dia).map((t) => `${t.disciplina.nome} · ${nomeGrupo(t.grupo)}`),
    formados: r.formados,
    semMatriz: r.semMatriz,
    gruposNovos: r.grupos.map(nomeGrupo),
  };
}
