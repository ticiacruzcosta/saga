// Conversões de hora e data usadas nas telas e nas regras.

/** 1140 -> "19:00" */
export function minutosParaHora(min: number | null | undefined): string {
  if (min == null) return "—";
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

/** "19:00" -> 1140 */
export function horaParaMinutos(hora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hora.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function faixa(ini: number | null, fim: number | null): string {
  if (ini == null || fim == null) return "—";
  return `${minutosParaHora(ini)} - ${minutosParaHora(fim)}`;
}

/** Dia da semana de hoje em Porto Velho, no formato do banco (domingo = null). */
export function diaDeHoje(): string | null {
  const nome = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "America/Porto_Velho" }).format(new Date());
  const mapa: Record<string, string> = {
    Monday: "SEGUNDA", Tuesday: "TERCA", Wednesday: "QUARTA", Thursday: "QUINTA", Friday: "SEXTA", Saturday: "SABADO",
  };
  return mapa[nome] ?? null;
}

export function dataHora(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Porto_Velho" });
}
