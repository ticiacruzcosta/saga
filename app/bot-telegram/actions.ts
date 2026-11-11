"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/auth";
import { prepararTelegram, confirmarTelegram, processarTelegram, reabrirFalhasTelegram } from "@/lib/telegram/fila";

function idForm(form: FormData, campo: string) {
  const n = Number(form.get(campo));
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${campo} inválido.`);
  return n;
}

function tratarErro(e: unknown): never {
  const msg = e instanceof Error ? e.message : "Erro ao processar ação do Telegram.";
  redirect(`/bot-telegram?erro=${encodeURIComponent(msg)}`);
}

export async function prepararTelegramAction(form: FormData) {
  await exigirAdmin();
  try {
    await prepararTelegram(idForm(form, "avisoId"));
  } catch (e) {
    tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  redirect("/bot-telegram?ok=" + encodeURIComponent("Lote preparado com sucesso! Agora confirme o envio na seção 4."));
}

export async function confirmarTelegramAction(form: FormData) {
  await exigirAdmin();
  try {
    if (form.get("confirmacao") !== "sim") throw new Error("Confirme o lote antes de continuar.");
    const modo = String(form.get("modo"));
    if (modo !== "REAL" && modo !== "SIMULACAO") throw new Error("Modo inválido.");
    await confirmarTelegram(idForm(form, "loteId"), modo);
  } catch (e) {
    tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  redirect("/bot-telegram?ok=" + encodeURIComponent("Lote confirmado! Clique em 'Processar até 10 mensagens' para disparar."));
}

export async function processarTelegramAction() {
  await exigirAdmin();
  let res;
  try {
    res = await processarTelegram(10);
  } catch (e) {
    return tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  redirect(
    "/bot-telegram?ok=" +
      encodeURIComponent(
        `Fila processada: ${res.processadas} mensagem(ns) (${res.simuladas} simulada(s), ${res.enviadas} enviada(s), ${res.falhas} falha(s)).`
      )
  );
}

export async function reabrirFalhasTelegramAction(form: FormData) {
  await exigirAdmin();
  try {
    if (form.get("confirmacao") !== "sim") throw new Error("Revise e confirme a tentativa de reenvio.");
    const modo = String(form.get("modo"));
    if (modo !== "REAL" && modo !== "SIMULACAO") throw new Error("Modo inválido.");
    await reabrirFalhasTelegram(idForm(form, "loteId"), modo);
  } catch (e) {
    tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  redirect("/bot-telegram?ok=" + encodeURIComponent("Mensagens com falha reabertas para processamento."));
}
