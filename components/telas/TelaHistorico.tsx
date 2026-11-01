"use client";

// Histórico de Avisos: mensagens geradas e seu status.
// Enquanto não existe o bot, o envio é manual: "Enviar" abre o WhatsApp com a mensagem pronta
// (a pessoa escolhe o grupo) e depois marca o aviso como enviado.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarAviso } from "@/app/actions";
import { avisar, confirmar } from "@/components/avisos";
import type { AvisoVM } from "@/lib/tipos";

const SELO: Record<string, [string, string]> = {
  Pendente: ["bg-red-50 text-red-700", "bg-red-600"],
  Falhou: ["bg-red-50 text-red-700", "bg-red-600"],
  Enviado: ["bg-emerald-50 text-emerald-700", "bg-emerald-500"],
  Entregue: ["bg-emerald-50 text-emerald-700", "bg-emerald-500"],
};

export default function TelaHistorico({ avisos }: { avisos: AvisoVM[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const pendentes = avisos.filter((a) => a.status === "Pendente").length;

  async function enviar(a: AvisoVM) {
    // A mensagem também vai para a área de transferência: no grupo, é só colar se preferir
    try {
      await navigator.clipboard.writeText(a.mensagem);
    } catch {
      // sem permissão de copiar: o WhatsApp já abre com o texto
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(a.mensagem)}`, "_blank", "noopener");
    const ok = await confirmar(
      `Escolha o grupo de ${a.turma} no WhatsApp e envie a mensagem (ela também foi copiada). Depois confirme aqui.`,
      { titulo: "Conseguiu enviar?", botao: "Sim, enviei" }
    );
    if (!ok) return;
    marcar(a, true);
  }

  function marcar(a: AvisoVM, enviado: boolean) {
    iniciar(async () => {
      await marcarAviso(a.id, enviado);
      avisar(enviado ? `Aviso de ${a.turma} marcado como enviado` : "Aviso voltou para pendente");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      {pendentes > 0 && (
        <p className="text-sm text-gray-600">
          <b className="text-red-700">{pendentes} aviso(s) pendente(s).</b> O envio automático ainda não existe: use <b>Enviar</b> para abrir o
          WhatsApp com a mensagem pronta e escolher o grupo da turma.
        </p>
      )}
      <div className="cartao overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[760px]">
          <thead className="tabela-cab">
            <tr>
              <th className="p-3 pl-5">Data/Hora</th>
              <th className="p-3">Turma</th>
              <th className="p-3">Mensagem</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 pr-5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {avisos.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nenhum aviso ainda.</td></tr>}
            {avisos.map((a) => {
              const [fundo, ponto] = SELO[a.status] ?? SELO.Pendente;
              return (
                <tr key={a.id} className="align-top">
                  <td className="p-3 pl-5 text-xs text-gray-500 whitespace-nowrap">{a.quando}</td>
                  <td className="p-3 font-semibold">{a.turma}</td>
                  <td className="p-3">{a.mensagem}</td>
                  <td className="p-3 text-center">
                    <span className={`${fundo} inline-flex items-center gap-1.5 whitespace-nowrap text-xs px-3 py-1 rounded-full font-extrabold`}>
                      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${ponto}`}></span>
                      {a.status}
                    </span>
                  </td>
                  <td className="p-3 pr-5">
                    <div className="flex justify-end gap-2">
                      {a.status === "Pendente" ? (
                        <>
                          <button onClick={() => enviar(a)} disabled={pendente} className="btn btn-sm bg-green-700 text-white">
                            <i className="fa-brands fa-whatsapp"></i> Enviar
                          </button>
                          <button onClick={() => marcar(a, true)} disabled={pendente} title="Já enviei por outro meio" aria-label="Marcar como enviado" className="btn btn-icone">
                            <i className="fa-solid fa-check"></i>
                          </button>
                        </>
                      ) : (
                        <button onClick={() => marcar(a, false)} disabled={pendente} title="Voltar para pendente" className="btn btn-sm btn-secundario">
                          <i className="fa-solid fa-rotate-left"></i> Desfazer
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
