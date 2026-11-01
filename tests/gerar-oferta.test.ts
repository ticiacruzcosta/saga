import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarOferta, proximoCodigo, type DisciplinaGer, type EntradaGeracao } from "@/lib/gerar-oferta";
import { validarOferta, type TurmaParaValidar } from "@/lib/validacao-choque";

const disc = (id: number, extra: Partial<DisciplinaGer> = {}): DisciplinaGer => ({
  id, nome: `Disciplina ${id}`, codigo: String(id), formato: "PRESENCIAL", tipoAmbiente: "SALA",
  ambienteFixoId: null, duracaoMinutos: 165, limiteAlunos: null, permiteRodizio: false, ...extra,
});

function cenario(extra: Partial<EntradaGeracao> = {}): EntradaGeracao {
  return {
    grupos: [
      { cursoId: 1, cursoNome: "SI", periodo: 1, letra: "A", turno: "NOTURNO", qtdAlunos: null },
      { cursoId: 1, cursoNome: "SI", periodo: 2, letra: "A", turno: "NOTURNO", qtdAlunos: null },
    ],
    matriz: new Map([[1, new Map([
      [2, [disc(1), disc(2, { tipoAmbiente: "LABORATORIO" }), disc(3)]],
      [3, [disc(4), disc(5, { formato: "ASSINCRONA", tipoAmbiente: "EAD" })]],
    ])]]),
    habilitacoes: new Map([[1, [100]], [2, [100]], [4, [100]]]),
    ambientes: [{ id: 50, codigo: "LAB01", tipo: "LABORATORIO", capacidade: 40 }],
    pares: [],
    compartilhadas: new Set(),
    abrirPrimeiro: false,
    ...extra,
  };
}

test("próximo código de semestre", () => {
  assert.equal(proximoCodigo("2026.2"), "2027.1");
  assert.equal(proximoCodigo("2027.1"), "2027.2");
});

test("turmas avançam um período e o último se forma", () => {
  const r = gerarOferta(cenario());
  assert.deepEqual(r.grupos.map((g) => g.periodo).sort(), [2, 3]);
  const soUltimo = gerarOferta(cenario({ grupos: [{ cursoId: 1, cursoNome: "SI", periodo: 3, letra: "A", turno: "NOTURNO", qtdAlunos: null }] }));
  assert.deepEqual(soUltimo.formados, ["SI 3º A"]);
});

test("tudo é encaixado sem choque, laboratório no lab e EAD sem horário", () => {
  const r = gerarOferta(cenario());
  assert.equal(r.turmas.length, 5);
  assert.ok(r.turmas.filter((t) => t.formato !== "ASSINCRONA").every((t) => t.dia), "todas as presenciais com dia");
  assert.equal(r.turmas.find((t) => t.disciplina.id === 2)!.ambienteId, 50);
  assert.equal(r.turmas.find((t) => t.disciplina.id === 5)!.dia, null);
  const paraValidar: TurmaParaValidar[] = r.turmas.map((t, i) => ({
    id: i, disciplinaId: t.disciplina.id, disciplinaNome: t.disciplina.nome, disciplinaCodigo: "", cursoId: t.grupo.cursoId,
    periodo: t.grupo.periodo, letra: t.grupo.letra, formato: t.formato, professorId: t.professorId, ambienteId: t.ambienteId,
    diaSemana: t.dia, horaInicio: t.inicio, horaFim: t.fim, vagas: null, limiteAlunos: null,
  }));
  const erros = [...validarOferta(paraValidar).values()].flat().filter((c) => c.gravidade === "ERRO");
  assert.equal(erros.length, 0);
});

test("professor não é escalado em dia indisponível", () => {
  const r = gerarOferta(cenario({ indisponiveis: new Map([[100, ["SEGUNDA", "TERCA"]]]) }));
  for (const t of r.turmas.filter((x) => x.professorId === 100)) {
    assert.ok(!["SEGUNDA", "TERCA"].includes(t.dia!), `${t.disciplina.nome} caiu em ${t.dia}`);
  }
});

test("disciplina que ninguém deu fica sem professor e marcada", () => {
  const semProf = gerarOferta(cenario()).turmas.find((t) => t.disciplina.id === 3)!;
  assert.equal(semProf.professorId, null);
  assert.ok(semProf.problemas.some((p) => p.includes("Nenhum professor")));
});
