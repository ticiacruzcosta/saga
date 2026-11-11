import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assinaturaValida, responderImagem, responderTexto } from "@/lib/whatsapp/meta";
import { diaHojePV, DIAS, normalizarComando, progrediuStatus, statusMetaParaBanco, telefoneValido } from "@/lib/whatsapp/texto.mjs";
export const runtime = "nodejs";

type Mensagem = { id?: string; from?: string; type?: string; text?: { body?: string }; button?: { text?: string } };
type Status = { id?: string; status?: string; errors?: { title?: string }[] };
type Mudanca = { value?: { messages?: Mensagem[]; statuses?: Status[] } };
type Payload = { object?: string; entry?: { changes?: Mudanca[] }[] };

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams;
  if (u.get("hub.mode") !== "subscribe" || !process.env.WHATSAPP_VERIFY_TOKEN) return new Response("Não autorizado", { status: 403 });
  if (u.get("hub.verify_token") !== process.env.WHATSAPP_VERIFY_TOKEN) return new Response("Não autorizado", { status: 403 });
  return new Response(u.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
}

async function receberMensagem(msg: Mensagem) {
  if (!msg.id) return;
  try {
    await prisma.whatsappEvento.create({ data: { id: msg.id } });
  } catch (erro) {
    if ((erro as { code?: string })?.code === "P2002") return; // retry da Meta, não executar duas vezes
    throw erro;
  }
  const telefone = telefoneValido(msg.from);
  if (!telefone) return;
  const comando = normalizarComando(msg.text?.body ?? msg.button?.text);
  if (!comando) return;
  if (comando === "INSCREVER" || comando === "QUERO RECEBER") {
    await prisma.whatsappAssinante.upsert({
      where: { telefone },
      create: { telefone, ativo: true, aceitouEm: new Date(), apenasSimulacao: false },
      update: { ativo: true, aceitouEm: new Date(), cancelouEm: null, apenasSimulacao: false },
    });
    await responderTexto(telefone, "Inscrição confirmada! Você receberá avisos acadêmicos do SAGA. Envie SAIR quando quiser interromper, ou HORARIO para consultar o horário.");
    return;
  }
  if (["SAIR", "CANCELAR", "PARAR", "STOP"].includes(comando)) {
    const assinante = await prisma.whatsappAssinante.findUnique({ where: { telefone }, select: { id: true } });
    if (assinante) {
      await prisma.whatsappAssinante.update({ where: { telefone }, data: { ativo: false, cancelouEm: new Date() } });
      await prisma.whatsappMensagem.updateMany({ where: { assinanteId: assinante.id, status: "PENDENTE" }, data: { status: "CANCELADO" } });
    }
    await responderTexto(telefone, "Sua inscrição foi cancelada. Você não receberá novos avisos. Para voltar, envie INSCREVER.");
    return;
  }
  if (comando === "HORARIO" || comando === "HOJE" || DIAS.includes(comando)) {
    const ativo = await prisma.whatsappAssinante.findUnique({ where: { telefone }, select: { ativo: true } });
    if (!ativo?.ativo) {
      await responderTexto(telefone, "Para consultar o horário e receber avisos, envie INSCREVER. Você pode cancelar a qualquer momento enviando SAIR.");
      return;
    }
    const dia = DIAS.includes(comando) ? comando : diaHojePV().dia;
    if (!dia) {
      await responderTexto(telefone, "Hoje não há grade regular cadastrada (domingo). Peça um dia: SEGUNDA, TERCA, QUARTA, QUINTA, SEXTA ou SABADO.");
      return;
    }
    await responderImagem(telefone, dia);
    return;
  }
  await responderTexto(telefone, "SAGA — comandos: INSCREVER, SAIR, HORARIO, SEGUNDA, TERCA, QUARTA, QUINTA, SEXTA ou SABADO. Atendimento humano: procure a coordenação.");
}

async function receberStatus(item: Status) {
  if (!item.id || !item.status) return;
  const novo = statusMetaParaBanco(item.status);
  if (!novo) return;
  const registro = await prisma.whatsappMensagem.findUnique({ where: { metaId: item.id } });
  if (!registro || !progrediuStatus(registro.status, novo)) return;
  await prisma.whatsappMensagem.updateMany({
    where: { id: registro.id, status: registro.status },
    data: { status: novo, erro: novo === "FALHOU" ? String(item.errors?.[0]?.title ?? "Falha de entrega").slice(0, 250) : null },
  });
}

export async function POST(req: NextRequest) {
  const corpo = await req.text();
  if (corpo.length > 200000) return new Response("Conteúdo muito grande", { status: 413 });
  if (!assinaturaValida(corpo, req.headers.get("x-hub-signature-256"))) return new Response("Assinatura inválida", { status: 401 });
  let payload: Payload;
  try { payload = JSON.parse(corpo) as Payload; } catch { return new Response("JSON inválido", { status: 400 }); }
  if (payload.object !== "whatsapp_business_account") return NextResponse.json({ ok: true });
  try {
    for (const entrada of payload.entry ?? []) for (const cambio of entrada.changes ?? []) {
      for (const status of cambio.value?.statuses ?? []) await receberStatus(status);
      for (const msg of cambio.value?.messages ?? []) await receberMensagem(msg);
    }
  } catch (erro) {
    console.error("Webhook SAGA: falha de processamento", erro instanceof Error ? erro.message : "erro");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
