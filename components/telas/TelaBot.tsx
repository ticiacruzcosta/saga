import Link from "next/link";
export default function TelaBot({ avisosPendentes }: { avisosPendentes: number }) {
  return <section className="space-y-6">
    <div className="mx-auto max-w-xl space-y-4 rounded-xl border bg-white p-6 text-center">
      <div className="text-4xl">✈️</div>
      <h3 className="text-lg font-bold text-[#1A2332]">Integração de mensagens — SAGA</h3>
      <p className="text-sm text-gray-600">Aproveite os avisos, horários e turmas já cadastrados no sistema. {avisosPendentes > 0 && <strong>{avisosPendentes} aviso(s) pendente(s).</strong>}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/bot-telegram" className="btn inline-flex items-center gap-2 bg-sky-600 text-white">Abrir bot Telegram</Link>
        <Link href="/bot-whatsapp" className="btn inline-flex items-center gap-2 bg-gray-600 text-white">WhatsApp (legado)</Link>
      </div>
      <p className="text-xs text-gray-500">O painel exige uma conta ADMIN. O canal WhatsApp permanece separado e deve ficar em SIMULAÇÃO.</p>
    </div>
  </section>;
}
