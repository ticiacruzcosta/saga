"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chamadaTelegram, sincronizarComandosTelegram } from "@/lib/telegram/api";
import { prepararTelegram, confirmarTelegram, processarTelegram, reabrirFalhasTelegram } from "@/lib/telegram/fila";
import { receberAtualizacao } from "@/lib/telegram/handler";

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
    const escopo = form.get("escopo") === "TODOS" ? "TODOS" : "TURMA";
    await prepararTelegram(idForm(form, "avisoId"), escopo);
  } catch (e) {
    tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  revalidatePath("/");
  redirect("/bot-telegram?ok=" + encodeURIComponent("Lote preparado com sucesso! Agora confirme o envio na seção de lotes."));
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
  revalidatePath("/");
  redirect("/bot-telegram?ok=" + encodeURIComponent("Lote confirmado! Clique em 'Processar Fila' para disparar."));
}

export async function processarTelegramAction() {
  await exigirAdmin();
  let res;
  try {
    res = await processarTelegram(15);
  } catch (e) {
    return tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  revalidatePath("/");
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
  revalidatePath("/");
  redirect("/bot-telegram?ok=" + encodeURIComponent("Mensagens com falha reabertas para processamento."));
}

export async function sincronizarBotAction() {
  await exigirAdmin();
  let botUser = "Bot";
  let comandosProcessados = 0;
  try {
    const me = await chamadaTelegram<{ username?: string; first_name?: string }>("getMe", {});
    botUser = me.username ? `@${me.username}` : (me.first_name ?? "Bot");
    await sincronizarComandosTelegram();
    // Busca até 25 atualizações pendentes no modo local (se não houver webhook ativo)
    const updates = await chamadaTelegram<Array<{ update_id: number }>>("getUpdates", { limit: 25, timeout: 0 }).catch(() => []);
    for (const u of updates) {
      await receberAtualizacao(u);
      comandosProcessados++;
    }
  } catch (e) {
    tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  revalidatePath("/");
  redirect(
    "/bot-telegram?ok=" +
      encodeURIComponent(
        `Conectado a ${botUser}! Menu de comandos atualizado no Telegram${comandosProcessados ? ` e ${comandosProcessados} interação(ões) sincronizada(s)` : ""}.`
      )
  );
}

export async function alterarTurmaAssinanteAction(form: FormData) {
  await exigirAdmin();
  try {
    const id = idForm(form, "assinanteId");
    const grupoRaw = String(form.get("grupoId") ?? "").trim();
    const grupoId = grupoRaw ? Number(grupoRaw) : null;
    await prisma.telegramAssinante.update({
      where: { id },
      data: { grupoId: grupoId && Number.isSafeInteger(grupoId) ? grupoId : null },
    });
  } catch (e) {
    tratarErro(e);
  }
  revalidatePath("/bot-telegram");
  revalidatePath("/");
  redirect("/bot-telegram?ok=" + encodeURIComponent("Turma do aluno atualizada com sucesso."));
}
