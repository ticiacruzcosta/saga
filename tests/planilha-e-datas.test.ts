import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chaveDisciplina, lerHorario, lerPeriodo, lerPlanilhaOferta } from "@/lib/planilha-oferta";
import { diaDaData, diaMes, semanasDoMes, somarDias } from "@/lib/datas";

test("planilha OFERTA_2026_2: 127 aulas e 4 linhas para conferir", async () => {
  const b = readFileSync("dados-fonte/OFERTA_2026_2.xlsx");
  const r = await lerPlanilhaOferta(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  assert.equal(r.aba, "Página1");
  assert.equal(r.linhas.length, 127);
  assert.equal(r.problemas.length, 4);
});

test("normalização de nomes, períodos e horários", () => {
  assert.equal(chaveDisciplina("RESISTÊNCIA DOS MATERIAIS - ENG. COMP."), chaveDisciplina("Resistência dos Materiais"));
  assert.equal(chaveDisciplina("PROJETO DE EXTENSÃO IV - INOVAÇÃO"), "PE:IV");
  assert.deepEqual(lerPeriodo("4º - B"), { periodo: 4, letra: "B", turno: "NOTURNO" });
  assert.deepEqual(lerHorario("19:00 - 21:45"), [1140, 1305]);
  assert.deepEqual(lerHorario("depois"), [null, null]);
});

test("datas do calendário", () => {
  assert.equal(somarDias("2026-10-31", 1), "2026-11-01");
  assert.equal(diaDaData("2026-11-02"), "SEGUNDA");
  assert.equal(diaDaData("2026-11-01"), null); // domingo
  assert.equal(diaMes("2026-11-02"), "02/11");
  const semanas = semanasDoMes(2026, 10); // novembro/2026 começa num domingo
  assert.equal(semanas[0][0], "2026-11-01");
  assert.ok(semanas.every((s) => s.length === 7));
});
