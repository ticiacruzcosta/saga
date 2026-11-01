// Autenticação: senha com scrypt e sessão guardada no banco (o cookie só leva um token aleatório).

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./prisma";

const scrypt = promisify(scryptCallback) as (senha: string, sal: Buffer, tamanho: number) => Promise<Buffer>;

const COOKIE_SESSAO = "saga_sessao";
const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000;

export type UsuarioLogado = { id: number; nome: string; email: string; admin: boolean };

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await scrypt(senha, sal, 64);
  return `${sal.toString("hex")}:${hash.toString("hex")}`;
}

export async function senhaConfere(senha: string, guardado: string): Promise<boolean> {
  const [sal, hash] = guardado.split(":");
  if (!sal || !hash) return false;
  const esperado = Buffer.from(hash, "hex");
  const calculado = await scrypt(senha, Buffer.from(sal, "hex"), esperado.length);
  return timingSafeEqual(calculado, esperado);
}

export async function iniciarSessao(usuarioId: number) {
  const token = randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  await prisma.sessao.create({ data: { token, usuarioId, expiraEm } });
  // secure fica desligado porque, na rede da faculdade, o acesso é por http://IP:3000
  (await cookies()).set(COOKIE_SESSAO, token, { httpOnly: true, sameSite: "lax", path: "/", expires: expiraEm });
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) await prisma.sessao.deleteMany({ where: { token } });
  jar.delete(COOKIE_SESSAO);
}

/** Usuário da sessão atual, ou null (sem cookie, sessão vencida ou usuário desativado). */
export async function usuarioAtual(): Promise<UsuarioLogado | null> {
  let token: string | undefined;
  try {
    token = (await cookies()).get(COOKIE_SESSAO)?.value;
  } catch {
    return null; // fora de uma requisição
  }
  if (!token) return null;
  const sessao = await prisma.sessao.findUnique({ where: { token }, include: { usuario: true } });
  if (!sessao || sessao.expiraEm < new Date() || !sessao.usuario.ativo) return null;
  const { id, nome, email, perfil } = sessao.usuario;
  return { id, nome, email, admin: perfil === "ADMIN" };
}

/** Para páginas e server actions: sem login, manda para a tela de login. */
export async function exigirUsuario(): Promise<UsuarioLogado> {
  const usuario = await usuarioAtual();
  if (!usuario) redirect("/login");
  return usuario;
}

/** Ações de administração (contas de usuário): só o perfil ADMIN. */
export async function exigirAdmin(): Promise<UsuarioLogado> {
  const usuario = await exigirUsuario();
  if (!usuario.admin) throw new Error("Apenas administradores podem gerenciar usuários.");
  return usuario;
}
