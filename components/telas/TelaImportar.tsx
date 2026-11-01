"use client";

// Importar Planilha: confere o .xlsx (sem gravar) e depois grava a oferta.

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarImportacao, previsualizarImportacao } from "@/app/importacao";
import type { PreviaImportacao } from "@/lib/tipos";

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
        alert(`Oferta ${r.codigo} importada: ${r.turmas} turmas.`);
        router.refresh();
      } else if (r.erro) alert(r.erro);
    });
  }

  return (
    <section className="space-y-6">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-2xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 bg-orange-100 text-[#F39200] rounded-full flex items-center justify-center mx-auto text-2xl">
          <i className="fa-solid fa-cloud-arrow-up"></i>
        </div>
        <h3 className="text-lg font-bold text-[#1A2332]">Importar Planilha de Oferta (.XLSX)</h3>
        <input ref={inputArquivo} type="file" accept=".xlsx" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
        <div
          onClick={() => inputArquivo.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); escolherArquivo(e.dataTransfer.files?.[0]); }}
          className="border-2 border-dashed border-gray-300 rounded-xl p-8 hover:border-[#F39200] transition cursor-pointer bg-gray-50"
        >
          <i className="fa-regular fa-file-excel text-4xl text-green-600 mb-2"></i>
          <p className="text-sm font-semibold text-gray-700">{arquivo ? arquivo.name : "Clique ou arraste o arquivo aqui"}</p>
          {arquivo && <p className="text-xs text-gray-400">{(arquivo.size / 1024).toFixed(0)} KB</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          <label className="block text-sm font-semibold text-gray-700">
            Semestre da oferta
            <input value={impCodigo} onChange={(e) => { setImpCodigo(e.target.value); setPrevia(null); }} placeholder="2027.1" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-normal" />
          </label>
          <div className="space-y-2 text-sm text-gray-700 pt-6">
            <label className="flex items-center gap-2"><input type="checkbox" checked={impPublicar} onChange={(e) => setImpPublicar(e.target.checked)} /> Publicar (passa a ser a oferta exibida)</label>
            {previa?.ofertaExistente && (
              <label className="flex items-center gap-2 text-red-700 font-semibold"><input type="checkbox" checked={impSubstituir} onChange={(e) => setImpSubstituir(e.target.checked)} /> Substituir a oferta {previa.codigo}</label>
            )}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={previsualizar} disabled={!arquivo || pendente} className="bg-[#1A2332] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex-1">
            {pendente ? "Lendo..." : "1. Conferir Arquivo"}
          </button>
          <button
            onClick={importar}
            disabled={!previa?.ok || previa.gravado || pendente || Boolean(previa.ofertaExistente && !impSubstituir)}
            className="bg-[#F39200] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex-1"
          >
            2. Importar
          </button>
        </div>
      </div>

      {previa && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-4xl mx-auto space-y-4 text-sm">
          {previa.erro && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 font-semibold">{previa.erro}</div>}
          {previa.gravado && <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 font-semibold">Oferta {previa.codigo} gravada com {previa.turmas} turmas.</div>}
          {previa.turmas != null && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ["Turmas lidas", previa.turmas],
                  ["Comunalidade", previa.comunalidade],
                  ["Choques", previa.choques?.filter((c) => c.gravidade === "ERRO").length],
                  ["Para confirmar", previa.choques?.filter((c) => c.gravidade === "AVISO").length],
                ].map(([rotulo, n]) => (
                  <div key={String(rotulo)} className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-[#1A2332]">{n ?? 0}</div>
                    <div className="text-xs text-gray-500">{rotulo}</div>
                  </div>
                ))}
              </div>
              <p className="text-gray-500">Aba lida: <b>{previa.aba}</b>. Nada foi gravado ainda{previa.gravado ? " (agora já foi)" : ""}.</p>
              {previa.ofertaExistente && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3">
                  A oferta <b>{previa.codigo}</b> já existe ({previa.ofertaExistente.status}) com {previa.ofertaExistente.turmas} turmas
                  {previa.ofertaExistente.alteracoes > 0 && ` e ${previa.ofertaExistente.alteracoes} alterações do dashboard`}. Ao substituir, essas turmas
                  {previa.ofertaExistente.alteracoes > 0 && " e alterações"} são apagadas. Cadastros e avisos não mudam.
                </div>
              )}
              {([
                ["Professores novos", previa.professoresNovos],
                ["Disciplinas novas (sem código de matriz)", previa.disciplinasNovas],
                ["Laboratórios novos (sem capacidade)", previa.salasNovas],
                ["Turmas de alunos novas", previa.gruposNovos],
              ] as const).map(([rotulo, lista]) => lista && lista.length > 0 && (
                <details key={rotulo}>
                  <summary className="cursor-pointer font-semibold text-gray-700">{rotulo}: {lista.length}</summary>
                  <p className="text-gray-600 mt-1">{lista.join(" · ")}</p>
                </details>
              ))}
              {previa.problemas && previa.problemas.length > 0 && (
                <details open>
                  <summary className="cursor-pointer font-semibold text-gray-700">Linhas para conferir na planilha: {previa.problemas.length}</summary>
                  <ul className="mt-1 space-y-1">{previa.problemas.map((p, i) => <li key={i} className="text-gray-600">Linha {p.linha}: {p.mensagem}</li>)}</ul>
                </details>
              )}
              {previa.choques && previa.choques.length > 0 && (
                <details open>
                  <summary className="cursor-pointer font-semibold text-gray-700">Choques encontrados: {previa.choques.length}</summary>
                  <ul className="mt-1 space-y-1">
                    {previa.choques.map((c, i) => (
                      <li key={i} className={c.gravidade === "ERRO" ? "text-red-700" : "text-yellow-700"}>
                        <i className={`fa-solid ${c.gravidade === "ERRO" ? "fa-circle-xmark" : "fa-triangle-exclamation"} mr-1`}></i>
                        Linha {c.linha}: {c.mensagem}
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
