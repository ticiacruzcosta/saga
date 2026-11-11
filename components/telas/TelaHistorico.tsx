"use client";

// Histórico de Avisos: mensagens geradas, status geral e integração direta com o Status Telegram.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { enviarAvisoTelegram, marcarAviso } from "@/app/actions";
import { avisar, confirmar } from "@/components/avisos";
import type { AvisoVM } from "@/lib/tipos";

const SELO: Record<string, [string, string]> = {
  Pendente: ["bg-red-50 text-red-700", "bg-red-600"],
  Falhou: ["bg-red-50 text-red-700", "bg-red-600"],
  Enviado: ["bg-emerald-50 text-emerald-700", "bg-emerald-500"],
  Entregue: ["bg-emerald-50 text-emerald-700", "bg-emerald-500"],
};

const SELO_TELEGRAM: Record<AvisoVM["statusTelegram"], [string, string, string]> = {
  Enviado: ["bg-emerald-50 text-emerald-700", "bg-emerald-500", "Enviado"],
  Integrado: ["bg-sky-50 text-sky-700", "bg-sky-500", "Integrado"],
  "Na fila": ["bg-amber-50 text-amber-800", "bg-amber-500", "Na fila"],
  Falhou: ["bg-red-50 text-red-700", "bg-red-600", "Falhou"],
  "Chave pendente": ["bg-red-50 text-red-700", "bg-red-600", "Chave pendente"],
};

export default function TelaHistorico({ avisos, admin }: { avisos: AvisoVM[]; admin: boolean }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const pendentes = avisos.filter((a) => a.status === "Pendente").length;
  const chaveAtiva = !avisos.some((a) => a.statusTelegram === "Chave pendente");
  const semFalhasTelegram = !avisos.some((a) => a.statusTelegram === "Falhou" || a.statusTelegram === "Chave pendente");

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

  function enviarTelegram(a: AvisoVM) {
    iniciar(async () => {
      const resposta = await enviarAvisoTelegram(a.id);
      if (!resposta.ok) return avisar(resposta.erro ?? "Não foi possível enviar pelo Telegram.", "erro");
      avisar(resposta.resumo ?? `Aviso de ${a.turma} enviado pelo Telegram!`);
      router.refresh();
    });
  }

  function marcar(a: AvisoVM, enviado: boolean) {
    iniciar(async () => {
      const resposta = await marcarAviso(a.id, enviado);
      if (!resposta.ok) return avisar(resposta.erro ?? "Não foi possível alterar o aviso.", "erro");
      avisar(enviado ? `Aviso de ${a.turma} marcado como enviado` : "Aviso voltou para pendente");
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs">
        <div className="text-sm text-gray-600">
          {pendentes > 0 ? (
            <>
              <b className="text-red-700">{pendentes} aviso(s) pendente(s).</b> Você pode disparar direto pelo{" "}
              <b>Telegram</b> ou pelo envio manual do WhatsApp.
            </>
          ) : (
            <b className="text-emerald-700">Todos os avisos estão em dia.</b>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-extrabold ${
              semFalhasTelegram && chaveAtiva
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${semFalhasTelegram && chaveAtiva ? "bg-emerald-500" : "bg-red-600"}`}
            ></span>
            Status Telegram: {semFalhasTelegram && chaveAtiva ? "Integrado (Chave e envio OK)" : "Atenção no envio/chave"}
          </span>
          {admin && (
            <Link href="/bot-telegram" className="btn btn-sm bg-sky-600 text-white hover:bg-sky-700">
              <i className="fa-brands fa-telegram"></i> Painel Telegram
            </Link>
          )}
        </div>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[860px]">
          <thead className="tabela-cab">
            <tr>
              <th className="p-3 pl-5">Data/Hora</th>
              <th className="p-3">Turma</th>
              <th className="p-3">Mensagem</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-center">Status Telegram</th>
              <th className="p-3 pr-5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {avisos.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  Nenhum aviso ainda.
                </td>
              </tr>
            )}
            {avisos.map((a) => {
              const [fundo, ponto] = SELO[a.status] ?? SELO.Pendente;
              const [fundoTg, pontoTg, rotuloTg] = SELO_TELEGRAM[a.statusTelegram] ?? SELO_TELEGRAM.Integrado;
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
                  <td className="p-3 text-center">
                    <span
                      title={a.detalheTelegram}
                      className={`${fundoTg} inline-flex items-center gap-1.5 whitespace-nowrap text-xs px-3 py-1 rounded-full font-extrabold`}
                    >
                      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${pontoTg}`}></span>
                      {rotuloTg}
                    </span>
                  </td>
                  <td className="p-3 pr-5">
                    <div className="flex justify-end gap-2">
                      {a.enfileirado ? (
                        admin ? (
                          <Link href="/bot-whatsapp" className="btn btn-sm btn-secundario">
                            Ver no bot
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-500">Fila gerenciada pelo administrador</span>
                        )
                      ) : a.status === "Pendente" || a.status === "Falhou" ? (
                        <>
                          <button
                            onClick={() => enviarTelegram(a)}
                            disabled={pendente}
                            title="Validar chave e disparar pelo Telegram"
                            className="btn btn-sm bg-sky-600 text-white hover:bg-sky-700"
                          >
                            <i className="fa-brands fa-telegram"></i> Telegram
                          </button>
                          <button onClick={() => enviar(a)} disabled={pendente} className="btn btn-sm bg-green-700 text-white">
                            <i className="fa-brands fa-whatsapp"></i> Enviar
                          </button>
                          <button
                            onClick={() => marcar(a, true)}
                            disabled={pendente}
                            title="Já enviei por outro meio"
                            aria-label="Marcar como enviado"
                            className="btn btn-icone"
                          >
                            <i className="fa-solid fa-check"></i>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => marcar(a, false)}
                          disabled={pendente}
                          title="Voltar para pendente"
                          className="btn btn-sm btn-secundario"
                        >
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
