"use client";

// Importar Planilha: confere o .xlsx (sem gravar) e depois grava a oferta.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarImportacao, previsualizarImportacao } from "@/app/importacao";
import type { PreviaImportacao } from "@/lib/tipos";
import { avisar } from "@/components/avisos";

export default function TelaImportar({ ofertaAtual }: { ofertaAtual: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  // importação de planilha
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [impCodigo, setImpCodigo] = useState(ofertaAtual === "—" ? "" : ofertaAtual);
  const [impSubstituir, setImpSubstituir] = useState(false);
  const [impPublicar, setImpPublicar] = useState(true);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  function formImportacao() {
    const fd = new FormData();
    if (arquivo) fd.set("arquivo", arquivo);
    fd.set("codigo", impCodigo);
    if (impSubstituir) fd.set("substituir", "on");
    if (impPublicar) fd.set("publicar", "on");
    return fd;
  }
  function escolherArquivo(f: File | null | undefined) {
    setArquivo(f ?? null);
    setPrevia(null);
  }
  function previsualizar() {
    iniciar(async () => setPrevia(await previsualizarImportacao(formImportacao())));
  }
  function importar() {
    iniciar(async () => {
      const r = await confirmarImportacao(formImportacao());
      setPrevia(r);
      if (r.gravado) {
        avisar(`Oferta ${r.codigo} importada: ${r.turmas} turmas.`);
        router.refresh();
      } else if (r.erro) avisar(r.erro, "erro");
    });
  }

  const etapaAtual = previa?.gravado ? 3 : previa?.ok ? 2 : 1;

  return (
    <section className="space-y-5">
      {/* BANNER PRINCIPAL DE IMPORTAÇÃO DE PLANILHA (padrão institucional SAGA) */}
      <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
        <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
        <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
        <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

        <div className="relative space-y-2.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
              <i className="fa-solid fa-file-excel text-[#FDBA74]"></i> Importação de Oferta
            </span>
          </div>

          <div>
            <h3 className="text-xl md:text-2xl font-black tracking-tight">
              Semestre {impCodigo || ofertaAtual}
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold ${etapaAtual >= 1 ? "bg-white text-[#1A2332]" : "bg-white/15 text-white"}`}>
              <i className="fa-solid fa-magnifying-glass text-[#C2410C]"></i> 1. Conferir Arquivo
            </span>
            <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold ${etapaAtual >= 2 ? "bg-white text-[#1A2332]" : "bg-white/15 text-white/80"}`}>
              <i className={`fa-solid fa-cloud-arrow-up ${etapaAtual >= 2 ? "text-[#C2410C]" : "text-[#FDBA74]"}`}></i> 2. Gravar Oferta
            </span>
          </div>
        </div>
      </div>

      {/* CARTÃO DE UPLOAD E CONFIGURAÇÃO DA OFERTA */}
      <div className="cartao p-6 md:p-8 space-y-6">
        <input
          ref={inputArquivo}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => escolherArquivo(e.target.files?.[0])}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* ÁREA DE ARRASTAR / SELECIONAR ARQUIVO */}
          <div className="lg:col-span-7 flex flex-col">
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              <i className="fa-solid fa-file-arrow-up text-[#B45309] mr-1"></i> Planilha da Oferta (.xlsx)
            </label>
            <div
              onClick={() => inputArquivo.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                escolherArquivo(e.dataTransfer.files?.[0]);
              }}
              className={`flex-1 rounded-2xl border-2 border-dashed p-6 md:p-8 flex flex-col items-center justify-center text-center transition cursor-pointer ${
                arquivo
                  ? "border-emerald-400 bg-emerald-50/40"
                  : "border-gray-300 bg-[#F8FAFC] hover:border-[#F39200] hover:bg-[#FFF9F2]"
              }`}
            >
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mb-3 shadow-xs ${
                  arquivo
                    ? "bg-emerald-600 text-white"
                    : "bg-[#FFF4E5] text-[#C2410C]"
                }`}
              >
                <i className={`fa-solid ${arquivo ? "fa-file-circle-check" : "fa-file-excel"}`}></i>
              </div>

              {arquivo ? (
                <div className="space-y-1">
                  <p className="text-sm font-extrabold text-[#1A2332] break-all">{arquivo.name}</p>
                  <p className="text-xs font-bold text-emerald-700 tabular-nums">
                    {(arquivo.size / 1024).toFixed(0)} KB · Pronto para conferência
                  </p>
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#B45309] pt-1 hover:underline">
                    <i className="fa-solid fa-repeat text-[10px]"></i> Trocar arquivo
                  </span>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-extrabold text-[#1A2332]">
                    Clique para selecionar ou arraste a planilha aqui
                  </p>
                  <p className="text-xs text-gray-500">
                    Formato aceito: <b>.XLSX</b> · Cursos e turmas novos são detectados automaticamente
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* PARÂMETROS E BOTÕES DE AÇÃO */}
          <div className="lg:col-span-5 flex flex-col justify-between space-y-4 bg-[#F8FAFC] rounded-2xl p-5 border border-gray-200/70">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                  <i className="fa-solid fa-gear"></i>
                </span>
                <h4 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
                  Configurações da Importação
                </h4>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  <i className="fa-solid fa-calendar-days text-[#B45309] mr-1"></i> Semestre da Oferta
                </label>
                <input
                  value={impCodigo}
                  onChange={(e) => {
                    setImpCodigo(e.target.value);
                    setPrevia(null);
                  }}
                  placeholder="Ex: 2026.2"
                  className="campo w-full font-bold tabular-nums"
                />
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-white border border-gray-200/80 cursor-pointer hover:border-orange-300 transition">
                  <input
                    type="checkbox"
                    checked={impPublicar}
                    onChange={(e) => setImpPublicar(e.target.checked)}
                    className="mt-0.5 accent-[#C2410C] w-4 h-4 rounded"
                  />
                  <span className="text-xs leading-snug">
                    <strong className="block font-extrabold text-[#1A2332]">Publicar oferta imediatamente</strong>
                    <span className="text-gray-500">Passa a ser o semestre ativo exibido no painel</span>
                  </span>
                </label>

                {previa?.ofertaExistente && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={impSubstituir}
                      onChange={(e) => setImpSubstituir(e.target.checked)}
                      className="mt-0.5 accent-red-600 w-4 h-4 rounded"
                    />
                    <span className="text-xs leading-snug text-red-800">
                      <strong className="block font-extrabold">Substituir a oferta {previa.codigo} existente</strong>
                      <span>Atualiza as turmas do semestre {previa.codigo} com os dados desta planilha</span>
                    </span>
                  </label>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
              <button
                type="button"
                onClick={previsualizar}
                disabled={!arquivo || pendente}
                className="btn btn-escuro w-full justify-center"
              >
                <i className="fa-solid fa-magnifying-glass"></i>
                {pendente ? "Lendo..." : "1. Conferir Arquivo"}
              </button>
              <button
                type="button"
                onClick={importar}
                disabled={!previa?.ok || previa.gravado || pendente || Boolean(previa.ofertaExistente && !impSubstituir)}
                className="btn btn-principal w-full justify-center"
              >
                <i className="fa-solid fa-cloud-arrow-up"></i> 2. Importar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RESULTADO DA PRÉVIA / IMPORTAÇÃO */}
      {previa && (
        <div className="p-6 space-y-4 text-sm cartao">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                <i className="fa-solid fa-clipboard-check"></i>
              </span>
              <h3 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
                Relatório de Conferência da Planilha
              </h3>
            </div>
            {previa.aba && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-[#F1F3F6] text-[#1A2332]">
                <i className="fa-solid fa-table text-[#B45309]"></i> Aba lida: {previa.aba}
              </span>
            )}
          </div>

          {previa.erro && (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-[14px] p-3.5 font-semibold flex items-center gap-2">
              <i className="fa-solid fa-circle-xmark text-red-600"></i>
              <span>{previa.erro}</span>
            </div>
          )}

          {previa.gravado && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-[14px] p-3.5 font-semibold flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-emerald-600"></i>
              <span>Oferta {previa.codigo} gravada com sucesso ({previa.turmas} turmas).</span>
            </div>
          )}

          {previa.turmas != null && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["Turmas lidas", previa.turmas, "fa-layer-group", "text-[#1A2332]"],
                  ["Comunalidade", previa.comunalidade, "fa-link", "text-[#1A2332]"],
                  ["Choques", previa.choques?.filter((c) => c.gravidade === "ERRO").length, "fa-circle-exclamation", "text-red-600"],
                  ["Para confirmar", previa.choques?.filter((c) => c.gravidade === "AVISO").length, "fa-triangle-exclamation", "text-amber-600"],
                ].map(([rotulo, n, icone, cor]) => (
                  <div key={String(rotulo)} className="bg-[#F8FAFC] border border-gray-200/70 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                      <div className={`text-2xl font-black tabular-nums ${cor}`}>{n ?? 0}</div>
                      <div className="text-xs font-bold text-gray-500">{rotulo}</div>
                    </div>
                    <span className="w-10 h-10 rounded-xl bg-white border border-gray-200/70 flex items-center justify-center text-[#B45309]">
                      <i className={`fa-solid ${icone}`}></i>
                    </span>
                  </div>
                ))}
              </div>

              {previa.cursosNovos && previa.cursosNovos.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 text-orange-900 rounded-[14px] p-4 space-y-2">
                  <p className="font-extrabold flex items-center gap-1.5">
                    <i className="fa-solid fa-graduation-cap text-[#C2410C]"></i>
                    Cursos novos encontrados: {previa.cursosNovos.length}
                  </p>
                  <p className="text-xs">
                    Ao clicar em <b>2. Importar</b>, estes cursos serão cadastrados automaticamente junto com as turmas:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-xs">
                    {previa.cursosNovos.map((c) => (
                      <li key={c.nome}>
                        <b>{c.nome}</b> — sigla sugerida: <b>{c.sigla}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previa.cursosNovos?.length === 0 && !previa.gravado && (
                <p className="text-emerald-700 font-bold text-xs flex items-center gap-1.5">
                  <i className="fa-solid fa-circle-check"></i> Todos os cursos da planilha já estão cadastrados.
                </p>
              )}

              {previa.ofertaExistente && (
                <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-[14px] p-3.5 text-xs leading-relaxed">
                  <i className="fa-solid fa-triangle-exclamation text-amber-600 mr-1.5"></i>
                  A oferta <b>{previa.codigo}</b> já existe ({previa.ofertaExistente.status}) com <b>{previa.ofertaExistente.turmas} turmas</b>
                  {previa.ofertaExistente.alteracoes > 0 && ` e ${previa.ofertaExistente.alteracoes} alterações do dashboard`}. Marque a opção{" "}
                  <b>Substituir a oferta {previa.codigo}</b> acima para prosseguir.
                </div>
              )}

              {([
                ["Professores novos", previa.professoresNovos],
                ["Disciplinas novas (sem código de matriz)", previa.disciplinasNovas],
                ["Laboratórios novos (sem capacidade)", previa.salasNovas],
                ["Turmas de alunos novas", previa.gruposNovos],
              ] as const).map(
                ([rotulo, lista]) =>
                  lista &&
                  lista.length > 0 && (
                    <details key={rotulo} className="bg-[#F8FAFC] rounded-xl p-3 border border-gray-200/70">
                      <summary className="cursor-pointer font-extrabold text-xs text-[#1A2332]">
                        {rotulo}: {lista.length}
                      </summary>
                      <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">{lista.join(" · ")}</p>
                    </details>
                  )
              )}

              {previa.problemas && previa.problemas.length > 0 && (
                <details open className="bg-[#F8FAFC] rounded-xl p-3 border border-gray-200/70">
                  <summary className="cursor-pointer font-extrabold text-xs text-[#1A2332]">
                    Linhas para conferir na planilha: {previa.problemas.length}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {previa.problemas.map((p, i) => (
                      <li key={i} className="text-gray-600">
                        <b>Linha {p.linha}:</b> {p.mensagem}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {previa.choques && previa.choques.length > 0 && (
                <details open className="bg-[#F8FAFC] rounded-xl p-3 border border-gray-200/70">
                  <summary className="cursor-pointer font-extrabold text-xs text-[#1A2332]">
                    Choques encontrados: {previa.choques.length}
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
                    {previa.choques.map((c, i) => (
                      <li key={i} className={c.gravidade === "ERRO" ? "text-red-700 font-semibold" : "text-amber-700"}>
                        <i className={`fa-solid ${c.gravidade === "ERRO" ? "fa-circle-xmark" : "fa-triangle-exclamation"} mr-1.5`}></i>
                        <b>Linha {c.linha}:</b> {c.mensagem}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
