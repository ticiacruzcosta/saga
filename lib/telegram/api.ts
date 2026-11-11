// Bot API oficial do Telegram; nunca registrar TOKEN em logs.
export function modoTelegram(): "SIMULACAO" | "REAL" {
  return process.env.TELEGRAM_MODE === "REAL" ? "REAL" : "SIMULACAO";
}
export function telegramConfigurado(): boolean {
  return /^\d+:[A-Za-z0-9_-]{25,}$/.test(process.env.TELEGRAM_BOT_TOKEN ?? "");
}
export async function chamadaTelegram<T>(metodo: string, dados: object | FormData): Promise<T> {
  if (!telegramConfigurado()) throw new Error("Configure TELEGRAM_BOT_TOKEN no .env (BotFather).");
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${metodo}`;
  const multipart = dados instanceof FormData;
  const res = await fetch(url, { method: "POST", body: multipart ? dados : JSON.stringify(dados),
    headers: multipart ? undefined : { "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000) });
  // Não incluímos detalhes da URL nas mensagens de erro; a URL contém o TOKEN.
  const resposta = await res.json().catch(() => null) as { ok?: boolean; result?: T; description?: string; error_code?: number } | null;
  if (!res.ok || !resposta?.ok || resposta.result === undefined) {
    const erro = String(resposta?.description ?? `Erro HTTP ${res.status}`).slice(0, 160);
    throw new Error(`Telegram (${resposta?.error_code ?? res.status}): ${erro}`);
  }
  return resposta.result;
}
export type TelegramEnviada = { message_id: number };
export async function enviarMensagem(chatId: string, texto: string) {
  return chamadaTelegram<TelegramEnviada>("sendMessage", { chat_id: chatId, text: texto.slice(0, 4000) });
}
export async function enviarFoto(chatId: string, png: Uint8Array, legenda: string) {
  const dados = new FormData();
  dados.set("chat_id", chatId);
  dados.set("caption", legenda.slice(0, 900));
  dados.set("photo", new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }), "horario-saga.png");
  return chamadaTelegram<TelegramEnviada>("sendPhoto", dados);
}
