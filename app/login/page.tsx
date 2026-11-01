import { redirect } from "next/navigation";
import TelaLogin from "@/components/TelaLogin";
import { usuarioAtual } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function Login() {
  if (await usuarioAtual()) redirect("/");
  const primeiroAcesso = (await prisma.usuario.count()) === 0;
  return <TelaLogin primeiroAcesso={primeiroAcesso} />;
}
