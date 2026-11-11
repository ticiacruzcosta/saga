"use client";

// Histórico de Avisos: mensagens geradas, status geral e integração direta com o Status Telegram.
// Responsivo: cartões empilhados no celular (md:hidden) e tabela completa no computador (hidden md:block).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { editarAviso, enviarAvisoTelegram, marcarAviso } from "@/app/actions";
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
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [textoEditado, setTextoEditado] = useState("");
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"TODOS" | "PENDENTES" | "ENVIADOS">("TODOS");
  const pendentes = avisos.filter((a) => a.status === "Pendente").length;
  const chaveAtiva = !avisos.some((a) => a.statusTelegram === "Chave pendente");
  const semFalhasTelegram = !avisos.some((a) => a.statusTelegram === "Falhou" || a.statusTelegram === "Chave pendente");

  const termo = busca.trim().toLowerCase();
  const avisosFiltrados = avisos.filter((a) => {
    if (filtroStatus === "PENDENTES" && a.status !== "Pendente" && a.status !== "Falhou") return false;
    if (filtroStatus === "ENVIADOS" && a.status !== "Enviado" && a.status !== "Entregue") return false;
    if (termo && !`${a.turma} ${a.mensagem} ${a.quando}`.toLowerCase().includes(termo)) return false;
    return true;
  });

  function abrirEdicao(a: AvisoVM) {
    setEditandoId(a.id);
    setTextoEditado(a.mensagem);
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setTextoEditado("");
  }

  function salvarTexto(a: AvisoVM) {
    const novo = textoEditado.trim();
    if (!novo) return avisar("A mensagem não pode ficar vazia.", "erro");
    iniciar(async () => {
      const r = await editarAviso({ id: a.id, mensagem: novo });
      if (!r.ok) return avisar(r.erro ?? "Não foi possível salvar a edição.", "erro");
      avisar("Mensagem do aviso atualizada!");
      setEditandoId(null);
      router.refresh();
    });
  }

  async function enviar(a: AvisoVM) {
    const textoFinal = editandoId === a.id ? textoEditado.trim() : a.mensagem;
    if (!textoFinal) return avisar("A mensagem não pode ficar vazia.", "erro");
    if (editandoId === a.id && textoFinal !== a.mensagem) {
      const r = await editarAviso({ id: a.id, mensagem: textoFinal });
      if (!r.ok) return avisar(r.erro ?? "Não foi possível salvar a edição.", "erro");
      setEditandoId(null);
    }
    // A mensagem também vai para a área de transferência: no grupo, é só colar se preferir
    try {
      await navigator.clipboard.writeText(textoFinal);
    } catch {
      // sem permissão de copiar: o WhatsApp já abre com o texto
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(textoFinal)}`, "_blank", "noopener");
    const ok = await confirmar(
      `Escolha o grupo de ${a.turma} no WhatsApp e envie a mensagem (ela também foi copiada). Depois confirme aqui.`,
      { titulo: "Conseguiu enviar?", botao: "Sim, enviei" }
    );
    if (!ok) {
      router.refresh();
      return;
    }
    marcar(a, true);
  }

  function enviarTelegram(a: AvisoVM) {
    const textoFinal = editandoId === a.id ? textoEditado.trim() : a.mensagem;
    if (!textoFinal) return avisar("A mensagem não pode ficar vazia.", "erro");
    iniciar(async () => {
      const resposta = await enviarAvisoTelegram(a.id, editandoId === a.id ? textoFinal : undefined);
      if (!resposta.ok) return avisar(resposta.erro ?? "Não foi possível enviar pelo Telegram.", "erro");
      if (editandoId === a.id) setEditandoId(null);
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

  const enviados = avisos.length - pendentes;

  return (
    <section className="space-y-5">
      {/* BANNER PRINCIPAL DO HISTÓRICO DE AVISOS (padronizado com o painel principal SAGA) */}
      <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
        <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
        <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
        <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

        <div className="relative space-y-2.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
              <i className="fa-solid fa-bell text-[#FDBA74]"></i> Central de Comunicações
            </span>
          </div>

          <div>
            <h3 className="text-xl md:text-2xl font-black tracking-tight">
              {pendentes > 0 ? `${pendentes} aviso(s) pendente(s) de envio` : "Todos os avisos estão em dia"}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
              <i className="fa-solid fa-layer-group text-[#FDBA74]"></i> {avisos.length} total
            </span>
            {pendentes > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-500/85 text-white text-xs font-extrabold tabular-nums">
                <i className="fa-solid fa-clock"></i> {pendentes} pendente(s)
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
              <i className="fa-solid fa-check text-emerald-300"></i> {enviados} enviado(s)
            </span>
          </div>
        </div>

        {admin && (
          <div className="relative flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/bot-telegram"
              className="btn btn-sm bg-white text-[#1A2332] hover:bg-orange-50 shadow-md font-extrabold"
            >
              <i className="fa-brands fa-telegram text-[#C2410C]"></i> Painel Telegram
            </Link>
          </div>
        )}
      </div>

      {/* BARRA DE BUSCA E FILTROS DO HISTÓRICO */}
      <div className="p-5 space-y-3.5 cartao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
              <i className="fa-solid fa-sliders"></i>
            </span>
            <h3 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
              Filtrar Avisos Acadêmicos
            </h3>
          </div>
          {(filtroStatus !== "TODOS" || busca.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setFiltroStatus("TODOS");
                setBusca("");
              }}
              className="text-xs font-extrabold text-[#B45309] hover:underline flex items-center gap-1"
            >
              <i className="fa-solid fa-rotate-left text-[10px]"></i> Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              <i className="fa-solid fa-magnifying-glass text-[#B45309] mr-1"></i> Buscar por Turma, Disciplina ou Mensagem
            </label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              data-busca
              placeholder="Ex: SIST. DE INFORM., LAB04, cancelada...  ( / )"
              className="campo campo-sm w-full"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              <i className="fa-solid fa-filter text-[#B45309] mr-1"></i> Status do Aviso
            </label>
            <div className="grid grid-cols-3 gap-1.5 bg-[#F1F3F6] p-1 rounded-[14px]">
              {([
                ["TODOS", `Todos (${avisos.length})`],
                ["PENDENTES", `Pend. (${pendentes})`],
                ["ENVIADOS", `Env. (${enviados})`],
              ] as const).map(([val, rotulo]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFiltroStatus(val)}
                  className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition text-center truncate ${
                    filtroStatus === val
                      ? "bg-[#1A2332] text-white shadow-xs"
                      : "text-gray-600 hover:text-[#1A2332]"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* VISÃO CELULAR: Cartões empilhados sem rolagem horizontal */}
      <div className="md:hidden space-y-3">
        {avisosFiltrados.length === 0 && (
          <div className="cartao p-6 text-center text-gray-400 text-sm">Nenhum aviso encontrado.</div>
        )}
        {avisosFiltrados.map((a) => {
          const [fundo, ponto] = SELO[a.status] ?? SELO.Pendente;
          const emEdicao = editandoId === a.id;
          return (
            <div key={a.id} className="cartao p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-bold text-sm text-gray-900 leading-snug">{a.turma}</div>
                <span className="text-[11px] text-gray-500 whitespace-nowrap shrink-0">{a.quando}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className={`${fundo} inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full font-extrabold`}>
                  <span aria-hidden="true" className={`w-2 h-2 rounded-full ${ponto}`}></span>
                  {a.status}
                </span>
              </div>

              {emEdicao ? (
                <div className="space-y-2">
                  <textarea
                    value={textoEditado}
                    onChange={(e) => setTextoEditado(e.target.value)}
                    rows={3}
                    className="campo text-sm w-full leading-relaxed"
                    placeholder="Edite o texto do aviso antes de enviar..."
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={cancelarEdicao} disabled={pendente} className="btn btn-sm btn-secundario">
                      Cancelar
                    </button>
                    <button onClick={() => salvarTexto(a)} disabled={pendente} className="btn btn-sm btn-principal">
                      <i className="fa-solid fa-check"></i> Salvar texto
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 leading-relaxed break-words bg-gray-50 rounded-xl p-3">
                  {a.mensagem}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {a.enfileirado ? (
                  admin ? (
                    <Link href="/bot-whatsapp" className="btn btn-sm btn-secundario w-full">
                      Ver no bot
                    </Link>
                  ) : (
                    <span className="text-xs text-gray-500">Fila gerenciada pelo administrador</span>
                  )
                ) : a.status === "Pendente" || a.status === "Falhou" ? (
                  <>
                    {!emEdicao && (
                      <button
                        onClick={() => abrirEdicao(a)}
                        disabled={pendente}
                        title="Editar texto antes de enviar"
                        aria-label="Editar aviso"
                        className="btn btn-icone shrink-0"
                      >
                        <i className="fa-solid fa-pen"></i>
                      </button>
                    )}
                    <button
                      onClick={() => enviarTelegram(a)}
                      disabled={pendente}
                      title="Validar chave e disparar pelo Telegram"
                      className="btn btn-sm btn-principal flex-1"
                    >
                      <i className="fa-brands fa-telegram"></i> Telegram
                    </button>
                    <button
                      onClick={() => marcar(a, true)}
                      disabled={pendente}
                      title="Já enviei por outro meio"
                      aria-label="Marcar como enviado"
                      className="btn btn-icone shrink-0"
                    >
                      <i className="fa-solid fa-check"></i>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => marcar(a, false)}
                    disabled={pendente}
                    title="Voltar para pendente"
                    className="btn btn-sm btn-secundario w-full"
                  >
                    <i className="fa-solid fa-rotate-left"></i> Desfazer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* VISÃO DESKTOP: Tabela completa */}
      <div className="hidden md:block cartao overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[780px]">
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
            {avisosFiltrados.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-400">
                  Nenhum aviso encontrado.
                </td>
              </tr>
            )}
            {avisosFiltrados.map((a) => {
              const [fundo, ponto] = SELO[a.status] ?? SELO.Pendente;
              const emEdicao = editandoId === a.id;
              return (
                <tr key={a.id} className="align-top">
                  <td className="p-3 pl-5 text-xs text-gray-500 whitespace-nowrap">{a.quando}</td>
                  <td className="p-3 font-semibold">{a.turma}</td>
                  <td className="p-3 min-w-[260px]">
                    {emEdicao ? (
                      <div className="space-y-2">
                        <textarea
                          value={textoEditado}
                          onChange={(e) => setTextoEditado(e.target.value)}
                          rows={3}
                          className="campo text-sm w-full leading-relaxed"
                          placeholder="Edite o texto do aviso antes de enviar..."
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={cancelarEdicao} disabled={pendente} className="btn btn-sm btn-secundario">
                            Cancelar
                          </button>
                          <button onClick={() => salvarTexto(a)} disabled={pendente} className="btn btn-sm btn-principal">
                            <i className="fa-solid fa-check"></i> Salvar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="whitespace-pre-line">{a.mensagem}</div>
                    )}
                  </td>
                  <td className="p-3 text-center">
                    <span className={`${fundo} inline-flex items-center gap-1.5 whitespace-nowrap text-xs px-3 py-1 rounded-full font-extrabold`}>
                      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${ponto}`}></span>
                      {a.status}
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
                          {!emEdicao && (
                            <button
                              onClick={() => abrirEdicao(a)}
                              disabled={pendente}
                              title="Editar texto antes de enviar"
                              aria-label="Editar aviso"
                              className="btn btn-icone"
                            >
                              <i className="fa-solid fa-pen"></i>
                            </button>
                          )}
                          <button
                            onClick={() => enviarTelegram(a)}
                            disabled={pendente}
                            title="Validar chave e disparar pelo Telegram"
                            className="btn btn-sm btn-principal"
                          >
                            <i className="fa-brands fa-telegram"></i> Telegram
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
