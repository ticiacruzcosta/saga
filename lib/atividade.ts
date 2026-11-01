// Registro de atividades (auditoria): quem fez o quê e quando. Consultável na tabela "atividades" do banco.

import { prisma } from "./prisma";
import type { UsuarioLogado } from "./auth";

export async function registrar(usuario: UsuarioLogado | null, acao: string, descricao: string) {
  await prisma.atividade.create({
    data: { usuarioId: usuario?.id ?? null, usuarioNome: usuario?.nome ?? "Sistema", acao, descricao },
  });
}
