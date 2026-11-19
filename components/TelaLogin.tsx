"use client";

// Tela de login: card branco sobre degradê, formas arredondadas à esquerda e formulário à direita.
// Modos: entrar, criar nova conta (fica aguardando aprovação) e primeiro acesso (sem nenhum usuário ainda).

import { useState, useTransition } from "react";
import { criarPrimeiroAcesso, entrar, solicitarAcesso } from "@/app/auth";

const DEGRADE = "bg-gradient-to-br from-[#6366F1] to-[#0F172A]";

function Campo({ icone, ...props }: { icone: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-center gap-3 bg-[#F1F5F9] rounded-[14px] px-4 py-2.5 border-2 border-transparent focus-within:bg-white focus-within:border-[#6366F1] focus-within:ring-4 focus-within:ring-[#6366F1]/18 transition">
      <i className={`fa-solid ${icone} text-[#4F46E5] w-4 text-center`}></i>
      <input {...props} required className="bg-transparent outline-none text-sm w-full text-[#0F172A] placeholder:text-gray-400" />
    </label>
  );
}

export default function TelaLogin({ primeiroAcesso }: { primeiroAcesso: boolean }) {
  const [modo, setModo] = useState<"entrar" | "criar">(primeiroAcesso ? "criar" : "entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ajuda, setAjuda] = useState(false);
  const [pendente, iniciar] = useTransition();
  const criando = modo === "criar";

  function trocarModo(novo: "entrar" | "criar") {
    setModo(novo);
    setErro("");
    setAviso("");
    setSenha("");
    setConfirmacao("");
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    if (criando && senha !== confirmacao) return setErro("As senhas não conferem.");
    iniciar(async () => {
      if (!criando) {
        const r = await entrar({ email, senha });
        if (r?.erro) setErro(r.erro);
        return;
      }
      if (primeiroAcesso) {
        const r = await criarPrimeiroAcesso({ nome, email, senha });
        if (r?.erro) setErro(r.erro);
        return;
      }
      const r = await solicitarAcesso({ nome, email, senha });
      if (r.erro) return setErro(r.erro);
      trocarModo("entrar");
      setAviso("Conta criada! Ela fica aguardando aprovação de alguém da coordenação. Depois disso é só entrar.");
    });
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(110deg,#0F172A_0%,#0F172A_45%,#312E81_78%,#6366F1_100%)] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden grid md:grid-cols-2">
        {/* lado decorativo: pílulas na diagonal no mesmo tema SaaS Indigo do sistema */}
        <div className="relative hidden md:block min-h-[420px] overflow-hidden bg-[#0F172A]">
          <div className={`absolute -left-24 -top-20 w-72 h-[30rem] rounded-full rotate-[-35deg] ${DEGRADE}`} />
          <div className="absolute -left-10 -top-24 w-72 h-[30rem] rounded-full rotate-[-35deg] border-[14px] border-indigo-200/35" />
          <div className={`absolute left-40 -top-16 w-28 h-44 rounded-full rotate-[-35deg] ${DEGRADE} opacity-90`} />
          <div className={`absolute -left-10 bottom-0 w-20 h-36 rounded-full rotate-[-35deg] ${DEGRADE} opacity-90`} />
          <div className="absolute left-36 -bottom-20 w-40 h-56 rounded-full rotate-[-35deg] bg-gradient-to-br from-[#A5B4FC] to-[#6366F1]" />
          <div className="absolute left-8 top-1/2 -translate-y-1/2 text-white drop-shadow">
            <div className="bg-white text-[#4F46E5] w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-md">US</div>
            <p className="mt-3 text-xs font-bold tracking-widest text-[#A5B4FC]">CENTRO UNIVERSITÁRIO</p>
            <p className="text-2xl font-black tracking-wide leading-none">UNISAPIENS</p>
            <p className="mt-1 text-[11px] font-mono tracking-widest opacity-90">SAGA</p>
          </div>
        </div>

        <form onSubmit={enviar} className="p-8 sm:p-10 flex flex-col justify-center gap-4">
          <div className="md:hidden flex items-center gap-2 mb-2">
            <div className="bg-[#6366F1] text-white w-9 h-9 rounded-lg flex items-center justify-center font-black">US</div>
            <span className="font-black text-[#0F172A]">UNISAPIENS · SAGA</span>
          </div>
          <div className="text-center mb-2">
            <h1 className="text-2xl font-bold text-[#0F172A]">{primeiroAcesso ? "Primeiro Acesso" : criando ? "Criar Conta" : "Login"}</h1>
            <p className="text-xs text-gray-500 mt-1">
              {primeiroAcesso
                ? "Crie a conta da coordenação para começar."
                : criando
                  ? "Sua conta será liberada depois da aprovação da coordenação."
                  : "Sistema de Avisos e Gestão Acadêmica"}
            </p>
          </div>

          {criando && <Campo icone="fa-user" placeholder="Nome completo" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />}
          <Campo icone="fa-envelope" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus />
          <Campo
            icone="fa-lock" type="password" placeholder={criando ? "Senha (mínimo 8 caracteres)" : "Senha"}
            value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={criando ? "new-password" : "current-password"}
          />
          {criando && (
            <Campo icone="fa-lock" type="password" placeholder="Confirmar senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" />
          )}

          {aviso && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5 text-center">{aviso}</p>}
          {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 text-center">{erro}</p>}

          <button
            type="submit" disabled={pendente}
            className="mt-1 rounded-full py-2.5 text-sm font-extrabold text-white uppercase tracking-wider bg-gradient-to-r from-[#6366F1] to-[#4338CA] shadow-[0_6px_16px_rgb(99_102_241/0.28)] hover:brightness-110 transition disabled:opacity-60"
          >
            {pendente ? "Aguarde..." : criando ? "Criar conta" : "Entrar"}
          </button>

          {!criando && (
            <div className="text-center">
              <button type="button" onClick={() => setAjuda((v) => !v)} className="text-xs text-gray-500 hover:text-[#6366F1]">
                Esqueceu a senha?
              </button>
              {ajuda && <p className="text-xs text-gray-500 mt-1">Procure a coordenação do curso para redefinir seu acesso.</p>}
            </div>
          )}

          {!primeiroAcesso && (
            <button
              type="button" onClick={() => trocarModo(criando ? "entrar" : "criar")}
              className="mt-4 text-xs text-gray-500 hover:text-[#6366F1] self-center flex items-center gap-2 font-semibold"
            >
              {criando ? <><i className="fa-solid fa-arrow-left"></i> Já tenho conta</> : <>Criar nova conta <i className="fa-solid fa-arrow-right"></i></>}
            </button>
          )}
        </form>
      </div>
    </main>
  );
}
