"use server";

import { exigirUsuario } from "@/lib/auth";
// Realocação de aulas com conflito (Grade do Semestre).
// A mudança vale para o semestre e fica registrada em `alteracoes` com tipo REALOCACAO.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrar } from "@/lib/atividade";
import type { UsuarioLogado } from "@/lib/auth";
import { carregarTurmas, ofertaAtual, paraValidar, paresRodizio, type TurmaCompleta } from "@/lib/dados";
import {
  aplicarNoContexto, conferirOpcao, conflitosDe, motivoNaoRealocar, opcoesRealocacao, planejarTudo,
  type ContextoRealocacao, type OpcaoRealocacao,
} from "@/lib/realocacao";
import { faixa } from "@/lib/rotulos";
import { DIA_TELA, hojeData } from "@/lib/vm";
import type { OpcaoRealocacaoVM, PlanoResolucaoVM, SugestaoRealocacaoVM } from "@/lib/tipos";

async function carregarContexto() {
  const oferta = await ofertaAtual();
  if (!oferta) return null;
  const [turmas, ambientes, pares, professores] = await Promise.all([
    carregarTurmas(oferta.id),
    prisma.ambiente.findMany({ orderBy: { codigo: "asc" } }),
    paresRodizio(),
    prisma.professor.findMany({ where: { diasIndisponiveis: { not: null } } }),
  ]);
  const ctx: ContextoRealocacao = {
    turmas: turmas.map(paraValidar),
    ambientes: ambientes.map((a) => ({ id: a.id, codigo: a.codigo, tipo: a.tipo, capacidade: a.capacidade })),
    pares,
    turno: new Map(turmas.map((t) => [t.id, t.turno])),
    ambienteFixo: new Map(turmas.map((t) => [t.id, t.disciplina.ambienteFixoId])),
    diasIndisponiveis: new Map(professores.map((p) => [p.id, (p.diasIndisponiveis ?? "").split(",").map((d) => d.trim())])),
  };
  return { oferta, turmas, ctx };
}

const onde = (dia: string | null, ini: number | null, fim: number | null, sala: string | null | undefined) =>
  dia ? `${DIA_TELA[dia] ?? dia} ${faixa(ini, fim)}${sala ? ` em ${sala}` : ""}` : "sem dia";

const rotulo = (t: TurmaCompleta) => `${t.nomeNaPlanilha ?? t.disciplina.nome} · ${t.grupo?.nome ?? "—"}`;

const paraVM = (o: OpcaoRealocacao): OpcaoRealocacaoVM => ({
  dia: o.dia, inicio: o.inicio, fim: o.fim, ambienteId: o.ambienteId,
  descricao: onde(o.dia, o.inicio, o.fim, o.ambienteCodigo), muda: o.muda, avisos: o.avisos,
});

/** Opções para uma turma com conflito. Não grava nada. */
export async function sugerirRealocacao(turmaId: number): Promise<SugestaoRealocacaoVM> {
  await exigirUsuario();
  const base = await carregarContexto();
  if (!base) return { ok: false, erro: "Nenhuma oferta no banco." };
  const t = base.turmas.find((x) => x.id === turmaId);
  const motivo = motivoNaoRealocar(base.ctx.turmas.find((x) => x.id === turmaId));
  if (!t || motivo) return { ok: false, erro: motivo ?? "Turma não encontrada." };

  // Quem já deu essa disciplina e está livre no horário atual (só sugestão: o sistema não troca professor)
  const hab = await prisma.professorDisciplina.findMany({ where: { disciplinaId: t.disciplinaId }, include: { professor: true } });
  const ocupados = new Set(
    base.turmas
      .filter((x) => x.id !== t.id && !x.consomeDeId && x.diaSemana === t.diaSemana && x.horaInicio != null && x.horaFim != null &&
        x.horaInicio < t.horaFim! && t.horaInicio! < x.horaFim && x.formato !== "ASSINCRONA")
      .map((x) => x.professorId)
  );
  const professoresLivres = hab
    .filter((h) => h.professorId !== t.professorId && h.professor.ativo && !ocupados.has(h.professorId))
    .map((h) => h.professor.nome);

  return {
    ok: true, turmaId, turma: rotulo(t),
    atual: onde(t.diaSemana, t.horaInicio, t.horaFim, t.ambiente?.codigo),
    conflitos: conflitosDe(base.ctx, turmaId).map((c) => ({ gravidade: c.gravidade, mensagem: c.mensagem })),
    acompanham: t.consumidoras.map((c) => c.grupo?.nome ?? "—"),
    opcoes: opcoesRealocacao(base.ctx, turmaId).map(paraVM),
    professoresLivres,
  };
}

type Pedido = { turmaId: number; dia: string; inicio: number; fim: number; ambienteId: number | null; avisar: boolean };

/** Grava uma realocação (a turma e quem assiste junto) + registro + aviso opcional. */
async function gravar(eu: UsuarioLogado, base: NonNullable<Awaited<ReturnType<typeof carregarContexto>>>, p: Pedido) {
  const t = base.turmas.find((x) => x.id === p.turmaId)!;
  const amb = p.ambienteId ? base.ctx.ambientes.find((a) => a.id === p.ambienteId) : null;
  const antes = onde(t.diaSemana, t.horaInicio, t.horaFim, t.ambiente?.codigo);
  const depois = onde(p.dia, p.inicio, p.fim, amb?.codigo);
  const dados = { diaSemana: p.dia, horaInicio: p.inicio, horaFim: p.fim, ambienteId: p.ambienteId };
  const disciplina = t.nomeNaPlanilha ?? t.disciplina.nome;

  await prisma.$transaction(async (tx) => {
    await tx.turma.update({ where: { id: t.id }, data: dados });
    await tx.turma.updateMany({ where: { consomeDeId: t.id }, data: dados });
    await tx.alteracao.create({
      data: {
        turmaId: t.id, data: hojeData(), tipo: "REALOCACAO", valorAnterior: antes, valorNovo: depois,
        motivo: conflitosDe(base.ctx, t.id).filter((c) => c.gravidade === "ERRO").map((c) => c.mensagem).join(" | ") || null,
      },
    });
    if (p.avisar) {
      const grupos = [t.grupoId, ...t.consumidoras.map((c) => c.grupoId)].filter((g): g is number => g != null);
      for (const grupoId of new Set(grupos)) {
        await tx.aviso.create({
          data: { grupoId, conteudo: `📢 Mudança de horário: ${disciplina} passa de ${antes} para ${depois}, a partir desta semana.`, status: "PENDENTE" },
        });
      }
    }
  });
  await registrar(eu, "Realocação", `${disciplina} (${t.grupo?.nome ?? "—"}): ${antes} → ${depois}`);
  aplicarNoContexto(base.ctx, t.id, { ...p, dia: p.dia as OpcaoRealocacao["dia"], ambienteCodigo: amb?.codigo ?? null, muda: "", avisos: [], custo: 0 });
  return depois;
}

export async function aplicarRealocacao(p: Pedido): Promise<{ ok: boolean; erro?: string; resumo?: string }> {
  const eu = await exigirUsuario();
  const base = await carregarContexto();
  if (!base) return { ok: false, erro: "Nenhuma oferta no banco." };
  const c = conferirOpcao(base.ctx, p.turmaId, p);
  if (!c.ok) return { ok: false, erro: `Essa opção não está mais livre: ${c.mensagem}` };
  const resumo = await gravar(eu, base, p);
  revalidatePath("/");
  return { ok: true, resumo };
}

/** "Resolver todos": uma sugestão para cada aula com choque. Não grava nada. */
export async function planejarResolucao(): Promise<PlanoResolucaoVM> {
  await exigirUsuario();
  const base = await carregarContexto();
  if (!base) return { ok: false, erro: "Nenhuma oferta no banco.", movimentos: [], semSolucao: [] };
  const porId = new Map(base.turmas.map((t) => [t.id, t]));
  const { movimentos, semSolucao } = planejarTudo(base.ctx);
  return {
    ok: true,
    movimentos: movimentos.map((m) => {
      const t = porId.get(m.turmaId)!;
      return { turmaId: m.turmaId, turma: rotulo(t), de: onde(t.diaSemana, t.horaInicio, t.horaFim, t.ambiente?.codigo), motivo: m.motivo, opcao: paraVM(m.opcao) };
    }),
    semSolucao: semSolucao.map((s) => ({ turmaId: s.turmaId, turma: rotulo(porId.get(s.turmaId)!), motivo: s.motivo })),
  };
}

/** Grava as sugestões marcadas, na ordem, conferindo cada uma antes. */
export async function aplicarResolucao(itens: Pedido[]): Promise<{ ok: boolean; aplicadas: number; falhas: string[] }> {
  const eu = await exigirUsuario();
  const base = await carregarContexto();
  if (!base) return { ok: false, aplicadas: 0, falhas: ["Nenhuma oferta no banco."] };
  let aplicadas = 0;
  const falhas: string[] = [];
  for (const p of itens) {
    const c = conferirOpcao(base.ctx, p.turmaId, p);
    if (!c.ok) {
      const t = base.turmas.find((x) => x.id === p.turmaId);
      falhas.push(`${t ? rotulo(t) : p.turmaId}: ${c.mensagem}`);
      continue;
    }
    await gravar(eu, base, p);
    aplicadas++;
  }
  revalidatePath("/");
  return { ok: falhas.length === 0, aplicadas, falhas };
}
