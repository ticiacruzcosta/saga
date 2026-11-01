// Histórico de Avisos: mensagens geradas e seu status.

import type { AvisoVM } from "@/lib/tipos";

export default function TelaHistorico({ avisos }: { avisos: AvisoVM[] }) {
  return (
    <section className="space-y-6">
      <div className="overflow-hidden cartao">
        <div className="p-4 border-b border-gray-200 font-bold text-[#1A2332]">Histórico de Disparos WhatsApp</div>
        <table className="w-full text-left border-collapse text-sm">
          <thead className="tabela-cab">
            <tr>
              <th className="p-3">Data/Hora</th>
              <th className="p-3">Turma</th>
              <th className="p-3">Mensagem</th>
              <th className="p-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {avisos.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nenhum aviso ainda.</td></tr>}
            {avisos.map((a) => (
              <tr key={a.id}>
                <td className="p-3 text-xs text-gray-500">{a.quando}</td>
                <td className="p-3 font-semibold">{a.turma}</td>
                <td className="p-3">{a.mensagem}</td>
                <td className="p-3 text-center">
                  <span className={`${a.status === "Falhou" ? "bg-red-100 text-red-700" : a.status === "Pendente" ? "bg-red-50 text-red-600" : "bg-green-100 text-green-700"} text-xs px-2.5 py-0.5 rounded-full font-bold`}>{a.status === "Pendente" && <i className="fa-solid fa-circle-exclamation mr-1"></i>}{a.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
