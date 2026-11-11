export declare const DIAS_TELEGRAM: Record<string, string>;
export declare function interpretarComando(texto: unknown): { nome: string; argumento: string };
export declare function idPositivo(texto: unknown): number | null;
export declare function chatPrivado(update: unknown): {
  chat: { id: number; type: string };
  from?: { first_name?: string };
  text: string;
  callbackQueryId?: string;
} | null;
