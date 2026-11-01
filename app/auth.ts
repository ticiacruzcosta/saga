"use server";

// Entrar, criar conta (primeiro acesso ou pedido de acesso), sair e administrar usuários.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { encerrarSessao, exigirAdmin, gerarHashSenha, iniciarSessao, senhaConfere } from "@/lib/auth";

const SENHA_MINIMA = 8;

type DadosConta = { nome: string; email: string; senha: string };

/** Valida e normaliza os dados de uma conta nova. Devolve a mensagem de erro, se houver. */
async function validarConta(input: DadosConta): Promise<{ erro: string } | { nome: string; email: string; senhaHash: string }> {
  const nome = input.nome.trim();
  const email = input.email.trim().toLowerCase();
  if (!nome) return { erro: "Informe seu nome." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "Informe um e-mail válido." };
  if (input.senha.length < SENHA_MINIMA) return { erro: `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` };
  if (await prisma.usuario.findUnique({ where: { email } })) return { erro: "Já existe uma conta com este e-mail." };
  return { nome, email, senhaHash: await gerarHashSenha(input.senha) };
}

export async function entrar(input: { email: string; senha: string }): Promise<{ erro: string }> {
  const email = input.email.trim().toLowerCase();
  const usuario = email ? await prisma.usuario.findUnique({ where: { email } }) : null;
  // Mesma mensagem para e-mail ou senha errados: não revela quais e-mails existem
  if (!usuario || !(await senhaConfere(input.senha, usuario.senhaHash))) return { erro: "E-mail ou senha incorretos." };
  if (!usuario.ativo) return { erro: "Sua conta ainda não foi aprovada. Peça a alguém da coordenação para liberar o acesso." };
  await iniciarSessao(usuario.id);
  redirect("/");
}

/** Só funciona enquanto não existe nenhum usuário: cria a primeira conta, ativa e administradora. */
export async function criarPrimeiroAcesso(input: DadosConta): Promise<{ erro: string }> {
  if ((await prisma.usuario.count()) > 0) return { erro: "O primeiro acesso já foi criado. Entre com seu e-mail e senha." };
  const conta = await validarConta(input);
  if ("erro" in conta) return conta;
  const usuario = await prisma.usuario.create({ data: { ...conta, perfil: "ADMIN" } });
  await iniciarSessao(usuario.id);
  redirect("/");
}

/** "Criar nova conta" na tela de login: a conta nasce inativa, como usuário comum, até um administrador aprovar. */
export async function solicitarAcesso(input: DadosConta): Promise<{ erro?: string; ok?: boolean }> {
  const conta = await validarConta(input);
  if ("erro" in conta) return conta;
  await prisma.usuario.create({ data: { ...conta, ativo: false } });
  return { ok: true };
}

export async function sair() {
  await encerrarSessao();
  redirect("/login");
}

// ---------------------------------------------------------------- tela "Usuários" (só administradores)

/** Aprova/ativa ou desativa uma conta. Ninguém pode desativar a própria conta. */
export async function definirAcesso(id: number, ativo: boolean): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirAdmin();
  if (id === eu.id) return { ok: false, erro: "Você não pode desativar a sua própria conta." };
  await prisma.$transaction([
    prisma.usuario.update({ where: { id }, data: { ativo } }),
    // desativar derruba as sessões abertas da pessoa
    ...(ativo ? [] : [prisma.sessao.deleteMany({ where: { usuarioId: id } })]),
  ]);
  revalidatePath("/");
  return { ok: true };
}

/** Torna administrador ou volta a usuário comum. Ninguém muda o próprio perfil (sempre sobra um admin). */
export async function definirAdmin(id: number, admin: boolean): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirAdmin();
  if (id === eu.id) return { ok: false, erro: "Você não pode mudar o seu próprio perfil." };
  await prisma.usuario.update({ where: { id }, data: { perfil: admin ? "ADMIN" : "USUARIO" } });
  revalidatePath("/");
  return { ok: true };
}

export async function excluirUsuario(id: number): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirAdmin();
  if (id === eu.id) return { ok: false, erro: "Você não pode excluir a sua própria conta." };
  await prisma.usuario.delete({ where: { id } }); // as sessões caem em cascata
  revalidatePath("/");
  return { ok: true };
}
