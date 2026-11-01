// Contas com datas "2026-10-31" (sem fuso: o dia já vem certo de Porto Velho).

const DIAS_TELA = ["", "SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"]; // índice = getUTCDay(); domingo = ""

const paraData = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function somarDias(iso: string, n: number): string {
  const d = paraData(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dia da semana no formato da tela ("TERÇA"), ou null no domingo. */
export function diaDaData(iso: string): string | null {
  return DIAS_TELA[paraData(iso).getUTCDay()] || null;
}

/** "2026-11-02" -> "02/11" */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Datas do mês para montar o calendário, começando no domingo da primeira semana. */
export function semanasDoMes(ano: number, mes: number): Array<Array<string | null>> {
  const primeiro = new Date(Date.UTC(ano, mes, 1, 12));
  const dias = new Date(Date.UTC(ano, mes + 1, 0, 12)).getUTCDate();
  const celulas: Array<string | null> = Array(primeiro.getUTCDay()).fill(null);
  for (let d = 1; d <= dias; d++) celulas.push(new Date(Date.UTC(ano, mes, d, 12)).toISOString().slice(0, 10));
  while (celulas.length % 7) celulas.push(null);
  return Array.from({ length: celulas.length / 7 }, (_, i) => celulas.slice(i * 7, i * 7 + 7));
}
