import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { receberAtualizacao } from "@/lib/telegram/handler";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const esperado = process.env.TELEGRAM_WEBHOOK_SECRET;
  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const a = Buffer.from(esperado ?? "");
  const b = Buffer.from(header);
  if (!esperado || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Não autorizado", { status: 401 });
  const tamanho = Number(req.headers.get("content-length") ?? 0);
  if (tamanho > 50000) return new Response("Payload muito grande", { status: 413 });
  let update: unknown;
  try {
    const corpo = await req.text();
    if (corpo.length > 50000) return new Response("Payload muito grande", { status: 413 });
    update = JSON.parse(corpo);
  } catch { return new Response("JSON inválido", { status: 400 }); }
  if (!update || typeof update !== "object" || !Number.isSafeInteger((update as { update_id?: number }).update_id)) return new Response("Update inválido", { status: 400 });
  try {
    await receberAtualizacao(update as { update_id: number });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Webhook Telegram: erro no processamento", e instanceof Error ? e.message : "erro");
    return NextResponse.json({ ok: false }, { status: 500 }); // Telegram tentará novamente
  }
}
