export const DIAS: readonly string[];
export const DIA_NOME: Record<string, string>;
export function normalizarComando(valor: unknown): string;
export function telefoneValido(valor: unknown): string | null;
export function normalizarTelefoneTesteBR(valor: unknown): string | null;
export function mascararTelefone(numero: unknown): string;
export function minutosEmHora(minutos: number | null | undefined): string;
export function diaNaData(dataISO: string): string | null;
export function diaHojePV(data?: Date): { iso: string; dia: string | null };
export function nomeDoDia(str: string): string;
export function statusMetaParaBanco(str: string): string | null;
export function progrediuStatus(anterior: string, proximo: string): boolean;
export function proximaDataDia(dia: string, aPartirDeISO: string): string | null;

export function assinaturaHorario(params: { dia: string; data: string; pagina: number; exp: number }, chave: string): string;
export function horarioAssinadoValido(params: { dia: string; data: string; pagina: number; exp: number; sig: string }, chave: string | undefined, agora?: number): boolean;
