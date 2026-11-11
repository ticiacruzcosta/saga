"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { confirmarLote, prepararLote, processarFila } from "@/lib/whatsapp/fila";
import { modoBot } from "@/lib/whatsapp/meta";
import { diaNaData, minutosEmHora, normalizarTelefoneTesteBR } from "@/lib/whatsapp/texto.mjs";

function idCampo(form: FormData, nome: string) {
  const id = Number(form.get(nome));
  if (!Number.isSafeInteger(id) || id < 1) throw new Error(`Campo ${nome} inválido.`);
  return id;
}
export async function prepararAction(form: FormData) {
  await exigirAdmin();
  await prepararLote(idCampo(form, "avisoId"));
  revalidatePath("/bot-whatsapp");
}
export async function confirmarAction(form: FormData) {
  await exigirAdmin();
  if (form.get("confirmacao") !== "sim") throw new Error("Confirme o destinatário e o modo de envio.");
  const modo = String(form.get("modo"));
  if (modo !== "REAL" && modo !== "SIMULACAO") throw new Error("Modo de envio inválido.");
  await confirmarLote(idCampo(form, "loteId"), modo);
  revalidatePath("/bot-whatsapp");
}
export async function processarAction() {
  await exigirAdmin();
  await processarFila(10);
  revalidatePath("/bot-whatsapp");
}

/** Inscrição manual somente para TESTES; nunca habilita envios reais. */
export async function cadastrarDestinatarioTesteAction(form: FormData) {
  await exigirAdmin();
  if (modoBot() !== "SIMULACAO") redirect("/bot-whatsapp?feedback=modo_invalido");
  if (form.get("autorizacao") !== "sim") redirect("/bot-whatsapp?feedback=sem_autorizacao");
  const telefone = normalizarTelefoneTesteBR(form.get("telefone"));
  if (!telefone) redirect("/bot-whatsapp?feedback=telefone_invalido");
  const existente = await prisma.whatsappAssinante.findUnique({ where: { telefone } });
  if (existente && !existente.apenasSimulacao) redirect("/bot-whatsapp?feedback=inscrito_real");
  if (existente) {
    await prisma.whatsappAssinante.update({ where: { id: existente.id }, data: { ativo: true, cancelouEm: null } });
  } else {
    await prisma.whatsappAssinante.create({ data: { telefone, ativo: true, apenasSimulacao: true } });
  }
  revalidatePath("/bot-whatsapp");
  redirect("/bot-whatsapp?feedback=cadastrado#destinatarios-teste");
}

/** Desativa teste e cancela qualquer mensagem ainda pendente desse número. */
export async function desativarDestinatarioTesteAction(form: FormData) {
  await exigirAdmin();
  const id = idCampo(form, "assinanteId");
  const atualizado = await prisma.whatsappAssinante.updateMany({
    where: { id, ativo: true, apenasSimulacao: true },
    data: { ativo: false, cancelouEm: new Date() },
  });
  if (!atualizado.count) redirect("/bot-whatsapp?feedback=nao_encontrado");
  await prisma.whatsappMensagem.updateMany({
    where: { assinanteId: id, status: "PENDENTE" }, data: { status: "CANCELADO" },
  });
  revalidatePath("/bot-whatsapp");
  redirect("/bot-whatsapp?feedback=desativado#destinatarios-teste");
}

/** Cadastra ocorrência pontual e gera Aviso PENDENTE existente no SAGA. */
export async function ocorrenciaAction(form: FormData) {
  await exigirAdmin();
  const turmaId = idCampo(form, "turmaId");
  const tipo = String(form.get("tipo") ?? "");
  if (!["CANCELAMENTO", "TROCA_SALA", "TROCA_HORARIO"].includes(tipo)) throw new Error("Tipo de ocorrência inválido.");
  const iso = String(form.get("data") ?? "");
  const turma = await prisma.turma.findUnique({
    where: { id: turmaId }, include: { disciplina: true, grupo: true, professor: true, ambiente: true, oferta: true },
  });
  if (!turma?.grupoId || !turma.grupo || turma.oferta.status !== "PUBLICADA") throw new Error("Selecione uma aula da oferta publicada.");
  if (!diaNaData(iso) || turma.diaSemana !== diaNaData(iso)) throw new Error("Escolha uma data válida que corresponda ao dia da aula.");
  const motivo = String(form.get("motivo") ?? "").trim().slice(0, 240);
  const aula = turma.nomeNaPlanilha ?? turma.disciplina.nome;
  let anterior: string | null = null;
  let novo: string | null = null;
  let descricao = "";
  if (tipo === "CANCELAMENTO") {
    novo = "SEM AULA";
    descricao = `NÃO HAVERÁ AULA de ${aula} na turma ${turma.grupo.nome} no dia ${iso.split("-").reverse().join("/")}.`;
  }
  if (tipo === "TROCA_SALA") {
    anterior = turma.ambiente?.codigo ?? "Sala comum";
    novo = String(form.get("valorNovo") ?? "").trim().toUpperCase().slice(0, 80);
    if (!novo) throw new Error("Informe a nova sala.");
    descricao = `A sala de ${aula} (${turma.grupo.nome}) mudou: ${anterior} → ${novo}, em ${iso.split("-").reverse().join("/")}.`;
  }
  if (tipo === "TROCA_HORARIO") {
    anterior = `${minutosEmHora(turma.horaInicio)} – ${minutosEmHora(turma.horaFim)}`;
    novo = String(form.get("valorNovo") ?? "").trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d\s*-\s*([01]\d|2[0-3]):[0-5]\d$/.test(novo)) throw new Error("Use HH:MM-HH:MM (ex.: 19:00-21:45).");
    const [inicio, fim] = novo.split("-").map((x) => x.trim());
    if (fim <= inicio) throw new Error("A hora final deve ser posterior à inicial.");
    descricao = `O horário de ${aula} (${turma.grupo.nome}) mudou: ${anterior} → ${novo}, em ${iso.split("-").reverse().join("/")}.`;
  }
  if (motivo) descricao += ` Motivo: ${motivo}`;
  const data = new Date(`${iso}T00:00:00.000Z`);
  await prisma.$transaction(async (tx) => {
    // Atualiza a ocorrência daquele dia/tipo e gera aviso para revisão antes do disparo.
    await tx.alteracao.deleteMany({ where: { turmaId, data, tipo } });
    await tx.alteracao.create({ data: { turmaId, data, tipo, valorAnterior: anterior, valorNovo: novo, motivo, mensagemGerada: descricao } });
    await tx.aviso.create({ data: { grupoId: turma.grupoId!, conteudo: descricao, status: "PENDENTE" } });
  });
  revalidatePath("/bot-whatsapp");
  revalidatePath("/");
}
