"use server";

// Entrar, criar conta (primeiro acesso ou pedido de acesso), sair e administrar usuários.

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { encerrarSessao, exigirAdmin, exigirUsuario, gerarHashSenha, iniciarSessao, senhaConfere } from "@/lib/auth";
import { registrar } from "@/lib/atividade";

const SENHA_MINIMA = 8;
const TENTATIVAS_ATE_BLOQUEIO = 5;
const BLOQUEIO_MS = 5 * 60 * 1000;

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
  if (!usuario) return { erro: "E-mail ou senha incorretos." };
  if (usuario.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    const minutos = Math.ceil((usuario.bloqueadoAte.getTime() - Date.now()) / 60000);
    return { erro: `Muitas tentativas com senha errada. Tente de novo em ${minutos} minuto(s).` };
  }
  if (!(await senhaConfere(input.senha, usuario.senhaHash))) {
    // Depois de várias senhas erradas seguidas, a conta fica bloqueada por alguns minutos
    const tentativas = usuario.tentativasFalhas + 1;
    const bloquear = tentativas >= TENTATIVAS_ATE_BLOQUEIO;
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: bloquear ? { tentativasFalhas: 0, bloqueadoAte: new Date(Date.now() + BLOQUEIO_MS) } : { tentativasFalhas: tentativas },
    });
    if (bloquear) await registrar(null, "Bloqueio de login", `${usuario.email}: ${TENTATIVAS_ATE_BLOQUEIO} senhas erradas seguidas`);
    return { erro: "E-mail ou senha incorretos." };
  }
  if (!usuario.ativo) return { erro: "Sua conta ainda não foi aprovada. Peça a alguém da coordenação para liberar o acesso." };
  await prisma.usuario.update({ where: { id: usuario.id }, data: { tentativasFalhas: 0, bloqueadoAte: null } });
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
  await registrar(null, "Pedido de acesso", `${conta.nome} (${conta.email}) criou uma conta`);
  return { ok: true };
}

/** Troca a própria senha. As outras sessões da pessoa (outros navegadores) são encerradas. */
export async function alterarMinhaSenha(input: { atual: string; nova: string }): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirUsuario();
  const usuario = (await prisma.usuario.findUnique({ where: { id: eu.id } }))!;
  if (!(await senhaConfere(input.atual, usuario.senhaHash))) return { ok: false, erro: "A senha atual está incorreta." };
  if (input.nova.length < SENHA_MINIMA) return { ok: false, erro: `A nova senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.` };
  await prisma.usuario.update({ where: { id: eu.id }, data: { senhaHash: await gerarHashSenha(input.nova) } });
  await registrar(eu, "Senha", "Alterou a própria senha");
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
  const [alvo] = await prisma.$transaction([
    prisma.usuario.update({ where: { id }, data: { ativo } }),
    // desativar derruba as sessões abertas da pessoa
    ...(ativo ? [] : [prisma.sessao.deleteMany({ where: { usuarioId: id } })]),
  ]);
  await registrar(eu, "Usuários", `${ativo ? "Aprovou/ativou" : "Desativou"} ${alvo.nome} (${alvo.email})`);
  revalidatePath("/");
  return { ok: true };
}

/** Torna administrador ou volta a usuário comum. Ninguém muda o próprio perfil (sempre sobra um admin). */
export async function definirAdmin(id: number, admin: boolean): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirAdmin();
  if (id === eu.id) return { ok: false, erro: "Você não pode mudar o seu próprio perfil." };
  const alvo = await prisma.usuario.update({ where: { id }, data: { perfil: admin ? "ADMIN" : "USUARIO" } });
  await registrar(eu, "Usuários", `${admin ? "Tornou administrador" : "Tirou da administração"}: ${alvo.nome}`);
  revalidatePath("/");
  return { ok: true };
}

export async function excluirUsuario(id: number): Promise<{ ok: boolean; erro?: string }> {
  const eu = await exigirAdmin();
  if (id === eu.id) return { ok: false, erro: "Você não pode excluir a sua própria conta." };
  const alvo = await prisma.usuario.delete({ where: { id } }); // as sessões caem em cascata
  await registrar(eu, "Usuários", `Excluiu a conta de ${alvo.nome} (${alvo.email})`);
  revalidatePath("/");
  return { ok: true };
}

/** Gera uma senha provisória para outra pessoa (o administrador repassa). Encerra as sessões dela. */
export async function redefinirSenha(id: number): Promise<{ ok: boolean; erro?: string; senha?: string }> {
  const eu = await exigirAdmin();
  if (id === eu.id) return { ok: false, erro: "Para a sua própria conta, use \"Trocar senha\" no rodapé do menu." };
  // legível ao ditar: sem 0/O nem 1/l
  const alfabeto = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bloco = () => Array.from({ length: 4 }, () => alfabeto[randomInt(alfabeto.length)]).join("");
  const senha = `${bloco()}-${bloco()}-${bloco()}`;
  const [alvo] = await prisma.$transaction([
    prisma.usuario.update({ where: { id }, data: { senhaHash: await gerarHashSenha(senha), tentativasFalhas: 0, bloqueadoAte: null } }),
    prisma.sessao.deleteMany({ where: { usuarioId: id } }),
  ]);
  await registrar(eu, "Usuários", `Redefiniu a senha de ${alvo.nome}`);
  return { ok: true, senha };
}
