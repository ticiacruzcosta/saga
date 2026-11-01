"use client";

// Avisos rápidos e confirmações no estilo do sistema (no lugar de alert/confirm/prompt do navegador).
// Uso em qualquer tela: avisar("Oferta salva"), await confirmar("Excluir?"), await mostrarTexto(...).
// O componente <Avisos /> fica montado uma vez, na raiz do SagaApp.

import { useEffect, useState } from "react";

type Tipo = "ok" | "erro";
type Toast = { id: number; texto: string; tipo: Tipo };
type Dialogo = {
  titulo: string;
  texto: string;
  botao: string;
  perigo: boolean;
  copiar?: string; // valor destacado com botão "Copiar" (ex.: senha provisória)
  soOk?: boolean;
  responder: (sim: boolean) => void;
};

let ouvinte: ((t: Toast[], d: Dialogo | null) => void) | null = null;
let toasts: Toast[] = [];
let dialogo: Dialogo | null = null;
let proximo = 1;
const publicar = () => ouvinte?.([...toasts], dialogo);

/** Aviso rápido no canto da tela; some sozinho. */
export function avisar(texto: string | undefined, tipo: Tipo = "ok") {
  const id = proximo++;
  toasts = [...toasts, { id, texto: texto || (tipo === "erro" ? "Não foi possível concluir." : "Pronto."), tipo }].slice(-4);
  publicar();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    publicar();
  }, tipo === "erro" ? 7000 : 4000);
}

/** Pergunta sim/não. Resolve `true` se a pessoa confirmar. */
export function confirmar(texto: string, opcoes: { titulo?: string; botao?: string; perigo?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    dialogo = {
      titulo: opcoes.titulo ?? "Confirmar",
      texto,
      botao: opcoes.botao ?? "Confirmar",
      perigo: opcoes.perigo ?? false,
      responder: (sim) => {
        dialogo = null;
        publicar();
        resolve(sim);
      },
    };
    publicar();
  });
}

/** Mostra um valor para copiar (ex.: senha provisória), com um único botão de fechar. */
export function mostrarTexto(titulo: string, texto: string, valor: string): Promise<void> {
  return new Promise((resolve) => {
    dialogo = { titulo, texto, botao: "Fechar", perigo: false, copiar: valor, soOk: true, responder: () => { dialogo = null; publicar(); resolve(); } };
    publicar();
  });
}

export default function Avisos() {
  const [lista, setLista] = useState<Toast[]>([]);
  const [aberto, setAberto] = useState<Dialogo | null>(null);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    ouvinte = (t, d) => {
      setLista(t);
      setAberto(d);
      setCopiado(false);
    };
    return () => {
      ouvinte = null;
    };
  }, []);

  // Esc cancela a confirmação aberta
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aberto.responder(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aberto]);

  async function copiar(valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-2 print:hidden" aria-live="polite">
        {lista.map((t) => (
          <div key={t.id} role="status" className="flex items-center gap-2.5 px-5 py-3 rounded-full bg-[#1A2332] text-white text-sm font-bold shadow-xl max-w-md">
            <span aria-hidden="true" className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ${t.tipo === "ok" ? "bg-emerald-500" : "bg-red-600"}`}>
              <i className={`fa-solid ${t.tipo === "ok" ? "fa-check" : "fa-exclamation"} text-[11px]`}></i>
            </span>
            <span className="whitespace-pre-line">{t.texto}</span>
          </div>
        ))}
      </div>

      {aberto && (
        <div className="fixed inset-0 z-[80] bg-slate-900/55 backdrop-blur-sm flex justify-center items-center p-4">
          <div role="alertdialog" aria-labelledby="aviso-titulo" className="janela w-full max-w-md p-6 space-y-3">
            <h3 id="aviso-titulo" className="text-lg font-black text-[#1A2332]">{aberto.titulo}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-line">{aberto.texto}</p>
            {aberto.copiar && (
              <div className="flex items-center gap-2">
                <code className="flex-1 campo font-mono text-base font-bold tracking-wider">{aberto.copiar}</code>
                <button onClick={() => copiar(aberto.copiar!)} className="btn btn-secundario">
                  <i className={`fa-solid ${copiado ? "fa-check" : "fa-copy"}`}></i> {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              {!aberto.soOk && <button onClick={() => aberto.responder(false)} className="btn btn-secundario">Cancelar</button>}
              <button autoFocus onClick={() => aberto.responder(true)} className={`btn ${aberto.perigo ? "btn-vermelho" : "btn-principal"}`}>{aberto.botao}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
