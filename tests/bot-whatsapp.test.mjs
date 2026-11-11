import test from "node:test";
import assert from "node:assert/strict";
import {
  telefoneValido, normalizarTelefoneTesteBR, mascararTelefone, normalizarComando, diaNaData, diaHojePV,
  proximaDataDia, minutosEmHora, progrediuStatus, statusMetaParaBanco, assinaturaHorario, horarioAssinadoValido,
} from "../lib/whatsapp/texto.mjs";

test("normalização de comando do aluno", () => {
  assert.equal(normalizarComando("  sábado  "), "SABADO");
  assert.equal(normalizarComando(" Inscrever "), "INSCREVER");
});
test("não aceita número vazio ou inválido", () => {
  assert.equal(telefoneValido("+55 69 99999-1234"), "5569999991234");
  assert.equal(telefoneValido("(69) 999"), null);
});
test("datas ISO válidas, dia e próxima ocorrência", () => {
  assert.equal(diaNaData("2026-11-02"), "SEGUNDA");
  assert.equal(diaNaData("2026-02-30"), null);
  assert.equal(diaNaData("2026-11-01"), null); // domingo
  assert.equal(proximaDataDia("SEXTA", "2026-11-02"), "2026-11-06");
  assert.equal(proximaDataDia("SEGUNDA", "2026-11-02"), "2026-11-02");
  assert.equal(proximaDataDia("SEGUNDA", "2026-11-03"), "2026-11-09");
});
test("hora da aula", () => {
  assert.equal(minutosEmHora(1140), "19:00");
  assert.equal(minutosEmHora(null), "A definir");
});
test("status de entrega não regride", () => {
  assert.equal(statusMetaParaBanco("delivered"), "ENTREGUE");
  assert.equal(progrediuStatus("ENVIADO", "ENTREGUE"), true);
  assert.equal(progrediuStatus("LIDO", "ENVIADO"), false);
  assert.equal(progrediuStatus("SIMULADO", "ENTREGUE"), false);
});
test("timezone acadêmico é Porto Velho", () => {
  assert.deepEqual(diaHojePV(new Date("2026-11-03T02:30:00Z")), { iso: "2026-11-02", dia: "SEGUNDA" });
});

test("dia solicitado a partir de domingo", () => {
  assert.equal(proximaDataDia("SEXTA", "2026-11-01"), "2026-11-06");
});
test("imagem protegida por link efêmero com assinatura HMAC", () => {
  const chave = "chave-super-secreta-de-trinta-e-dois-caracteres";
  const params = { dia: "SEXTA", data: "2026-11-06", pagina: 1, exp: 1794000000 };
  const sig = assinaturaHorario(params, chave);
  assert.equal(horarioAssinadoValido({ ...params, sig }, chave, (params.exp - 20) * 1000), true);
  assert.equal(horarioAssinadoValido({ ...params, sig, dia: "QUINTA" }, chave, (params.exp - 20) * 1000), false);
  assert.equal(horarioAssinadoValido({ ...params, sig }, chave, (params.exp + 1) * 1000), false);
  assert.equal(horarioAssinadoValido({ ...params, sig: "00".repeat(32) }, chave, (params.exp - 20) * 1000), false);
});

test("telefones de teste BR aceitam DDD e codigo do pais, rejeitam entrada invalida", () => {
  assert.equal(normalizarTelefoneTesteBR("(69) 99999-1234"), "5569999991234");
  assert.equal(normalizarTelefoneTesteBR("+55 69 99999-1234"), "5569999991234");
  assert.equal(normalizarTelefoneTesteBR("69 99999"), null);
  assert.equal(normalizarTelefoneTesteBR("99999-1234"), null);
  assert.equal(normalizarTelefoneTesteBR("+1 415 555 0132"), null);
  assert.equal(normalizarTelefoneTesteBR("+55 69 99999-1234; DROP TABLE"), null);
  assert.equal(mascararTelefone("5569999991234"), "+55 (69) •••••1234");
});
