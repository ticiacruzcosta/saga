import { test } from "node:test";
import assert from "node:assert/strict";
import { validarOferta, validarTurma, type TurmaParaValidar } from "@/lib/validacao-choque";

const aula = (extra: Partial<TurmaParaValidar>): TurmaParaValidar => ({
  id: 1, disciplinaId: 1, disciplinaNome: "Cálculo I", disciplinaCodigo: "", cursoId: 1, periodo: 1, letra: "A",
  formato: "PRESENCIAL", professorId: null, ambienteId: null, diaSemana: "SEGUNDA", horaInicio: 1140, horaFim: 1305,
  vagas: null, limiteAlunos: null, ...extra,
});

test("professor em duas aulas no mesmo horário é erro (RN-01)", () => {
  const c = validarTurma(aula({ id: 1, professorId: 7, periodo: 1 }), [aula({ id: 2, professorId: 7, periodo: 3 })]);
  assert.equal(c.length, 1);
  assert.equal(c[0].regra, "RN-01");
  assert.equal(c[0].gravidade, "ERRO");
});

test("aulas que só encostam não conflitam (19-20 e 20-21)", () => {
  const c = validarTurma(aula({ id: 1, professorId: 7, horaFim: 1200 }), [aula({ id: 2, professorId: 7, horaInicio: 1200, horaFim: 1260 })]);
  assert.deepEqual(c, []);
});

test("mesma sala ocupada é erro, mas rodízio vira alerta (RN-02 / RN-06)", () => {
  const a = aula({ id: 1, disciplinaId: 10, periodo: 1, ambienteId: 5, ambienteCodigo: "LAB01" });
  const b = aula({ id: 2, disciplinaId: 20, periodo: 2, ambienteId: 5, ambienteCodigo: "LAB01" });
  assert.equal(validarTurma(a, [b])[0].regra, "RN-02");
  const comRodizio = validarTurma(a, [b], [[10, 20]]);
  assert.equal(comRodizio[0].regra, "RN-06");
  assert.equal(comRodizio[0].gravidade, "AVISO");
});

test("mesma turma de alunos com duas aulas no horário é erro (RN-03)", () => {
  const c = validarTurma(aula({ id: 1 }), [aula({ id: 2, disciplinaId: 2 })]);
  assert.equal(c[0].regra, "RN-03");
});

test("aula híbrida rebaixa o choque para alerta", () => {
  const c = validarTurma(aula({ id: 1, professorId: 7, formato: "HIBRIDA" }), [aula({ id: 2, professorId: 7, periodo: 3 })]);
  assert.equal(c[0].gravidade, "AVISO");
});

test("assíncrona e comunalidade nunca geram choque de horário", () => {
  assert.deepEqual(validarTurma(aula({ id: 1, professorId: 7, formato: "ASSINCRONA" }), [aula({ id: 2, professorId: 7 })]), []);
  assert.deepEqual(validarTurma(aula({ id: 1, professorId: 7 }), [aula({ id: 2, professorId: 7, consomeDeId: 9 })]), []);
});

test("capacidade do laboratório e teto da disciplina (RN-07 / RN-09)", () => {
  const regras = validarTurma(aula({ vagas: 45, ambienteCapacidade: 40, ambienteCodigo: "LAB04", limiteAlunos: 40 }), []).map((c) => c.regra);
  assert.deepEqual(regras.sort(), ["RN-07", "RN-09"]);
});

test("validarOferta devolve os conflitos por aula", () => {
  const r = validarOferta([aula({ id: 1, professorId: 7 }), aula({ id: 2, professorId: 7, periodo: 2 }), aula({ id: 3, diaSemana: "TERCA" })]);
  assert.deepEqual([...r.keys()].sort(), [1, 2]);
});
