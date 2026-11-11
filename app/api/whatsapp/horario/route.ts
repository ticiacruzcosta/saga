import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { usuarioAtual } from "@/lib/auth";
import { diaHojePV, diaNaData, DIAS, minutosEmHora, horarioAssinadoValido } from "@/lib/whatsapp/texto.mjs";
import { imagemHorario } from "@/lib/whatsapp/imagem";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(req: NextRequest) {
  // A imagem é privada: sessão do SAGA OU link assinado e efêmero usado pela Meta.
  const params = req.nextUrl.searchParams;
  const assinado = horarioAssinadoValido({
    dia: params.get("dia") ?? "", data: params.get("data") ?? "",
    pagina: Number(params.get("pagina") ?? 1), exp: Number(params.get("exp")), sig: params.get("sig") ?? "",
  }, process.env.WHATSAPP_IMAGE_SECRET);
  if (!assinado && !(await usuarioAtual())) return new Response("Não autorizado", { status: 401, headers: { "Cache-Control": "no-store" } });
  const diaParametro = req.nextUrl.searchParams.get("dia")?.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const dataParametro = req.nextUrl.searchParams.get("data");
  const hoje = diaHojePV();
  const dia = diaParametro ?? (dataParametro ? diaNaData(dataParametro) : hoje.dia);
  if (!dia || !DIAS.includes(dia)) return new Response("Dia inválido", { status: 400 });
  // Alterações pontuais só são aplicadas quando a data da imagem é conhecida.
  const dataUsada = dataParametro ?? (dia === hoje.dia ? hoje.iso : null);
  if (dataParametro && diaNaData(dataParametro) !== dia) return new Response("Dia/data divergentes", { status: 400 });
  const paginaRaw = Number(req.nextUrl.searchParams.get("pagina") ?? 1);
  if (!Number.isSafeInteger(paginaRaw) || paginaRaw < 1 || paginaRaw > 100) return new Response("Página inválida", { status: 400 });
  const pagina = paginaRaw;
  const oferta = await prisma.oferta.findFirst({ where: { status: "PUBLICADA" }, orderBy: { codigo: "desc" } });
  if (!oferta) return new Response("Nenhum semestre publicado", { status: 404 });
  const [turmas, ambientes] = await Promise.all([prisma.turma.findMany({
    where: { ofertaId: oferta.id, diaSemana: dia, consomeDeId: null },
    include: { grupo: true, disciplina: true, professor: true, ambiente: true,
      alteracoes: { where: { data: new Date(`${dataUsada ?? "1900-01-01"}T00:00:00.000Z`) }, orderBy: { criadaEm: "asc" } },
    },
    orderBy: [{ horaInicio: "asc" }, { id: "asc" }],
  }), prisma.ambiente.findMany({ select: { codigo: true, predio: true } })]);
  const predios = new Map(ambientes.map((a) => [a.codigo.toUpperCase(), a.predio]));
  const total = Math.ceil(turmas.length / 24) || 1;
  const subset = turmas.slice((pagina - 1) * 24, pagina * 24);
  if (!subset.length && pagina !== 1) return new Response("Página não encontrada", { status: 404 });
  const linhas = subset.map((t) => {
    const alteracoes = t.alteracoes;
    const cancelada = alteracoes.some((a) => a.tipo === "CANCELAMENTO");
    const trocaSala = alteracoes.filter((a) => a.tipo === "TROCA_SALA").at(-1)?.valorNovo;
    const trocaProf = alteracoes.filter((a) => a.tipo === "TROCA_PROFESSOR").at(-1)?.valorNovo;
    const trocaHorario = alteracoes.filter((a) => a.tipo === "TROCA_HORARIO").at(-1)?.valorNovo;
    return {
      turma: t.grupo?.nome ?? "Turma a definir", disciplina: t.nomeNaPlanilha ?? t.disciplina.nome,
      professor: trocaProf ?? t.professor?.nome ?? "A definir",
      sala: (t.formato ?? t.disciplina.formato) === "ASSINCRONA" || (t.formato ?? t.disciplina.formato) === "SINCRONA" ? "ON-LINE" : trocaSala ?? t.ambiente?.codigo ?? "Sala comum",
      predio: trocaSala ? predios.get(trocaSala.toUpperCase()) ?? "—" : t.ambiente?.predio ?? "—", hora: trocaHorario ?? `${minutosEmHora(t.horaInicio)} – ${minutosEmHora(t.horaFim)}`,
      cancelada, alterada: Boolean(trocaSala || trocaProf || trocaHorario),
    };
  });
  return imagemHorario({ linhas, dia, semestre: oferta.codigo, dataUsada, pagina, total });
}
