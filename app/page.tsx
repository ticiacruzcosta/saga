import SagaApp from "@/components/SagaApp";
import { carregarDados } from "@/lib/vm";

// Sempre busca os dados na hora (nada de página pronta guardada).
export const dynamic = "force-dynamic";

export default async function Page() {
  const dados = await carregarDados();
  return <SagaApp dados={dados} />;
}
