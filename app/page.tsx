import SagaApp from "@/components/SagaApp";
import { exigirUsuario } from "@/lib/auth";
import { carregarDados } from "@/lib/vm";

// Sempre busca os dados na hora (nada de página pronta guardada).
export const dynamic = "force-dynamic";

export default async function Page() {
  const usuario = await exigirUsuario();
  const dados = await carregarDados(usuario.admin);
  return <SagaApp dados={dados} usuario={usuario} />;
}
