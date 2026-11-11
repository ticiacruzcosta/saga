import test from "node:test";
import assert from "node:assert/strict";
import { interpretarComando, idPositivo, chatPrivado, DIAS_TELEGRAM } from "../lib/telegram/comandos.mjs";

test("comandos com / e menção ao bot", () => {
  assert.deepEqual(interpretarComando("/TURMA@MeuBot 12"), { nome: "turma", argumento: "12" });
  assert.deepEqual(interpretarComando("/SÉXTA"), { nome: "sexta", argumento: "" });
  assert.equal(DIAS_TELEGRAM.sexta, "SEXTA");
});
test("IDs inválidos não selecionam turmas", () => {
  assert.equal(idPositivo("12"), 12);
  for (const x of ["-1", "1;delete", "1.2", "0", "99999999999999"]) assert.equal(idPositivo(x), null);
});
test("apenas mensagens em conversas privadas", () => {
  assert.equal(chatPrivado({ message: { chat: { id: 10, type: "group" }, text: "/start" } }), null);
  assert.equal(chatPrivado({ message: { chat: { id: 10, type: "private" }, text: "/start" } })?.chat.id, 10);
  assert.equal(chatPrivado({ message: { chat: { id: 10, type: "private" } } }), null);
});
