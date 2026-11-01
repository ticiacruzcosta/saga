"use client";

// Calendário letivo: início e fim das aulas do semestre aberto e dias sem aula (feriados, recessos).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adicionarDiaSemAula, removerDiaSemAula, salvarPeriodoLetivo } from "@/app/calendario";
import { diaDaData, diaMes } from "@/lib/datas";
import type { CalendarioVM } from "@/lib/tipos";

const inp = "w-full border border-gray-200 rounded-lg p-2.5 text-sm";

export default function TelaCalendario({ calendario, oferta }: { calendario: CalendarioVM; oferta: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [inicio, setInicio] = useState(calendario.inicio);
  const [fim, setFim] = useState(calendario.fim);
  const [data, setData] = useState("");
  const [descricao, setDescricao] = useState("");

  const rodar = (acao: () => Promise<{ ok: boolean; erro?: string }>, depois?: () => void) =>
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) return alert(r.erro);
      depois?.();
      router.refresh();
    });

  return (
    <section className="space-y-6 max-w-3xl">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <h3 className="font-bold text-[#1A2332]">Período letivo de {oferta}</h3>
        <p className="text-xs text-gray-500">Fora deste período o calendário do Dashboard mostra os dias como "sem aula".</p>
        <div className="grid sm:grid-cols-3 gap-3 items-end">
          <label className="text-sm font-semibold text-gray-700">Início das aulas<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className={inp} /></label>
          <label className="text-sm font-semibold text-gray-700">Fim das aulas<input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className={inp} /></label>
          <button onClick={() => rodar(() => salvarPeriodoLetivo({ inicio, fim }))} disabled={pendente} className="bg-[#F39200] text-white rounded-lg py-2.5 text-sm font-bold">
            Salvar período
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
        <h3 className="font-bold text-[#1A2332]">Feriados e dias sem aula</h3>
        <div className="grid sm:grid-cols-[10rem_1fr_auto] gap-3 items-end">
          <label className="text-sm font-semibold text-gray-700">Data<input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inp} /></label>
          <label className="text-sm font-semibold text-gray-700">Motivo<input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: Finados" className={inp} /></label>
          <button
            onClick={() => rodar(() => adicionarDiaSemAula({ data, descricao }), () => { setData(""); setDescricao(""); })}
            disabled={pendente} className="bg-[#1A2332] text-white rounded-lg px-4 py-2.5 text-sm font-bold"
          >
            Adicionar
          </button>
        </div>
        <ul className="divide-y divide-gray-200 text-sm">
          {calendario.semAula.length === 0 && <li className="py-3 text-gray-400">Nenhum dia cadastrado.</li>}
          {calendario.semAula.map((d) => (
            <li key={d.id} className="py-2.5 flex justify-between items-center">
              <span>
                <b>{diaMes(d.data)}/{d.data.slice(0, 4)}</b>
                <span className="text-xs text-gray-500 ml-2">{(diaDaData(d.data) ?? "DOMINGO").toLowerCase()}</span>
                <span className="ml-3">{d.descricao}</span>
              </span>
              <button onClick={() => rodar(() => removerDiaSemAula(d.id))} disabled={pendente} title="Remover" className="p-2 text-gray-400 hover:text-red-600">
                <i className="fa-solid fa-trash"></i>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
