// Exporta a oferta aberta para .xlsx no formato da planilha de oferta (aba "Página1"),
// com as mesmas colunas que a importação lê: o arquivo pode ser importado de volta.

import ExcelJS from "exceljs";
import { usuarioAtual } from "@/lib/auth";
import { carregarTurmas, ofertaAtual } from "@/lib/dados";
import { faixa } from "@/lib/rotulos";

const DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"];
const CABECALHO_DIAS = ["SEGUNDA-FEIRA", "TERÇA-FEIRA", "QUARTA-FEIRA", "QUINTA-FEIRA", "SEXTA-FEIRA", "SÁBADO", "DOMINGO"];
const FORMATO_PLANILHA: Record<string, string> = {
  PRESENCIAL: "PRESENCIAL", HIBRIDA: "HÍBRIDA", SINCRONA: "SÍNCRONA", ASSINCRONA: "ASSÍNCRONA",
};

export async function GET() {
  if (!(await usuarioAtual())) return new Response("Faça login para exportar.", { status: 401 });
  const oferta = await ofertaAtual();
  if (!oferta) return new Response("Nenhuma oferta para exportar.", { status: 404 });

  const turmas = (await carregarTurmas(oferta.id)).sort(
    (a, b) =>
      (a.grupo?.curso.nome ?? "").localeCompare(b.grupo?.curso.nome ?? "") ||
      (a.grupo?.periodo ?? 0) - (b.grupo?.periodo ?? 0) ||
      a.letra.localeCompare(b.letra) ||
      DIAS.indexOf(a.diaSemana ?? "") - DIAS.indexOf(b.diaSemana ?? "") ||
      (a.horaInicio ?? 0) - (b.horaInicio ?? 0)
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "SAGA";
  const ws = wb.addWorksheet("Página1", { views: [{ state: "frozen", ySplit: 3 }] });
  ws.getCell("A1").value = `HORÁRIO ${oferta.codigo} (exportado do SAGA em ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Porto_Velho" })})`;
  ws.getCell("A1").font = { bold: true, size: 13 };

  const colunas = [
    ["CURSO", 18], ["PERÍODO", 12], ["DISCIPLINA", 48], ["CH TEORICO", 11], ["CH. PRATICO", 11], ["FORMATO", 13],
    ["PROFESSOR RESPONSÁVEL (NOME COMPLETO)", 34], ["TOTAL DE VAGAS", 10], ["HORÁRIO", 15],
    ...CABECALHO_DIAS.map((d) => [d, 13]),
  ] as const;
  const cabecalho = ws.getRow(3);
  colunas.forEach(([titulo, largura], i) => {
    const c = cabecalho.getCell(i + 1);
    c.value = titulo;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A2332" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    ws.getColumn(i + 1).width = Number(largura);
  });
  cabecalho.height = 32;

  turmas.forEach((t, i) => {
    const sala = t.ambiente?.codigo;
    // Na planilha original o laboratório vai na coluna do dia como "LAB01-50" (código-capacidade)
    const marca = sala ? (/^LAB\d+$/.test(sala) ? `${sala}-${t.ambiente?.capacidade ?? t.vagas ?? 0}` : sala) : "X";
    const dias = DIAS.map((d) => (t.diaSemana === d ? marca : null));
    const linha = ws.getRow(4 + i);
    linha.values = [
      t.grupo?.curso.nome ?? "",
      t.periodoNaPlanilha ?? (t.grupo?.periodo != null ? `${t.grupo.periodo}º - ${t.letra}` : ""),
      t.nomeNaPlanilha ?? t.disciplina.nome,
      t.disciplina.cargaTeorica, t.disciplina.cargaPratica,
      FORMATO_PLANILHA[t.formato ?? t.disciplina.formato] ?? "",
      t.professor?.nome ?? "",
      t.vagas,
      t.horaInicio != null ? faixa(t.horaInicio, t.horaFim) : "",
      ...dias,
    ];
    if (t.consomeDeId) linha.getCell(3).note = "Comunalidade: assiste à aula de outro curso";
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + turmas.length, column: colunas.length } };

  const conteudo = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(conteudo as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="SAGA_OFERTA_${oferta.codigo.replace(".", "_")}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
