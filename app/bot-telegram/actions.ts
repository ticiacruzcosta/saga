"use server";
import { revalidatePath } from "next/cache";
import { exigirAdmin } from "@/lib/auth";
import { prepararTelegram, confirmarTelegram, processarTelegram, reabrirFalhasTelegram } from "@/lib/telegram/fila";

function idForm(form: FormData, campo: string) {
  const n = Number(form.get(campo));
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${campo} inválido.`);
  return n;
}
export async function prepararTelegramAction(form: FormData) {
  await exigirAdmin();
  await prepararTelegram(idForm(form, "avisoId"));
  revalidatePath("/bot-telegram");
}
export async function confirmarTelegramAction(form: FormData) {
  await exigirAdmin();
  if (form.get("confirmacao") !== "sim") throw new Error("Confirme o lote antes de continuar.");
  const modo = String(form.get("modo"));
  if (modo !== "REAL" && modo !== "SIMULACAO") throw new Error("Modo inválido.");
  await confirmarTelegram(idForm(form, "loteId"), modo);
  revalidatePath("/bot-telegram");
}
export async function processarTelegramAction() {
  await exigirAdmin();
  await processarTelegram(10);
  revalidatePath("/bot-telegram");
}

export async function reabrirFalhasTelegramAction(form: FormData) {
  await exigirAdmin();
  if (form.get("confirmacao") !== "sim") throw new Error("Revise e confirme a tentativa de reenvio.");
  const modo = String(form.get("modo"));
  if (modo !== "REAL" && modo !== "SIMULACAO") throw new Error("Modo inválido.");
  await reabrirFalhasTelegram(idForm(form, "loteId"), modo);
  revalidatePath("/bot-telegram");
}
