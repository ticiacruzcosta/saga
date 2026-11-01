/** "Cálculo II" -> "CALCULO II": para comparar nomes sem se importar com acento ou pontuação. */
export function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
