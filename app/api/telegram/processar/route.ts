import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processarTelegram } from "@/lib/telegram/fila";
export const runtime = "nodejs";

// Worker opcional, exclusivo para ambiente de produção; POST autenticado.
export async function POST(req: NextRequest) {
  const a = Buffer.from(process.env.TELEGRAM_WORKER_SECRET ?? "");
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/, "") ?? "";
  const b = Buffer.from(recebido);
  if (!a.length || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Não autorizado", { status: 401 });
  try { return NextResponse.json(await processarTelegram(15)); }
  catch (e) { console.error("Fila Telegram", e instanceof Error ? e.message : "erro"); return NextResponse.json({ ok: false }, { status: 500 }); }
}
