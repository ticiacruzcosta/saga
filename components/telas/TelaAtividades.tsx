"use client";

// Atividades (só administradores): quem fez o quê, desfazer ações recentes e baixar backup do banco.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desfazerAtividade } from "@/app/atividades";
import type { AtividadeVM } from "@/lib/tipos";

export default function TelaAtividades({ atividades }: { atividades: AtividadeVM[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [busca, setBusca] = useState("");

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return atividades.filter((a) => !termo || `${a.usuario} ${a.acao} ${a.descricao}`.toLowerCase().includes(termo));
  }, [atividades, busca]);

  function desfazer(a: AtividadeVM) {
    if (!confirm(`Desfazer "${a.acao}: ${a.descricao}"?`)) return;
    iniciar(async () => {
      const r = await desfazerAtividade(a.id);
      if (!r.ok) return alert(r.erro);
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-wrap gap-3 items-center justify-between">
        <input
          value={busca} onChange={(e) => setBusca(e.target.value)} data-busca
          placeholder="Filtrar por pessoa, ação ou descrição..."
          className="flex-1 min-w-[14rem] max-w-md border border-gray-200 rounded-lg px-3 py-2 text-sm"
        />
        <a href="/api/backup" className="bg-[#1A2332] text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
          <i className="fa-solid fa-database"></i> Baixar backup do banco
        </a>
      </div>
      <p className="text-xs text-gray-500">
        Exclusões, edições de aula e realocações podem ser desfeitas em até 24 horas. Importações e gerações de semestre não:
        para essas, baixe um backup antes.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[640px]">
          <thead className="bg-gray-100 text-xs uppercase text-gray-600">
            <tr>
              <th className="p-3">Quando</th>
              <th className="p-3">Quem</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Descrição</th>
              <th className="p-3 text-center"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {lista.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-gray-400">Nenhuma atividade registrada.</td></tr>}
            {lista.map((a) => (
              <tr key={a.id} className={a.desfeita ? "text-gray-400" : ""}>
                <td className="p-3 text-xs whitespace-nowrap">{a.quando}</td>
                <td className="p-3 text-xs">{a.usuario}</td>
                <td className="p-3"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded font-semibold">{a.acao}</span></td>
                <td className="p-3 text-xs">{a.descricao}{a.desfeita && <span className="ml-2 italic">(desfeita)</span>}</td>
                <td className="p-3 text-center">
                  {a.podeDesfazer && (
                    <button onClick={() => desfazer(a)} disabled={pendente} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-600 hover:border-[#F39200] whitespace-nowrap">
                      <i className="fa-solid fa-rotate-left mr-1"></i>Desfazer
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
