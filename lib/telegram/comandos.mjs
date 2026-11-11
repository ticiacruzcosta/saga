// Mantemos o parser isolado para testar sem Next, Prisma ou rede.
export const DIAS_TELEGRAM = { segunda: "SEGUNDA", terca: "TERCA", quarta: "QUARTA", quinta: "QUINTA", sexta: "SEXTA", sabado: "SABADO" };
export function interpretarComando(texto) {
  const partes = String(texto ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return { nome: "", argumento: "" };
  const nome = partes[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/@[-_a-z0-9]+$/i, "").replace(/^\//, "");
  const argumento = partes.slice(1).join(" ");
  return { nome, argumento };
}
export function idPositivo(texto) {
  if (!/^[1-9]\d{0,8}$/.test(String(texto ?? "").trim())) return null;
  const n = Number(texto);
  return Number.isSafeInteger(n) ? n : null;
}
export function chatPrivado(update) {
  const m = update?.message;
  return m && m.chat?.type === "private" && Number.isSafeInteger(m.chat?.id) && typeof m.text === "string" ? m : null;
}
