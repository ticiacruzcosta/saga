"use client";

// Horário da Semana: quadro de segunda a sábado, com linhas por turma, professor ou sala. Pode ser impresso.

import { useMemo, useState } from "react";
import { OPCOES_DIA, ORDEM_DIA, porDiaHora } from "@/components/comum";
import type { DadosSaga, TurmaVM } from "@/lib/tipos";

export default function TelaSemana({ dados }: { dados: DadosSaga }) {
  const [sDia, setSDia] = useState("TODOS");
  const [sProf, setSProf] = useState("TODOS");
  const [sTurma, setSTurma] = useState("TODOS");
  const [sBusca, setSBusca] = useState("");
  const [sAgrupar, setSAgrupar] = useState<"turma" | "prof" | "sala">("turma");

  // Quadro da semana: sempre a grade normal (sala/professor sem a troca de hoje; a troca aparece como marca no cartão)
  const semana = useMemo(() => {
    const termo = sBusca.toLowerCase();
    const aulas = dados.turmas
      .filter((t) => sDia === "TODOS" || t.dia === sDia)
      .filter((t) => sProf === "TODOS" || t.profGrade === sProf)
      .filter((t) => sTurma === "TODOS" || t.turma === sTurma)
      .filter((t) => !termo || `${t.dia} ${t.turma} ${t.nome} ${t.profGrade} ${t.salaGrade} ${t.formato}`.toLowerCase().includes(termo))
      // por professor/sala, quem assiste junto repetiria o mesmo cartão
      .filter((t) => sAgrupar === "turma" || !t.consome)
      .filter((t) => sAgrupar !== "sala" || !["Sala comum", "EAD"].includes(t.salaGrade))
      .sort(porDiaHora);
    const chave = (t: TurmaVM) => (sAgrupar === "turma" ? t.turma : sAgrupar === "prof" ? t.profGrade : t.salaGrade);
    const linhas = new Map<string, Map<string, TurmaVM[]>>();
    for (const t of aulas) {
      const k = chave(t);
      if (!linhas.has(k)) linhas.set(k, new Map());
      const col = t.dia || "EAD";
      linhas.get(k)!.set(col, [...(linhas.get(k)!.get(col) ?? []), t]);
    }
    const colunas = [...ORDEM_DIA.filter((d) => sDia === "TODOS" || d === sDia), ...(aulas.some((t) => !t.dia) ? ["EAD"] : [])];
    return { linhas: [...linhas.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true })), colunas, total: aulas.length };
  }, [dados, sDia, sProf, sTurma, sBusca, sAgrupar]);

  return (
    <section className="space-y-4">
      <div className="p-5 space-y-4 print:hidden cartao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#1A2332] uppercase tracking-wider flex items-center gap-2">
            <i className="fa-solid fa-filter text-[#B45309]"></i> Filtros do Quadro Geral
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">Linhas por:</span>
            {([["turma", "Turma"], ["prof", "Professor"], ["sala", "Sala / Lab"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setSAgrupar(v)}
                className={`btn btn-sm ${sAgrupar === v ? "btn-escuro" : "btn-secundario"}`}>
                {l}
              </button>
            ))}
            <button onClick={() => window.print()} className="btn btn-secundario btn-sm">
              <i className="fa-solid fa-print mr-1"></i>Imprimir
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Dia da Semana</label>
            <select value={sDia} onChange={(e) => setSDia(e.target.value)} className="campo campo-sm w-full">
              <option value="TODOS">Todos os Dias</option>
              {OPCOES_DIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Professor</label>
            <select value={sProf} onChange={(e) => setSProf(e.target.value)} className="campo campo-sm w-full">
              <option value="TODOS">Todos os Professores</option>
              {dados.professores.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Curso / Turma</label>
            <select value={sTurma} onChange={(e) => setSTurma(e.target.value)} className="campo campo-sm w-full">
              <option value="TODOS">Todas as Turmas</option>
              {dados.grupos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Busca Direta</label>
            <input type="text" value={sBusca} onChange={(e) => setSBusca(e.target.value)} data-busca placeholder="Ex: LAB01, Irvine...  ( / )" className="campo campo-sm w-full" />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto print:shadow-none print:border-0 cartao">
        {semana.total === 0 ? (
          <p className="p-8 text-center text-gray-400">Nada encontrado.</p>
        ) : (
          <table className="w-full border-collapse text-xs min-w-[900px]">
            <thead>
              <tr className="tabela-cab">
                <th className="p-3 text-left w-44 sticky left-0 bg-[var(--saga-cabecalho-tabela)]">{sAgrupar === "turma" ? "Turma" : sAgrupar === "prof" ? "Professor" : "Sala / Lab"}</th>
                {semana.colunas.map((c) => (
                  <th key={c} className={`p-3 text-left ${c === dados.diaHoje ? "bg-[#FFF4E5] text-[#9A3412]" : ""}`}>
                    {c === "EAD" ? "EAD / sem dia" : OPCOES_DIA.find(([v]) => v === c)?.[1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {semana.linhas.map(([nome, porDia]) => (
                <tr key={nome} className="align-top break-inside-avoid">
                  <td className="p-3 font-bold text-[#1A2332] sticky left-0 bg-white border-r border-gray-100">{nome}</td>
                  {semana.colunas.map((c) => (
                    <td key={c} className={`p-2 space-y-2 ${c === dados.diaHoje ? "bg-orange-50/40" : ""}`}>
                      {(porDia.get(c) ?? []).map((a) => {
                        const erro = a.conflitos.some((x) => x.gravidade === "ERRO");
                        const corFormato =
                          a.formato === "Híbrida" ? "border-l-purple-500" : a.formato === "Síncrona" ? "border-l-teal-500"
                          : a.formato === "Assíncrona" ? "border-l-gray-400" : "border-l-[#1A2332]";
                        const trocaHoje = a.alteradaHoje && a.dia === dados.diaHoje;
                        return (
                          <div key={a.id} title={a.conflitos.map((x) => x.mensagem).join("\n") || undefined}
                            className={`rounded-xl border border-l-4 ${corFormato} ${erro ? "border-red-400 bg-red-50/80" : "border-gray-200/90 bg-white shadow-2xs"} p-2.5 leading-snug space-y-1`}>
                            <div className="font-bold text-[#1A2332]">{a.nome}</div>
                            {a.horario !== "—" && (
                              <div className="text-[11px] font-bold tabular-nums text-gray-500">
                                <i className="fa-regular fa-clock text-[9px] text-[#B45309] mr-1"></i>
                                {a.horario}
                              </div>
                            )}
                            {sAgrupar !== "turma" && <div className="text-[11px] font-semibold text-gray-700">{a.turma}</div>}
                            {sAgrupar !== "prof" && <div className="text-[11px] text-gray-500">{a.profGrade}</div>}
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              {sAgrupar !== "sala" && (
                                <span className="inline-block px-2 py-0.5 rounded-md bg-[#FFF4E5] font-extrabold text-[10px] text-[#B45309]">
                                  {a.salaGrade}
                                </span>
                              )}
                              {a.formato !== "Presencial" && (
                                <span className="inline-block px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] font-semibold text-gray-600">
                                  {a.formato}
                                </span>
                              )}
                            </div>
                            {a.consome && <div className="text-[10px] font-medium text-blue-600">assiste com outro curso</div>}
                            {trocaHoje && (
                              a.canceladaHoje ? (
                                <div className="mt-1 text-[10px] font-extrabold text-red-700 bg-red-100 rounded-md px-1.5 py-0.5">
                                  hoje: AULA CANCELADA
                                </div>
                              ) : (
                                <div className="mt-1 text-[10px] font-bold text-blue-700 bg-blue-50 rounded-md px-1.5 py-0.5">
                                  hoje: {a.sala !== a.salaGrade ? a.sala : ""}{a.sala !== a.salaGrade && a.prof !== a.profGrade ? " · " : ""}{a.prof !== a.profGrade ? a.prof : ""}
                                </div>
                              )
                            )}
                            {erro && <div className="mt-1 text-[10px] font-bold text-red-700">conflito</div>}
                          </div>
                        );
                      })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-[11px] text-gray-500 print:hidden">
        <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-[#1A2332] bg-gray-100 mr-1"></span>Presencial</span>
        <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-purple-500 bg-gray-100 mr-1"></span>Híbrida</span>
        <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-teal-500 bg-gray-100 mr-1"></span>Síncrona</span>
        <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-gray-400 bg-gray-100 mr-1"></span>Assíncrona</span>
        <span><span className="inline-block w-3 h-3 align-middle border border-red-400 bg-red-50 mr-1"></span>Com conflito</span>
        <span className="text-[#B45309] font-semibold">Coluna laranja = hoje</span>
      </div>
    </section>
  );
}
