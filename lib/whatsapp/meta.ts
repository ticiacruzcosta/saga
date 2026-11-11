import { createHmac, timingSafeEqual } from "node:crypto";
import { assinaturaHorario, diaHojePV, proximaDataDia } from "@/lib/whatsapp/texto.mjs";

export function modoBot(): "SIMULACAO" | "REAL" {
  return process.env.WHATSAPP_MODE === "REAL" ? "REAL" : "SIMULACAO";
}
export function credenciaisReaisValidas(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TEMPLATE_NAME);
}
export function assinaturaValida(corpoBruto: string, assinatura: string | null): boolean {
  const segredo = process.env.WHATSAPP_APP_SECRET;
  if (!segredo || !assinatura?.startsWith("sha256=")) return false;
  const recebido = Buffer.from(assinatura.slice(7), "hex");
  const calculado = createHmac("sha256", segredo).update(corpoBruto, "utf8").digest();
  return recebido.length === calculado.length && timingSafeEqual(recebido, calculado);
}
function endpoint() {
  const versao = process.env.WHATSAPP_GRAPH_VERSION ?? "v24.0";
  if (!/^v\d+\.\d+$/.test(versao)) throw new Error("Versão da Graph API inválida.");
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!numeroId || !/^\d+$/.test(numeroId)) throw new Error("WHATSAPP_PHONE_NUMBER_ID inválido.");
  return `https://graph.facebook.com/${versao}/${numeroId}/messages`;
}
async function enviar(payload: Record<string, unknown>): Promise<string> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) throw new Error("WHATSAPP_TOKEN não configurado.");
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => ({})) as { messages?: { id?: string }[]; error?: { message?: string; code?: number } };
  if (!response.ok || !body.messages?.[0]?.id) {
    throw new Error(`Meta ${response.status}: ${String(body.error?.message ?? "Falha ao enviar").slice(0, 180)}`);
  }
  return body.messages[0].id;
}
export async function enviarTemplate(telefone: string, conteudo: string): Promise<string> {
  if (!credenciaisReaisValidas()) throw new Error("Credenciais de envio real incompletas.");
  // O modelo aprovado deve ter a variável {{1}} no corpo.
  return enviar({ to: telefone, type: "template", template: {
    name: process.env.WHATSAPP_TEMPLATE_NAME,
    language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "pt_BR" },
    components: [{ type: "body", parameters: [{ type: "text", text: conteudo.slice(0, 900) }] }],
  } });
}
export async function responderTexto(telefone: string, conteudo: string): Promise<void> {
  if (modoBot() !== "REAL") return;
  await enviar({ to: telefone, type: "text", text: { body: conteudo.slice(0, 3500), preview_url: false } });
}
export async function responderImagem(telefone: string, dia: string): Promise<void> {
  if (modoBot() !== "REAL") return;
  const origem = process.env.WHATSAPP_SITE_URL;
  const segredo = process.env.WHATSAPP_IMAGE_SECRET;
  if (!origem || !/^https:\/\//.test(origem) || !segredo || segredo.length < 32) {
    await responderTexto(telefone, "A imagem do horário ainda não está disponível. Consulte o SAGA.");
    return;
  }
  const data = proximaDataDia(dia, diaHojePV().iso);
  if (!data) { await responderTexto(telefone, "Data de horário inválida. Tente novamente."); return; }
  const exp = Math.floor(Date.now() / 1000) + 900;
  const pagina = 1;
  const sig = assinaturaHorario({ dia, data, pagina, exp }, segredo);
  const link = `${origem.replace(/\/$/, "")}/api/whatsapp/horario?${new URLSearchParams({ dia, data, pagina: String(pagina), exp: String(exp), sig })}`;
  await enviar({ to: telefone, type: "image", image: {
    link,
    caption: `SAGA — horário de ${dia.toLowerCase()}. Confira atualizações no painel.`,
  } });
}
