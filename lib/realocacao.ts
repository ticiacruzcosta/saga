// Busca de nova posição (dia/horário/sala) para uma aula com conflito.
// Nunca troca o professor nem move outras aulas; turmas em comunalidade acompanham a aula.
// Trabalha em memória, o que permite simular várias mudanças seguidas ("Resolver todos").

import { validarTurma, type Conflito, type DiaSemana, type TurmaParaValidar } from "./validacao-choque";

export type AmbienteRealoc = { id: number; codigo: string; tipo: string; capacidade: number | null };

export type ContextoRealocacao = {
  turmas: TurmaParaValidar[]; // a oferta inteira, inclusive as turmas que assistem a outra
  ambientes: AmbienteRealoc[];
  pares: Array<[number, number]>;
  turno: Map<number, string>; // turmaId -> NOTURNO | VESPERTINO
  ambienteFixo: Map<number, number | null>; // turmaId -> ambiente obrigatório da disciplina
  diasIndisponiveis: Map<number, string[]>; // professorId -> ["SEGUNDA", ...]
};

export type OpcaoRealocacao = {
  dia: DiaSemana;
  inicio: number;
  fim: number;
  ambienteId: number | null;
  ambienteCodigo: string | null;
  muda: string; // "Só a sala", "Dia e horário"...
  avisos: string[]; // alertas amarelos que continuam (ex.: rodízio)
  custo: number;
};

const DIAS_UTEIS: DiaSemana[] = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"];

/** Janela de cada turno, para não sugerir 15:00 a uma turma da noite. */
function noTurno(turno: string, inicio: number) {
  return turno === "VESPERTINO" ? inicio >= 12 * 60 && inicio < 18 * 60 : inicio >= 18 * 60;
}

const ocupa = (t: TurmaParaValidar) => t.formato !== "ASSINCRONA" && t.diaSemana != null && t.horaInicio != null && t.horaFim != null;

/** Conflitos que a turma tem hoje. */
export function conflitosDe(ctx: ContextoRealocacao, turmaId: number): Conflito[] {
  const t = ctx.turmas.find((x) => x.id === turmaId);
  return t ? validarTurma(t, ctx.turmas, ctx.pares) : [];
}

/** Por que a turma não pode ser realocada (ou null se pode). */
export function motivoNaoRealocar(t: TurmaParaValidar | undefined): string | null {
  if (!t) return "Turma não encontrada.";
  if (t.consomeDeId) return "Esta turma assiste a aula de outro curso. Realoque a aula principal.";
  if (!ocupa(t)) return "Aula sem dia e horário (EAD ou não informado): não tem o que realocar.";
  return null;
}

/**
 * Confere uma posição candidata para a turma e para quem assiste junto.
 * Devolve os conflitos (só da turma) ou null se alguma turma de comunalidade
 * ficaria com choque.
 */
function avaliar(ctx: ContextoRealocacao, t: TurmaParaValidar, cand: TurmaParaValidar): Conflito[] | null {
  const outras = ctx.turmas.filter((x) => x.id !== t.id);
  const conflitos = validarTurma(cand, outras, ctx.pares);

  const amb = ctx.ambientes.find((a) => a.id === cand.ambienteId);
  if (amb && amb.capacidade == null && cand.vagas != null) {
    conflitos.push({ regra: "RN-07", gravidade: "AVISO", mensagem: `A capacidade de ${amb.codigo} não está cadastrada.` });
  }
  if (cand.professorId != null && ctx.diasIndisponiveis.get(cand.professorId)?.includes(cand.diaSemana!)) {
    conflitos.push({ regra: "RN-01", gravidade: "ERRO", mensagem: `${cand.professorNome} não dá aula nesse dia.` });
  }

  // Comunalidade: os alunos do outro curso também mudam de horário
  for (const c of ctx.turmas.filter((x) => x.consomeDeId === t.id)) {
    const copia: TurmaParaValidar = {
      ...c, consomeDeId: null, professorId: null, ambienteId: null,
      diaSemana: cand.diaSemana, horaInicio: cand.horaInicio, horaFim: cand.horaFim,
    };
    const deles = validarTurma(copia, outras.filter((x) => x.id !== c.id), ctx.pares);
    if (deles.some((x) => x.gravidade === "ERRO")) return null;
  }
  return conflitos;
}

function descreverMudanca(sala: boolean, dia: boolean, hora: boolean) {
  const partes = [dia && "dia", hora && "horário", sala && "sala"].filter(Boolean) as string[];
  if (partes.length === 1) return `Só ${partes[0] === "sala" ? "a sala" : "o " + partes[0]}`;
  return partes.join(" e ").replace(/^./, (x) => x.toUpperCase());
}

/** Opções sem choque para a turma, da que muda menos para a que muda mais. */
export function opcoesRealocacao(ctx: ContextoRealocacao, turmaId: number, limite = 6): OpcaoRealocacao[] {
  const t = ctx.turmas.find((x) => x.id === turmaId);
  if (!t || motivoNaoRealocar(t)) return [];
  const duracao = t.horaFim! - t.horaInicio!;
  const turno = ctx.turno.get(t.id!) ?? "NOTURNO";

  // Horários de início que a própria oferta já usa para aulas desse tamanho
  const inicios = new Set([t.horaInicio!]);
  for (const x of ctx.turmas) {
    if (ocupa(x) && x.horaFim! - x.horaInicio! === duracao && noTurno(turno, x.horaInicio!) && ctx.turno.get(x.id!) === turno) inicios.add(x.horaInicio!);
  }

  const dias = DIAS_UTEIS.includes(t.diaSemana!) ? DIAS_UTEIS : [...DIAS_UTEIS, t.diaSemana!];

  // Sala: disciplina com sala fixa não sai dela; laboratório comum pode ir para outro laboratório
  const atual = ctx.ambientes.find((a) => a.id === t.ambienteId);
  const fixo = ctx.ambienteFixo.get(t.id!) ?? null;
  const salas: Array<AmbienteRealoc | null> =
    t.formato === "SINCRONA" || !atual ? [null]
    : fixo || atual.tipo !== "LABORATORIO" ? [atual]
    : ctx.ambientes.filter((a) => a.tipo === "LABORATORIO");

  const opcoes: OpcaoRealocacao[] = [];
  for (const dia of dias) {
    for (const inicio of inicios) {
      for (const amb of salas) {
        const mudaDia = dia !== t.diaSemana;
        const mudaHora = inicio !== t.horaInicio;
        const mudaSala = (amb?.id ?? null) !== t.ambienteId;
        if (!mudaDia && !mudaHora && !mudaSala) continue; // é onde já está
        const cand: TurmaParaValidar = {
          ...t, diaSemana: dia, horaInicio: inicio, horaFim: inicio + duracao,
          ambienteId: amb?.id ?? null, ambienteCodigo: amb?.codigo, ambienteCapacidade: amb?.capacidade ?? null,
        };
        const conflitos = avaliar(ctx, t, cand);
        if (!conflitos || conflitos.some((c) => c.gravidade === "ERRO")) continue;
        const avisos = conflitos.map((c) => c.mensagem);
        if (mudaSala && amb && amb.capacidade == null && !avisos.some((a) => a.includes(amb.codigo))) {
          avisos.push(`${amb.codigo} não tem capacidade cadastrada: confira se a turma cabe.`);
        }
        opcoes.push({
          dia, inicio, fim: inicio + duracao, ambienteId: amb?.id ?? null, ambienteCodigo: amb?.codigo ?? null,
          muda: descreverMudanca(mudaSala, mudaDia, mudaHora), avisos,
          custo: Number(mudaSala) + Number(mudaHora) + 2 * Number(mudaDia) + 0.5 * avisos.length + (amb && amb.capacidade == null ? 0.3 : 0),
        });
      }
    }
  }
  // Mesma ordem de dia/horário que a grade usa quando o custo empata
  return opcoes
    .sort((a, b) => a.custo - b.custo || DIAS_UTEIS.indexOf(a.dia) - DIAS_UTEIS.indexOf(b.dia) || a.inicio - b.inicio)
    .slice(0, limite);
}

/** Confere uma opção específica (usado antes de gravar: a oferta pode ter mudado). */
export function conferirOpcao(
  ctx: ContextoRealocacao, turmaId: number, o: { dia: string; inicio: number; fim: number; ambienteId: number | null }
): { ok: boolean; mensagem?: string } {
  const t = ctx.turmas.find((x) => x.id === turmaId);
  const motivo = motivoNaoRealocar(t);
  if (motivo) return { ok: false, mensagem: motivo };
  const amb = ctx.ambientes.find((a) => a.id === o.ambienteId);
  const conflitos = avaliar(ctx, t!, {
    ...t!, diaSemana: o.dia as DiaSemana, horaInicio: o.inicio, horaFim: o.fim,
    ambienteId: amb?.id ?? null, ambienteCodigo: amb?.codigo, ambienteCapacidade: amb?.capacidade ?? null,
  });
  if (!conflitos) return { ok: false, mensagem: "A turma que assiste junto (comunalidade) ficaria com choque." };
  const erro = conflitos.find((c) => c.gravidade === "ERRO");
  return erro ? { ok: false, mensagem: erro.mensagem } : { ok: true };
}

/** Aplica a mudança na lista em memória (a turma e quem assiste junto). */
export function aplicarNoContexto(ctx: ContextoRealocacao, turmaId: number, o: OpcaoRealocacao) {
  ctx.turmas = ctx.turmas.map((x) => {
    if (x.id === turmaId) {
      const amb = ctx.ambientes.find((a) => a.id === o.ambienteId);
      return { ...x, diaSemana: o.dia, horaInicio: o.inicio, horaFim: o.fim, ambienteId: o.ambienteId, ambienteCodigo: amb?.codigo, ambienteCapacidade: amb?.capacidade ?? null };
    }
    if (x.consomeDeId === turmaId) return { ...x, diaSemana: o.dia, horaInicio: o.inicio, horaFim: o.fim, ambienteId: o.ambienteId };
    return x;
  });
}

/**
 * "Resolver todos": vai pelas turmas com choque (as mais problemáticas primeiro),
 * move uma de cada vez para a melhor opção e confere de novo, porque mover uma
 * aula costuma resolver o choque da outra também.
 */
export function planejarTudo(ctx: ContextoRealocacao) {
  const comErro = ctx.turmas
    .filter((t) => !motivoNaoRealocar(t))
    .map((t) => ({ id: t.id!, erros: conflitosDe(ctx, t.id!).filter((c) => c.gravidade === "ERRO").length }))
    .filter((x) => x.erros > 0)
    .sort((a, b) => b.erros - a.erros || a.id - b.id);

  const movimentos: Array<{ turmaId: number; opcao: OpcaoRealocacao; motivo: string }> = [];
  const semSolucao: Array<{ turmaId: number; motivo: string }> = [];
  for (const { id } of comErro) {
    const erros = conflitosDe(ctx, id).filter((c) => c.gravidade === "ERRO");
    if (erros.length === 0) continue; // já resolvido por um movimento anterior
    const [melhor] = opcoesRealocacao(ctx, id, 1);
    if (!melhor) {
      semSolucao.push({ turmaId: id, motivo: erros[0].mensagem });
      continue;
    }
    movimentos.push({ turmaId: id, opcao: melhor, motivo: erros[0].mensagem });
    aplicarNoContexto(ctx, id, melhor);
  }
  // Uma turma sem opção pode ter sido liberada depois, quando a outra do choque mudou
  return { movimentos, semSolucao: semSolucao.filter((s) => conflitosDe(ctx, s.turmaId).some((c) => c.gravidade === "ERRO")) };
}
