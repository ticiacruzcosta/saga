"use server";

// Importação da planilha de oferta pela tela, em duas etapas com o mesmo código:
// previsualizarImportacao (não grava) e confirmarImportacao (grava numa transação).
// Não apaga cadastros, avisos nem outras ofertas: só recria as turmas da oferta escolhida.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { COOKIE_OFERTA } from "@/lib/dados";
import { chaveDisciplina, lerPlanilhaOferta, semSufixoCurso, type LinhaPlanilha } from "@/lib/planilha-oferta";
import { validarOferta, type DiaSemana, type Formato, type TurmaParaValidar } from "@/lib/validacao-choque";
import type { PreviaImportacao } from "@/lib/tipos";

const TAMANHO_MAXIMO = 10 * 1024 * 1024;

type Entrada = { arquivo: File; codigo: string; substituir: boolean; publicar: boolean };

function lerFormulario(form: FormData): Entrada | string {
  const arquivo = form.get("arquivo");
  const codigo = String(form.get("codigo") ?? "").trim();
  if (!(arquivo instanceof File) || arquivo.size === 0) return "Escolha o arquivo da planilha.";
  if (!/\.xlsx$/i.test(arquivo.name)) return "O arquivo precisa ser .xlsx (Excel).";
  if (arquivo.size > TAMANHO_MAXIMO) return "Arquivo maior que 10 MB.";
  if (!/^\d{4}\.\d$/.test(codigo)) return 'Informe o semestre no formato 2027.1.';
  return { arquivo, codigo, substituir: form.get("substituir") === "on", publicar: form.get("publicar") === "on" };
}

/** Disciplina de cada linha: pelo código da matriz do curso, ou pelo que já foi importado antes. */
async function resolverDisciplinas(linhas: LinhaPlanilha[]) {
  const [matriz, avulsas, historico] = await Promise.all([
    prisma.matrizItem.findMany({ include: { curso: true, disciplina: true }, orderBy: { id: "asc" } }),
    prisma.disciplina.findMany({ where: { codigo: null }, orderBy: { id: "asc" } }),
    prisma.turma.findMany({
      where: { nomeNaPlanilha: { not: null } },
      select: { nomeNaPlanilha: true, disciplinaId: true, disciplina: { select: { codigo: true } }, grupo: { select: { curso: { select: { nome: true } } } } },
      orderBy: { id: "desc" },
    }),
  ]);

  const porCurso = new Map<string, Map<string, number>>(); // curso -> chave -> disciplinaId (só disciplinas com código)
  const global = new Map<string, number>();
  const guardar = (curso: string, chave: string, id: number) => {
    if (!porCurso.has(curso)) porCurso.set(curso, new Map());
    if (!porCurso.get(curso)!.has(chave)) porCurso.get(curso)!.set(chave, id);
    if (!global.has(chave)) global.set(chave, id);
  };
  for (const m of matriz) guardar(m.curso.nome, chaveDisciplina(m.disciplina.nome), m.disciplinaId);
  // O nome na planilha nem sempre bate com o da matriz: aprende com as ofertas já importadas
  for (const t of historico) {
    if (t.disciplina.codigo && t.grupo && porCurso.has(t.grupo.curso.nome)) guardar(t.grupo.curso.nome, chaveDisciplina(t.nomeNaPlanilha), t.disciplinaId);
  }
  const avulsaPorChave = new Map<string, number>();
  for (const t of historico) if (!t.disciplina.codigo) avulsaPorChave.set(chaveDisciplina(t.nomeNaPlanilha), t.disciplinaId);
  for (const d of avulsas) if (!avulsaPorChave.has(chaveDisciplina(d.nome))) avulsaPorChave.set(chaveDisciplina(d.nome), d.id);

  const disc = new Map<number, number | null>(); // linha -> disciplinaId com código
  for (const l of linhas) {
    let id = porCurso.get(l.curso)?.get(l.chave) ?? null;
    if (id == null && porCurso.has(l.curso)) id = global.get(l.chave) ?? null; // curso com matriz usando disciplina de outro
    disc.set(l.linha, id);
  }

  // Comunalidade: mesma disciplina + professor + dia + horário em cursos diferentes
  const dono = new Map<number, number | null>(); // linha -> linha da turma que ela assiste
  const grupos = new Map<string, LinhaPlanilha[]>();
  for (const l of linhas) {
    if (!l.professor || !l.dia || !l.horario) continue;
    const k = [l.chave, l.professor, l.dia, l.horario].join("|");
    grupos.set(k, [...(grupos.get(k) ?? []), l]);
  }
  for (const membros of grupos.values()) {
    if (new Set(membros.map((m) => m.curso)).size < 2) continue;
    const comMatriz = membros.filter((m) => porCurso.has(m.curso));
    const d = (comMatriz.length ? comMatriz : membros).reduce((a, b) => (b.linha < a.linha ? b : a));
    for (const m of membros) {
      dono.set(m.linha, m === d ? null : d.linha);
      disc.set(m.linha, disc.get(m.linha) ?? disc.get(d.linha) ?? null);
    }
  }
  return { disc, dono, avulsaPorChave };
}

async function processar(form: FormData, gravar: boolean): Promise<PreviaImportacao> {
  const entrada = lerFormulario(form);
  if (typeof entrada === "string") return { ok: false, erro: entrada };

  let leitura;
  try {
    leitura = await lerPlanilhaOferta(await entrada.arquivo.arrayBuffer());
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Não consegui ler o arquivo. Confira se é um .xlsx válido." };
  }
  const problemas = [...leitura.problemas];

  const [cursos, ambientes, professores, grupos, discs, rodizios, ofertaExistente] = await Promise.all([
    prisma.curso.findMany(),
    prisma.ambiente.findMany(),
    prisma.professor.findMany(),
    prisma.grupoAlunos.findMany(),
    prisma.disciplina.findMany(),
    prisma.rodizio.findMany(),
    prisma.oferta.findUnique({ where: { codigo: entrada.codigo }, include: { _count: { select: { turmas: true } } } }),
  ]);
  const cursoPorNome = new Map(cursos.map((c) => [c.nome, c]));
  const ambPorCodigo = new Map(ambientes.map((a) => [a.codigo, a]));
  const profPorNome = new Map(professores.map((p) => [p.nome, p]));
  const grupoPorNome = new Map(grupos.map((g) => [g.nome, g]));
  const discPorId = new Map(discs.map((d) => [d.id, d]));

  // Linhas de curso que não existe no sistema ficam de fora (e aparecem na lista)
  const linhas = leitura.linhas.filter((l) => {
    if (cursoPorNome.has(l.curso)) return true;
    problemas.push({ linha: l.linha, mensagem: `Curso "${l.curso}" não cadastrado: linha ignorada.` });
    return false;
  });
  if (linhas.length === 0) return { ok: false, erro: "Nenhuma linha de turma reconhecida na planilha.", problemas };

  const { disc, dono, avulsaPorChave } = await resolverDisciplinas(linhas);

  // O que é novo
  const nomeGrupo = (l: LinhaPlanilha) => `${l.curso} ${l.periodo ?? "?"}º ${l.letra}${l.turno === "VESPERTINO" ? " VESP" : ""}`;
  const novas = { professores: new Set<string>(), disciplinas: new Map<string, string>(), salas: new Set<string>(), grupos: new Set<string>() };
  for (const l of linhas) {
    if (l.professor && !profPorNome.has(l.professor)) novas.professores.add(l.professor);
    if (!disc.get(l.linha) && !avulsaPorChave.has(l.chave) && !novas.disciplinas.has(l.chave)) novas.disciplinas.set(l.chave, semSufixoCurso(l.disciplina));
    if (l.lab && !ambPorCodigo.has(l.lab.codigo)) novas.salas.add(l.lab.codigo);
    if (!grupoPorNome.has(nomeGrupo(l))) novas.grupos.add(nomeGrupo(l));
    if (l.periodo == null) problemas.push({ linha: l.linha, mensagem: `Período não informado: "${l.periodoTxt}".` });
  }

  // Choques: roda o mesmo validador da tela na oferta inteira, antes de gravar
  const idTemp = new Map([...novas.disciplinas.keys()].map((k, i) => [k, -(i + 1)]));
  const discDaLinha = (l: LinhaPlanilha) => disc.get(l.linha) ?? avulsaPorChave.get(l.chave) ?? idTemp.get(l.chave)!;
  const paraValidar: TurmaParaValidar[] = linhas.map((l) => {
    const d = discPorId.get(discDaLinha(l));
    const amb = l.lab ? ambPorCodigo.get(l.lab.codigo) : undefined;
    return {
      id: l.linha, disciplinaId: discDaLinha(l), disciplinaNome: l.disciplina, disciplinaCodigo: d?.codigo ?? "",
      cursoId: cursoPorNome.get(l.curso)!.id, periodo: l.periodo ?? 0, letra: l.letra,
      formato: (l.formato ?? d?.formato ?? "PRESENCIAL") as Formato,
      professorId: l.professor ? profPorNome.get(l.professor)?.id ?? -1000 - [...novas.professores].indexOf(l.professor) : null,
      professorNome: l.professor ?? undefined,
      ambienteId: l.lab ? amb?.id ?? -1000 - [...novas.salas].indexOf(l.lab.codigo) : null,
      ambienteCodigo: l.lab?.codigo, ambienteCapacidade: amb?.capacidade ?? null,
      diaSemana: (l.dia as DiaSemana | null) ?? null, horaInicio: l.inicio, horaFim: l.fim,
      vagas: l.vagas, limiteAlunos: d?.limiteAlunos ?? null, consomeDeId: dono.get(l.linha) ?? null,
      permiteRodizio: d?.permiteRodizio ?? false,
    };
  });
  // Mesmo choque aparece nas duas turmas: mostra só uma vez, na linha de cima
  const choques: NonNullable<PreviaImportacao["choques"]> = [];
  for (const [linha, lista] of validarOferta(paraValidar, rodizios.map((r) => [r.disciplinaAId, r.disciplinaBId]))) {
    for (const c of lista) {
      if (c.turmaConflitanteId != null && c.turmaConflitanteId < linha) continue;
      choques.push({ linha, gravidade: c.gravidade, mensagem: c.mensagem });
    }
  }
  choques.sort((a, b) => Number(a.gravidade === "AVISO") - Number(b.gravidade === "AVISO") || a.linha - b.linha);

  const previa: PreviaImportacao = {
    ok: true, aba: leitura.aba, codigo: entrada.codigo,
    ofertaExistente: ofertaExistente
      ? { turmas: ofertaExistente._count.turmas, alteracoes: await prisma.alteracao.count({ where: { turma: { ofertaId: ofertaExistente.id } } }), status: ofertaExistente.status }
      : null,
    turmas: linhas.length,
    comunalidade: [...dono.values()].filter((d) => d != null).length,
    professoresNovos: [...novas.professores].sort(),
    disciplinasNovas: [...novas.disciplinas.values()].sort(),
    salasNovas: [...novas.salas].sort(),
    gruposNovos: [...novas.grupos].sort(),
    problemas: problemas.sort((a, b) => a.linha - b.linha),
    choques,
  };
  if (!gravar) return previa;

  if (ofertaExistente && !entrada.substituir) {
    return { ...previa, ok: false, erro: `A oferta ${entrada.codigo} já existe. Marque "Substituir" para trocar as turmas dela.` };
  }

  // ------------------------------------------------------------------ gravação
  await prisma.$transaction(
    async (tx) => {
      const profId = new Map(professores.map((p) => [p.nome, p.id]));
      for (const nome of novas.professores) profId.set(nome, (await tx.professor.create({ data: { nome } })).id);

      const ambId = new Map(ambientes.map((a) => [a.codigo, a.id]));
      for (const codigo of novas.salas) {
        ambId.set(codigo, (await tx.ambiente.create({ data: { codigo, nome: codigo, tipo: "LABORATORIO" } })).id);
      }

      const avulsa = new Map(avulsaPorChave);
      for (const [chave, nome] of novas.disciplinas) {
        const l = linhas.find((x) => x.chave === chave)!;
        const fmt = l.formato ?? "PRESENCIAL";
        const d = await tx.disciplina.create({
          data: {
            nome, codigo: null, formato: fmt, tipoAmbiente: fmt === "ASSINCRONA" ? "EAD" : l.lab ? "LABORATORIO" : "SALA",
            observacoes: "Sem código: o curso não tem matriz cadastrada ainda",
          },
        });
        avulsa.set(chave, d.id);
      }

      const grupoId = new Map(grupos.map((g) => [g.nome, g.id]));
      for (const l of linhas) {
        const nome = nomeGrupo(l);
        if (grupoId.has(nome)) continue;
        const g = await tx.grupoAlunos.create({
          data: { nome, cursoId: cursoPorNome.get(l.curso)!.id, periodo: l.periodo, letra: l.letra, turno: l.turno },
        });
        grupoId.set(nome, g.id);
      }

      let oferta = ofertaExistente;
      if (oferta) {
        await tx.turma.updateMany({ where: { ofertaId: oferta.id }, data: { consomeDeId: null } });
        await tx.turma.deleteMany({ where: { ofertaId: oferta.id } });
      } else {
        oferta = { ...(await tx.oferta.create({ data: { codigo: entrada.codigo, status: "RASCUNHO" } })), _count: { turmas: 0 } };
      }

      const turmaPorLinha = new Map<number, number>();
      const habilitacoes = new Set<string>();
      for (const l of linhas) {
        const disciplinaId = disc.get(l.linha) ?? avulsa.get(l.chave)!;
        const obs = l.profObs ? [l.profObs] : [];
        const amb = l.lab ? ambPorCodigo.get(l.lab.codigo) : undefined;
        if (l.lab && amb?.capacidade && l.lab.cap !== amb.capacidade) {
          obs.push(`Planilha informa ${l.lab.codigo}-${l.lab.cap}, mas a capacidade cadastrada é ${amb.capacidade}`);
        }
        if (dono.get(l.linha)) obs.push("Comunalidade: assiste a turma de outro curso");
        const t = await tx.turma.create({
          data: {
            ofertaId: oferta.id, disciplinaId, grupoId: grupoId.get(nomeGrupo(l))!, letra: l.letra,
            professorId: l.professor ? profId.get(l.professor)! : null, ambienteId: l.lab ? ambId.get(l.lab.codigo)! : null,
            formato: l.formato, diaSemana: l.dia, horaInicio: l.inicio, horaFim: l.fim, turno: l.turno, vagas: l.vagas,
            nomeNaPlanilha: l.disciplina, periodoNaPlanilha: l.periodoTxt, origemLinha: l.linha, observacao: obs.join("; ") || null,
          },
        });
        turmaPorLinha.set(l.linha, t.id);
        if (l.professor) habilitacoes.add(`${profId.get(l.professor)}:${disciplinaId}`);
      }
      for (const l of linhas) {
        const d = dono.get(l.linha);
        if (d) await tx.turma.update({ where: { id: turmaPorLinha.get(l.linha)! }, data: { consomeDeId: turmaPorLinha.get(d)! } });
      }

      // "Quem já deu o quê": só acrescenta o que ainda não existe
      const existentes = new Set((await tx.professorDisciplina.findMany()).map((h) => `${h.professorId}:${h.disciplinaId}`));
      for (const h of habilitacoes) {
        if (existentes.has(h)) continue;
        const [professorId, disciplinaId] = h.split(":").map(Number);
        await tx.professorDisciplina.create({ data: { professorId, disciplinaId } });
      }

      if (entrada.publicar) {
        await tx.oferta.updateMany({ where: { status: "PUBLICADA", NOT: { id: oferta.id } }, data: { status: "ARQUIVADA" } });
        await tx.oferta.update({ where: { id: oferta.id }, data: { status: "PUBLICADA" } });
      }
    },
    { timeout: 60_000 }
  );

  // a tela passa a mostrar o semestre que acabou de ser importado
  (await cookies()).set(COOKIE_OFERTA, entrada.codigo, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/");
  return { ...previa, gravado: true };
}

/** Etapa 1: lê a planilha e mostra o resultado, sem gravar. */
export async function previsualizarImportacao(form: FormData): Promise<PreviaImportacao> {
  return processar(form, false);
}

/** Etapa 2: grava a oferta (o arquivo é enviado de novo e conferido outra vez). */
export async function confirmarImportacao(form: FormData): Promise<PreviaImportacao> {
  return processar(form, true);
}
