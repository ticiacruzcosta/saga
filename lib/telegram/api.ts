// Bot API oficial do Telegram; nunca registrar TOKEN em logs.
export const TELEGRAM_TOKEN_PADRAO = "9253581552:AAHQghKtgXlK6c-eIL1yTqdbJFvkf6tq9dc";
export const TELEGRAM_WEBHOOK_SECRET_PADRAO = "4e46da63ac3e4d6e3e03784567bb2b2eff0e7a4466b6a6ef1a9692af46c994d3";
export const TELEGRAM_WORKER_SECRET_PADRAO = "62e0fb6abee0b3c23830de9577921478a13c249b0a480fc9763416661d25b8ec";

export function obterTokenTelegram(): string {
  const envToken = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  return /^\d+:[A-Za-z0-9_-]{25,}$/.test(envToken) ? envToken : TELEGRAM_TOKEN_PADRAO;
}

export function obterWebhookSecretTelegram(): string {
  return (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim() || TELEGRAM_WEBHOOK_SECRET_PADRAO;
}

export function obterWorkerSecretTelegram(): string {
  return (process.env.TELEGRAM_WORKER_SECRET ?? "").trim() || TELEGRAM_WORKER_SECRET_PADRAO;
}

export function modoTelegram(): "SIMULACAO" | "REAL" {
  return process.env.TELEGRAM_MODE === "REAL" ? "REAL" : "SIMULACAO";
}

export function telegramConfigurado(): boolean {
  return /^\d+:[A-Za-z0-9_-]{25,}$/.test(obterTokenTelegram());
}

export async function chamadaTelegram<T>(metodo: string, dados: object | FormData): Promise<T> {
  const token = obterTokenTelegram();
  if (!/^\d+:[A-Za-z0-9_-]{25,}$/.test(token)) throw new Error("Configure TELEGRAM_BOT_TOKEN no .env (BotFather).");
  const url = `https://api.telegram.org/bot${token}/${metodo}`;
  const multipart = dados instanceof FormData;
  const res = await fetch(url, {
    method: "POST",
    body: multipart ? dados : JSON.stringify(dados),
    headers: multipart ? undefined : { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  // Não incluímos detalhes da URL nas mensagens de erro; a URL contém o TOKEN.
  const resposta = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    description?: string;
    error_code?: number;
  } | null;
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
