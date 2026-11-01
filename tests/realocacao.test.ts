import { test } from "node:test";
import assert from "node:assert/strict";
import { conferirOpcao, opcoesRealocacao, planejarTudo, type ContextoRealocacao } from "@/lib/realocacao";
import type { TurmaParaValidar } from "@/lib/validacao-choque";

const aula = (id: number): TurmaParaValidar => ({
  id, disciplinaId: id, disciplinaNome: `D${id}`, disciplinaCodigo: "", cursoId: 1, periodo: id, letra: "A",
  formato: "PRESENCIAL", professorId: null, ambienteId: 1, ambienteCodigo: "LAB01", diaSemana: "SEXTA",
  horaInicio: 1140, horaFim: 1305, vagas: null, limiteAlunos: null,
});

/** Duas aulas no LAB01, sexta 19h: choque de sala. */
function contexto(): ContextoRealocacao {
  const turmas = [aula(1), aula(2)];
  return {
    turmas,
    ambientes: [
      { id: 1, codigo: "LAB01", tipo: "LABORATORIO", capacidade: 40 },
      { id: 2, codigo: "LAB02", tipo: "LABORATORIO", capacidade: 40 },
    ],
    pares: [],
    turno: new Map(turmas.map((t) => [t.id!, "NOTURNO"])),
    ambienteFixo: new Map(),
    diasIndisponiveis: new Map(),
  };
}

test("a melhor opção muda só a sala", () => {
  const [melhor] = opcoesRealocacao(contexto(), 1);
  assert.equal(melhor.muda, "Só a sala");
  assert.equal(melhor.ambienteCodigo, "LAB02");
  assert.equal(melhor.dia, "SEXTA");
});

test("posição ocupada é recusada ao conferir", () => {
  assert.equal(conferirOpcao(contexto(), 1, { dia: "SEXTA", inicio: 1140, fim: 1305, ambienteId: 1 }).ok, false);
});

test("resolver todos move só uma das aulas do choque", () => {
  const { movimentos, semSolucao } = planejarTudo(contexto());
  assert.equal(movimentos.length, 1);
  assert.equal(semSolucao.length, 0);
});
