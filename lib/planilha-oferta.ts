// Leitura da planilha de oferta (.xlsx). As colunas são localizadas pelo nome do cabeçalho,
// então a ordem pode mudar. Regras de normalização equivalentes às do seed.py.

import ExcelJS from "exceljs";
import { norm } from "./texto";
import type { Formato } from "./validacao-choque";

export const DIAS_PLANILHA = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"] as const;

export const FORMATOS: Record<string, Formato> = {
  PRESENCIAL: "PRESENCIAL",
  "HÍBRIDA": "HIBRIDA",
  "SÍNCRONA": "SINCRONA",
  "ASSÍNCRONA": "ASSINCRONA",
};

export type LinhaPlanilha = {
  linha: number;
  curso: string;
  periodoTxt: string; // "4º - A", exatamente como na planilha
  periodo: number | null;
  letra: string;
  turno: "NOTURNO" | "VESPERTINO";
  disciplina: string;
  chave: string; // nome normalizado para achar a disciplina (ver chaveDisciplina)
  formato: Formato | null;
  professor: string | null;
  profObs: string | null;
  horario: string | null; // "19:00 - 21:45"
  inicio: number | null;
  fim: number | null;
  dia: string | null; // SEGUNDA ... DOMINGO
  marca: string | null; // o que está escrito na coluna do dia: "X", "LAB01-50"
  lab: { codigo: string; cap: number } | null;
  vagas: number | null;
};

export type LeituraPlanilha = {
  aba: string;
  linhas: LinhaPlanilha[];
  problemas: Array<{ linha: number; mensagem: string }>;
};

// ------------------------------------------------------------ normalização

const SUFIXO_CURSO =
  /\s*[-(]\s*(?:ENG\.?\s*COMP(?:UTA(?:Ç|C)(?:Ã|A)O)?\.?|COMPUTA(?:Ç|C)(?:Ã|A)O|COMP\.\s*CONSUMINDO)\s*\)?\s*$/i;
const PARENTESE_PYTHON = /\s*\(PYTHON\)/gi;
const ALIAS: Record<string, string> = {
  "DIREITO LEGISLACAO E ETICA": "DIREITO LEGISLACAO E ETICA NA TECNOLOGIA",
  "INTRODUCAO A REDES": "INTRODUCAO A REDES DE COMPUTADORES",
  "PROGRAMACAO WEB": "PROGRAMACAO PARA WEB",
  "INTR A INFOR E TEORIA GERAL DOS SIST COMP": "INTRODUCAO A INFORMACAO E TEORIA GERAL DOS SISTEMAS COMPUTACIONAIS",
  "ESG ENVIRONMENT SOCIAL AND GOVERNANCE": "ENVIRONMENTAL SOCIAL GOVERNANCE ESG",
};

/** "RESISTÊNCIA DOS MATERIAIS - ENG. COMP." -> sem o sufixo do curso. */
export function semSufixoCurso(nome: string): string {
  return nome.replace(SUFIXO_CURSO, "").trim();
}

/** Transforma o nome (da matriz OU da planilha) numa chave comparável. */
export function chaveDisciplina(nome: string | null | undefined): string {
  const s = String(nome ?? "").trim().replace(SUFIXO_CURSO, "").replace(PARENTESE_PYTHON, "");
  const n = norm(s).replace(/ESTRUTURAS/g, "ESTRUTURA").replace(/BANCOS/g, "BANCO").replace(/\bT I\b/g, "TI");
  const pe = /^PROJETO DE EXTENSAO (I|II|III|IV|V)\b/.exec(n);
  if (pe) return "PE:" + pe[1];
  const opt = /^OPTATIVA (I|II|III)\b/.exec(n);
  if (opt) return "OPT:" + opt[1];
  return ALIAS[n] ?? n;
}

/** Devolve [nome do professor, observação]. A planilha mistura avisos no campo. */
export function limparProfessor(txt: string | null): [string | null, string | null] {
  if (txt == null || txt.trim() === "") return [null, null];
  const t = txt.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  if (t.toUpperCase().startsWith("ALUNOS ") || t.toUpperCase() === "PROFESSOR PORTUGUÊS") {
    return [null, `Professor na planilha: ${t}`];
  }
  return [t.toUpperCase(), null];
}

export function lerPeriodo(txt: string): { periodo: number | null; letra: string; turno: "NOTURNO" | "VESPERTINO" } {
  const t = txt.trim().toUpperCase();
  const n = /\d+/.exec(t);
  const l = /(?:^|[\s\-–])([A-D])\s*$/.exec(t);
  return { periodo: n ? Number(n[0]) : null, letra: l ? l[1] : "A", turno: t.includes("VESP") ? "VESPERTINO" : "NOTURNO" };
}

/** "19:00 - 21:45" -> [1140, 1305] */
export function lerHorario(txt: string | null): [number | null, number | null] {
  const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(txt ?? "");
  if (!m) return [null, null];
  const [a, b, c, d] = m.slice(1).map(Number);
  return [a * 60 + b, c * 60 + d];
}

// ------------------------------------------------------------ leitura

/** Texto de uma célula, seja ela texto simples, rico, fórmula ou número. */
function texto(v: ExcelJS.CellValue): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if ("richText" in v) return v.richText.map((r) => r.text).join("");
  if ("result" in v) return texto((v.result ?? null) as ExcelJS.CellValue);
  if ("text" in v) return String(v.text);
  return null; // célula com erro (#REF!, #N/D...)
}

const COLUNAS = {
  curso: (h: string) => h === "CURSO",
  periodo: (h: string) => h === "PERIODO",
  disciplina: (h: string) => h === "DISCIPLINA",
  formato: (h: string) => h === "FORMATO",
  professor: (h: string) => h.startsWith("PROFESSOR"),
  horario: (h: string) => h === "HORARIO",
  vagas: (h: string) => h === "TOTAL DE VAGAS",
};
type Coluna = keyof typeof COLUNAS;

const DIA_CABECALHO: Record<string, (typeof DIAS_PLANILHA)[number]> = {
  "SEGUNDA FEIRA": "SEGUNDA", "TERCA FEIRA": "TERCA", "QUARTA FEIRA": "QUARTA", "QUINTA FEIRA": "QUINTA",
  "SEXTA FEIRA": "SEXTA", SABADO: "SABADO", DOMINGO: "DOMINGO",
};

/** Procura a linha de cabeçalho ("CURSO", "DISCIPLINA"...) nas primeiras linhas da aba. */
function acharCabecalho(ws: ExcelJS.Worksheet) {
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const col: Partial<Record<Coluna, number>> = {};
    const dias = new Map<number, string>();
    for (const rr of [r - 1, r]) {
      if (rr < 1) continue;
      ws.getRow(rr).eachCell((c, i) => {
        const h = norm(texto(c.value));
        if (DIA_CABECALHO[h]) dias.set(i, DIA_CABECALHO[h]);
        if (rr !== r) return;
        for (const k of Object.keys(COLUNAS) as Coluna[]) if (col[k] == null && COLUNAS[k](h)) col[k] = i;
      });
    }
    if (col.curso && col.disciplina) return { linha: r, col, dias };
  }
  return null;
}

/** Lê o .xlsx da oferta. Não lança erro por linha: junta tudo em `problemas`. */
export async function lerPlanilhaOferta(arquivo: ArrayBuffer): Promise<LeituraPlanilha> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arquivo as unknown as Parameters<typeof wb.xlsx.load>[0]);

  // Prefere a aba "Página1"; senão, a primeira que tiver o cabeçalho certo
  const abas = [...wb.worksheets].sort((a, b) => Number(b.name === "Página1") - Number(a.name === "Página1"));
  for (const ws of abas) {
    const cab = acharCabecalho(ws);
    if (!cab) continue;
    const faltando = (["periodo", "professor", "horario", "formato"] as Coluna[]).filter((k) => !cab.col[k]);
    if (faltando.length || cab.dias.size === 0) {
      throw new Error(
        `A aba "${ws.name}" não tem as colunas: ${[...faltando.map((k) => k.toUpperCase()), ...(cab.dias.size ? [] : ["dias da semana"])].join(", ")}.`
      );
    }
    const c = cab.col as Record<Coluna, number | undefined>;
    const colDias = [...cab.dias.entries()].sort((a, b) => a[0] - b[0]);
    const linhas: LinhaPlanilha[] = [];
    const problemas: LeituraPlanilha["problemas"] = [];

    for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const v = (i: number | undefined) => (i ? texto(row.getCell(i).value) : null);
      const curso = v(c.curso)?.trim();
      const disc = v(c.disciplina)?.trim();
      if (!curso || !disc) continue;

      let dia: string | null = null;
      let marca: string | null = null;
      for (const [i, nomeDia] of colDias) {
        const m = v(i);
        if (m != null && m !== "") {
          dia = nomeDia;
          marca = m.trim();
          break;
        }
      }
      const lab = marca ? /^(LAB\d+)-(\d+)$/.exec(marca.toUpperCase()) : null;
      const [professor, profObs] = limparProfessor(v(c.professor));
      const formatoRaw = v(c.formato)?.trim() || null;
      const horario = v(c.horario)?.trim() || null;
      const [inicio, fim] = lerHorario(horario);
      const periodoTxt = (v(c.periodo) ?? "").trim();
      const vagasTxt = v(c.vagas)?.trim();
      const vagas = vagasTxt && /^\d+(\.0+)?$/.test(vagasTxt) ? Number(vagasTxt) : null;

      if (formatoRaw && !FORMATOS[formatoRaw.toUpperCase()]) problemas.push({ linha: r, mensagem: `Formato desconhecido: "${formatoRaw}".` });
      if (horario && inicio == null) problemas.push({ linha: r, mensagem: `Horário fora do padrão "19:00 - 21:45": "${horario}".` });
      if (formatoRaw?.toUpperCase() !== "ASSÍNCRONA" && !dia) problemas.push({ linha: r, mensagem: `${disc}: nenhum dia da semana marcado.` });

      linhas.push({
        linha: r, curso, periodoTxt, ...lerPeriodo(periodoTxt), disciplina: disc, chave: chaveDisciplina(disc),
        formato: formatoRaw ? FORMATOS[formatoRaw.toUpperCase()] ?? null : null,
        professor, profObs, horario, inicio, fim, dia, marca,
        lab: lab ? { codigo: lab[1], cap: Number(lab[2]) } : null, vagas,
      });
    }
    return { aba: ws.name, linhas, problemas };
  }
  throw new Error('Não achei a aba da oferta. A planilha precisa de uma aba (ex.: "Página1") com as colunas CURSO e DISCIPLINA.');
}
