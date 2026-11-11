import { createHmac, timingSafeEqual } from "node:crypto";
// Helpers puros para testes via node --test e uso no Next.js.
export const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"];
export const DIA_NOME = {
  SEGUNDA: "Segunda-feira", TERCA: "Terça-feira", QUARTA: "Quarta-feira",
  QUINTA: "Quinta-feira", SEXTA: "Sexta-feira", SABADO: "Sábado",
};
export function normalizarComando(valor) {
  return String(valor ?? "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}
export function telefoneValido(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return /^\d{10,15}$/.test(digitos) ? digitos : null;
}
/** Aceita telefone BR com DDD (10/11 dígitos) ou país 55 (12/13 dígitos). */
export function normalizarTelefoneTesteBR(valor) {
  const texto = String(valor ?? "").trim();
  if (!/^[+\d\s()\-.]+$/.test(texto)) return null;
  let digitos = texto.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`;
  if (!/^55[1-9]\d[2-9]\d{7,8}$/.test(digitos)) return null;
  return digitos;
}

export function mascararTelefone(numero) {
  const n = String(numero ?? "");
  if (!/^55\d{10,11}$/.test(n)) return "Número protegido";
  return `+55 (${n.slice(2, 4)}) ${"•".repeat(n.length - 8)}${n.slice(-4)}`;
}

export function minutosEmHora(minutos) {
  if (minutos === null || minutos === undefined || !Number.isInteger(minutos)) return "A definir";
  return `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
}
export function diaNaData(dataISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) return null;
  const d = new Date(`${dataISO}T00:00:00.000Z`);
  if (Number.isNaN(d.valueOf()) || d.toISOString().slice(0, 10) !== dataISO) return null;
  const indice = d.getUTCDay();
  return indice === 0 ? null : DIAS[indice - 1];
}
export function diaHojePV(data = new Date()) {
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho" }).format(data);
  return { iso, dia: diaNaData(iso) };
}
export function nomeDoDia(str) { return DIA_NOME[str] ?? str; }
export function statusMetaParaBanco(str) {
  return ({ sent: "ENVIADO", delivered: "ENTREGUE", read: "LIDO", failed: "FALHOU" })[str] ?? null;
}
export function progrediuStatus(anterior, proximo) {
  if (anterior === "FALHOU" || anterior === "CANCELADO" || anterior === "SIMULADO") return false;
  if (proximo === "FALHOU") return anterior !== "LIDO" && anterior !== "ENTREGUE";
  const ordem = { PENDENTE: 0, PROCESSANDO: 1, ENVIADO: 2, ENTREGUE: 3, LIDO: 4 };
  return (ordem[proximo] ?? -1) > (ordem[anterior] ?? -1);
}

export function proximaDataDia(dia, aPartirDeISO) {
  if (!DIAS.includes(dia) || !/^\d{4}-\d{2}-\d{2}$/.test(aPartirDeISO)) return null;
  const conferida = new Date(`${aPartirDeISO}T00:00:00.000Z`);
  if (Number.isNaN(conferida.valueOf()) || conferida.toISOString().slice(0, 10) !== aPartirDeISO) return null;
  const inicio = new Date(`${aPartirDeISO}T00:00:00.000Z`);
  const indiceAtual = inicio.getUTCDay();
  const indiceDestino = DIAS.indexOf(dia) + 1;
  const diferenca = (indiceDestino - indiceAtual + 7) % 7;
  inicio.setUTCDate(inicio.getUTCDate() + diferenca);
  return inicio.toISOString().slice(0, 10);
}

/** Link efêmero para permitir que a Meta busque o PNG sem tornar toda a grade pública. */
export function assinaturaHorario({ dia, data, pagina, exp }, chave) {
  return createHmac("sha256", chave).update(`${dia}|${data}|${pagina}|${exp}`).digest("hex");
}
export function horarioAssinadoValido(params, chave, agora = Date.now()) {
  if (!chave || !DIAS.includes(params.dia) || diaNaData(params.data) !== params.dia || !Number.isInteger(params.pagina) || params.pagina < 1 || params.pagina > 100) return false;
  if (!Number.isSafeInteger(params.exp) || params.exp < Math.floor(agora / 1000) || params.exp > Math.floor(agora / 1000) + 1800) return false;
  if (!/^[a-f0-9]{64}$/.test(params.sig)) return false;
  const esperado = Buffer.from(assinaturaHorario(params, chave), "hex");
  const recebido = Buffer.from(params.sig, "hex");
  return recebido.length === esperado.length && timingSafeEqual(esperado, recebido);
}
