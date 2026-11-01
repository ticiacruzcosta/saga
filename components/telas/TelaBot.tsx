// Status do Bot: o envio automático ainda não existe; os avisos ficam pendentes.

export default function TelaBot({ avisosPendentes }: { avisosPendentes: number }) {
  return (
    <section className="space-y-6">
      <div className="p-6 max-w-md mx-auto text-center space-y-4 cartao">
        <div className="w-16 h-16 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto text-3xl"><i className="fa-brands fa-whatsapp"></i></div>
        <h3 className="text-lg font-bold text-[#1A2332]">Status do Bot WhatsApp</h3>
        <p className="text-xs text-gray-600 font-bold bg-gray-100 py-1.5 rounded-[14px]">● NÃO CONECTADO</p>
        <p className="text-sm text-gray-600">
          O envio automático ainda não foi implementado. Os avisos gerados ficam como <b>Pendente</b> no Histórico de Avisos
          {avisosPendentes > 0 && <> ({avisosPendentes} na fila)</>}.
        </p>
      </div>
    </section>
  );
}
