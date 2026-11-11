import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { processarFila } from "@/lib/whatsapp/fila";
export const runtime = "nodejs";

// Uso opcional por cron externo seguro: POST /api/whatsapp/processar
// Authorization: Bearer <WHATSAPP_WORKER_SECRET>. Nunca publique o segredo.
export async function POST(req: NextRequest) {
  const segredo = process.env.WHATSAPP_WORKER_SECRET;
  const recebido = req.headers.get("authorization")?.replace(/^Bearer\s+/, "");
  const a = Buffer.from(segredo ?? "");
  const b = Buffer.from(recebido ?? "");
  if (!segredo || !recebido || a.length !== b.length || !timingSafeEqual(a, b)) return new Response("Não autorizado", { status: 401 });
  try {
    return NextResponse.json(await processarFila(15));
  } catch (e) {
    console.error("Worker do SAGA:", e instanceof Error ? e.message : "erro");
    return NextResponse.json({ error: "Falha no processamento; verifique configuração e logs." }, { status: 500 });
  }
}
