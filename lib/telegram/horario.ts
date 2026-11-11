import { prisma } from "@/lib/prisma";
import { imagemHorario } from "@/lib/whatsapp/imagem";
import { diaHojePV, DIAS, proximaDataDia, minutosEmHora, DIA_NOME } from "@/lib/whatsapp/texto.mjs";

/** Gera diretamente em memória: não publica a imagem e não exige URL aberta. */
export async function horarioPng(
  grupoId: number,
  diaSolicitado?: string
): Promise<{ erro: string } | { imagem: Uint8Array; legenda: string } | null> {
  const hoje = diaHojePV();
  const dia = diaSolicitado ?? hoje.dia;
  if (!dia || !DIAS.includes(dia)) return null;
  const data = proximaDataDia(dia, hoje.iso);
  if (!data) return null;
  const oferta = await prisma.oferta.findFirst({ where: { status: "PUBLICADA" }, orderBy: { codigo: "desc" } });
  if (!oferta) return { erro: "Não existe semestre publicado no SAGA." };
  const turmas = await prisma.turma.findMany({
    where: { ofertaId: oferta.id, diaSemana: dia, grupoId, consomeDeId: null },
    include: { disciplina: true, grupo: true, professor: true, ambiente: true,
      alteracoes: { where: { data: new Date(`${data}T00:00:00.000Z`) }, orderBy: { criadaEm: "asc" } } },
    orderBy: [{ horaInicio: "asc" }, { id: "asc" }],
  });
  if (!turmas.length) return { erro: `Não há aulas cadastradas para ${DIA_NOME[dia] ?? dia} nessa turma.` };
  const ambientes = await prisma.ambiente.findMany({ select: { codigo: true, predio: true } });
  const predios = new Map(ambientes.map((a) => [a.codigo.toUpperCase(), a.predio]));
  const linhas = turmas.slice(0, 24).map((t) => {
    const alteracoes = t.alteracoes;
    const cancelada = alteracoes.some((a) => a.tipo === "CANCELAMENTO");
    const salaNova = alteracoes.filter((a) => a.tipo === "TROCA_SALA").at(-1)?.valorNovo;
    const profNovo = alteracoes.filter((a) => a.tipo === "TROCA_PROFESSOR").at(-1)?.valorNovo;
    const horaNova = alteracoes.filter((a) => a.tipo === "TROCA_HORARIO").at(-1)?.valorNovo;
    const online = ["SINCRONA", "ASSINCRONA"].includes(t.formato ?? t.disciplina.formato);
    return {
      turma: t.grupo?.nome ?? "Turma", disciplina: t.nomeNaPlanilha ?? t.disciplina.nome,
      professor: profNovo ?? t.professor?.nome ?? "A definir",
      sala: online ? "ON-LINE" : salaNova ?? t.ambiente?.codigo ?? "Sala a definir",
      predio: online ? "—" : salaNova ? predios.get(salaNova.toUpperCase()) ?? "—" : t.ambiente?.predio ?? "—",
      hora: horaNova ?? `${minutosEmHora(t.horaInicio)} – ${minutosEmHora(t.horaFim)}`,
      cancelada, alterada: Boolean(salaNova || profNovo || horaNova),
    };
  });
  const resposta = imagemHorario({ linhas, dia, semestre: oferta.codigo, dataUsada: data, pagina: 1, total: 1 });
  const arrayBuffer = await resposta.arrayBuffer();
  return { imagem: new Uint8Array(arrayBuffer), legenda: `SAGA • ${DIA_NOME[dia]} • ${data.split("-").reverse().join("/")}${turmas.length > 24 ? " (primeiras 24 aulas)" : ""}` };
}
