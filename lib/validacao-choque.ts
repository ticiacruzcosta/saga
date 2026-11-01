// Validação de choques da oferta: regras RN-01 a RN-07 e RN-09.

import { minutosParaHora } from "./rotulos";

export type Formato = "PRESENCIAL" | "HIBRIDA" | "SINCRONA" | "ASSINCRONA";
export type DiaSemana = "SEGUNDA" | "TERCA" | "QUARTA" | "QUINTA" | "SEXTA" | "SABADO";

export interface TurmaParaValidar {
  id?: number;
  disciplinaId: number;
  disciplinaNome: string;
  disciplinaCodigo: string;
  cursoId: number;
  periodo: number;
  letra: string;
  formato: Formato;
  professorId: number | null;
  professorNome?: string;
  ambienteId: number | null;
  ambienteCodigo?: string;
  ambienteCapacidade?: number | null;
  diaSemana: DiaSemana | null;
  horaInicio: number | null; // minutos desde a meia-noite: 19:00 = 1140
  horaFim: number | null;
  vagas: number | null;
  limiteAlunos: number | null;
  // Comunalidade: a turma assiste a aula de outra e não ocupa professor nem sala.
  consomeDeId?: number | null;
  permiteRodizio?: boolean;
}

export interface Conflito {
  regra: string;
  gravidade: "ERRO" | "AVISO";
  mensagem: string;
  turmaConflitanteId?: number;
}

/** Encostar não é sobrepor: 19:00-20:00 e 20:00-21:00 convivem (RN-11). */
function haSobreposicao(inicioA: number, fimA: number, inicioB: number, fimB: number): boolean {
  return inicioA < fimB && inicioB < fimA;
}

/** RN-04: aula assíncrona não ocupa dia, sala nem professor. */
function ocupaHorario(t: TurmaParaValidar): boolean {
  return t.formato !== "ASSINCRONA" && t.diaSemana !== null && t.horaInicio !== null;
}

/** RN-05: aula síncrona ocupa professor e alunos, mas não sala física. */
function ocupaAmbiente(t: TurmaParaValidar): boolean {
  return t.formato === "PRESENCIAL" || t.formato === "HIBRIDA";
}

const ROTULO_DIA: Record<string, string> = { TERCA: "TERÇA", SABADO: "SÁBADO" };
const rotuloDia = (d: string | null) => (d ? ROTULO_DIA[d] ?? d : "");
const proximaLetra = (letra: string) => String.fromCharCode(letra.charCodeAt(0) + 1);

/**
 * Valida uma turma nova (ou editada) contra as demais da oferta.
 * `paresRodizio`: pares [disciplinaAId, disciplinaBId] que podem dividir laboratório (RN-06).
 */
export function validarTurma(
  nova: TurmaParaValidar,
  existentes: TurmaParaValidar[],
  paresRodizio: Array<[number, number]> = []
): Conflito[] {
  const conflitos: Conflito[] = [];

  // RN-07: capacidade do ambiente
  if (nova.vagas != null && nova.ambienteCapacidade != null && nova.vagas > nova.ambienteCapacidade) {
    conflitos.push({
      regra: "RN-07",
      gravidade: "ERRO",
      mensagem: `${nova.vagas} vagas não cabem em ${nova.ambienteCodigo} (capacidade ${nova.ambienteCapacidade}).`,
    });
  }

  // RN-09: teto de alunos da disciplina
  if (nova.vagas != null && nova.limiteAlunos != null && nova.vagas > nova.limiteAlunos) {
    conflitos.push({
      regra: "RN-09",
      gravidade: "ERRO",
      mensagem: `${nova.disciplinaNome} tem teto de ${nova.limiteAlunos} alunos por turma. Abra uma turma ${proximaLetra(nova.letra)}.`,
    });
  }

  if (!ocupaHorario(nova) || nova.consomeDeId) return conflitos;

  for (const outra of existentes) {
    if (outra.id != null && outra.id === nova.id) continue;
    if (!ocupaHorario(outra) || outra.consomeDeId) continue;
    if (outra.diaSemana !== nova.diaSemana) continue;
    if (!haSobreposicao(nova.horaInicio!, nova.horaFim!, outra.horaInicio!, outra.horaFim!)) continue;

    const quando = `${rotuloDia(nova.diaSemana)} ${minutosParaHora(nova.horaInicio)}-${minutosParaHora(nova.horaFim)}`;

    // Aula híbrida pode alternar semanas (a planilha não informa): vira aviso, não erro.
    const hibrida = nova.formato === "HIBRIDA" || outra.formato === "HIBRIDA";
    const gravidade: Conflito["gravidade"] = hibrida ? "AVISO" : "ERRO";
    const nota = hibrida ? " (aula híbrida: confirme se alterna semanas)" : "";

    // RN-01: professor em duas aulas ao mesmo tempo
    if (nova.professorId != null && nova.professorId === outra.professorId) {
      conflitos.push({
        regra: "RN-01",
        gravidade,
        mensagem: `${nova.professorNome ?? "O professor"} já está em ${outra.disciplinaNome} (turma ${outra.letra}) ${quando}.${nota}`,
        turmaConflitanteId: outra.id,
      });
    }

    // RN-02: sala ocupada (RN-06: disciplinas em rodízio podem dividir o laboratório)
    if (ocupaAmbiente(nova) && ocupaAmbiente(outra) && nova.ambienteId != null && nova.ambienteId === outra.ambienteId) {
      const ehRodizio =
        paresRodizio.some(
          ([a, b]) =>
            (a === nova.disciplinaId && b === outra.disciplinaId) || (b === nova.disciplinaId && a === outra.disciplinaId)
        ) || Boolean(nova.permiteRodizio && outra.permiteRodizio);
      conflitos.push(
        ehRodizio
          ? {
              regra: "RN-06",
              gravidade: "AVISO",
              mensagem: `${nova.ambienteCodigo} compartilhado com ${outra.disciplinaNome} em rodízio semanal. Confira a escala.`,
              turmaConflitanteId: outra.id,
            }
          : {
              regra: "RN-02",
              gravidade: "ERRO",
              mensagem: `${nova.ambienteCodigo} já está ocupado por ${outra.disciplinaNome} ${quando}.`,
              turmaConflitanteId: outra.id,
            }
      );
    }

    // RN-03: a mesma turma de alunos com duas aulas ao mesmo tempo
    if (nova.cursoId === outra.cursoId && nova.periodo === outra.periodo && nova.letra === outra.letra) {
      conflitos.push({
        regra: "RN-03",
        gravidade,
        mensagem: `${nova.periodo}º período turma ${nova.letra} já tem ${outra.disciplinaNome} ${quando}.${nota}`,
        turmaConflitanteId: outra.id,
      });
    }
  }

  return conflitos;
}

/** Valida a oferta inteira. Devolve os conflitos por id de turma. */
export function validarOferta(
  turmas: TurmaParaValidar[],
  paresRodizio: Array<[number, number]> = []
): Map<number, Conflito[]> {
  const resultado = new Map<number, Conflito[]>();
  turmas.forEach((t, i) => {
    const c = validarTurma(t, turmas.filter((_, j) => j !== i), paresRodizio);
    if (c.length > 0) resultado.set(t.id ?? i, c);
  });
  return resultado;
}
