import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveCurso, planejarCursos, sugerirSigla } from "@/lib/cursos-importacao";

test("cadastra novos cursos sem lista fixa: Direito e Medicina", () => {
  const plano = planejarCursos([], ["Direito", "Medicina", "direito", "MEDICINA"]);
  assert.deepEqual(plano.novos.map((c) => [c.nome, c.sigla]), [["DIREITO", "DIR"], ["MEDICINA", "MED"]]);
});

test("reconhece abreviação e nome extenso como um único curso existente", () => {
  const existentes = [
    { id: 1, nome: "ENG. COMPUTAÇÃO", sigla: "EC" },
    { id: 2, nome: "SIST. DE INFORM.", sigla: "SI" },
  ];
  const plano = planejarCursos(existentes, ["Engenharia de Computação", "ENG. COMPUTAÇÃO", "Sistemas de Informação"]);
  assert.equal(plano.novos.length, 0);
  assert.equal(plano.porChave.get(chaveCurso("Engenharia de Computação"))?.id, 1);
  assert.equal(plano.porChave.get(chaveCurso("Sistemas de Informação"))?.id, 2);
});

test("nunca confunde cursos por substring ou semelhança", () => {
  const plano = planejarCursos([{ id: 3, nome: "MEDICINA VETERINÁRIA", sigla: "MV" }], ["Medicina", "Medicina Veterinária"]);
  assert.equal(plano.novos.length, 1);
  assert.equal(plano.novos[0].nome, "MEDICINA");
});

test("siglas novas não colidem com as já cadastradas", () => {
  const plano = planejarCursos([{ id: 1, nome: "CURSO DE DIREITO", sigla: "DIR" }], ["Direito", "Design Industrial", "Design de Interiores"]);
  assert.deepEqual(plano.novos.map((c) => c.sigla), ["DIR2", "DI", "DI2"]);
});

test("não permite dois cursos equivalentes já cadastrados sem revisão", () => {
  assert.throws(() => planejarCursos([
    { id: 1, nome: "ENG. COMPUTAÇÃO", sigla: "EC" },
    { id: 2, nome: "ENGENHARIA DE COMPUTAÇÃO", sigla: "ECO" },
  ], ["Eng. Computação"]), /parecem equivalentes/);
});

test("gera siglas gerais para cursos sem alias", () => {
  assert.equal(sugerirSigla("Psicologia"), "PSI");
  assert.equal(sugerirSigla("Ciências Contábeis"), "CC");
});
