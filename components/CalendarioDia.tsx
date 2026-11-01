"use client";

// Calendário do Dashboard: abre ao clicar (ou segurar) na data.
// Com "Mostrar ocupação das salas", pinta cada dia conforme as salas livres:
//   vermelho = lotado ou dia que já passou | laranja = sobra sala, mas menos de 50% livres
//   amarelo  = 50% a 69% livres            | verde   = 70% ou mais livres
// A ocupação segue a grade da semana (todo dia de segunda é igual); hoje inclui as trocas do lápis.

import { useState } from "react";
import { diaDaData, semanasDoMes } from "@/lib/datas";

export type Ocupacao = { livres: number; total: number };

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function corDoDia(passou: boolean, o: Ocupacao | null): { cls: string; texto: string } {
  if (!o) return { cls: "bg-gray-100 text-gray-400", texto: "Sem aula" };
  const pct = o.total ? o.livres / o.total : 1;
  const resumo = `${o.livres} de ${o.total} salas livres`;
  if (passou) return { cls: "bg-red-200 text-red-900 opacity-60", texto: `Já passou (${resumo})` };
  if (o.livres === 0) return { cls: "bg-red-500 text-white", texto: `Lotado (${resumo})` };
  if (pct < 0.5) return { cls: "bg-orange-400 text-white", texto: resumo };
  if (pct < 0.7) return { cls: "bg-yellow-300 text-yellow-900", texto: resumo };
  return { cls: "bg-green-500 text-white", texto: resumo };
}

export default function CalendarioDia({
  hoje, selecionada, ocupacao, semAula, onEscolher, onFechar,
}: {
  hoje: string;
  selecionada: string;
  ocupacao: (data: string) => Ocupacao | null; // null = domingo ou dia sem aula
  semAula: (data: string) => string | null; // feriado / fora do período letivo
  onEscolher: (data: string) => void;
  onFechar: () => void;
}) {
  const [mes, setMes] = useState(() => ({ ano: Number(selecionada.slice(0, 4)), mes: Number(selecionada.slice(5, 7)) - 1 }));
  const [mostrarOcupacao, setMostrarOcupacao] = useState(() => {
    try {
      return localStorage.getItem("saga_cal_ocupacao") === "1";
    } catch {
      return false;
    }
  });
  function alternarOcupacao(v: boolean) {
    setMostrarOcupacao(v);
    try {
      localStorage.setItem("saga_cal_ocupacao", v ? "1" : "0");
    } catch {
      // sem armazenamento: só não lembra a escolha
    }
  }
  const andarMes = (n: number) => setMes(({ ano, mes }) => ({ ano: ano + Math.floor((mes + n) / 12), mes: (((mes + n) % 12) + 12) % 12 }));

  return (
    <>
      {/* clicar fora fecha */}
      <div className="fixed inset-0 z-40" onClick={onFechar} />
      <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-80 text-sm">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => andarMes(-1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-600" title="Mês anterior"><i className="fa-solid fa-chevron-left"></i></button>
          <span className="font-bold text-[#1A2332]">{MESES[mes.mes]} {mes.ano}</span>
          <button onClick={() => andarMes(1)} className="w-8 h-8 rounded-lg hover:bg-gray-100 text-gray-600" title="Próximo mês"><i className="fa-solid fa-chevron-right"></i></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-gray-400 mb-1">
          {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <span key={i}>{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {semanasDoMes(mes.ano, mes.mes).flat().map((data, i) => {
            if (!data) return <span key={i} />;
            const dom = diaDaData(data) == null;
            const motivo = semAula(data);
            const cor = mostrarOcupacao && !motivo ? corDoDia(data < hoje, dom ? null : ocupacao(data)) : null;
            const escolhido = data === selecionada;
            return (
              <button
                key={i}
                onClick={() => onEscolher(data)}
                title={motivo ? `Sem aula: ${motivo}` : cor?.texto ?? (dom ? "Domingo: sem aula" : undefined)}
                className={`h-9 rounded-lg text-xs font-semibold transition
                  ${motivo ? "bg-gray-100 text-gray-400 line-through" : cor ? cor.cls : dom ? "text-gray-300" : "text-gray-700 hover:bg-orange-50"}
                  ${escolhido ? "ring-2 ring-[#1A2332] ring-offset-1" : ""}
                  ${data === hoje ? "underline decoration-2 underline-offset-2" : ""}`}
              >
                {Number(data.slice(8))}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-gray-700 cursor-pointer">
          <input type="checkbox" checked={mostrarOcupacao} onChange={(e) => alternarOcupacao(e.target.checked)} /> Mostrar ocupação das salas
        </label>
        {mostrarOcupacao && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-600">
            <span><i className="fa-solid fa-square text-red-500"></i> Lotado / já passou</span>
            <span><i className="fa-solid fa-square text-orange-400"></i> Menos de 50% livres</span>
            <span><i className="fa-solid fa-square text-yellow-300"></i> 50% a 69% livres</span>
            <span><i className="fa-solid fa-square text-green-500"></i> 70% ou mais livres</span>
            <span className="col-span-2"><i className="fa-solid fa-square text-gray-300"></i> <s>Riscado</s>: feriado ou fora do período letivo</span>
          </div>
        )}
        <div className="flex justify-between mt-3 pt-3 border-t border-gray-100">
          <button onClick={() => onEscolher(hoje)} className="text-xs font-bold text-[#F39200] hover:underline">Hoje</button>
          <button onClick={onFechar} className="text-xs text-gray-500 hover:underline">Fechar</button>
        </div>
      </div>
    </>
  );
}
