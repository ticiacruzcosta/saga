"use client";

// Usuários (só administradores): aprovar, desativar, excluir, mudar perfil e redefinir senha.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirAcesso, definirAdmin, excluirUsuario, redefinirSenha } from "@/app/auth";
import type { UsuarioLogado } from "@/lib/auth";
import type { UsuarioVM } from "@/lib/tipos";
import { avisar, confirmar, mostrarTexto } from "@/components/avisos";

export default function TelaUsuarios({ usuarios, eu }: { usuarios: UsuarioVM[]; eu: UsuarioLogado }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"TODOS" | "ATIVOS" | "PENDENTES" | "ADMINS">("TODOS");

  async function mudarAcesso(id: number, ativo: boolean, nome: string) {
    if (!ativo && !(await confirmar("A pessoa sai do sistema na hora e não consegue mais entrar.", { titulo: `Desativar ${nome}?`, botao: "Desativar", perigo: true }))) return;
    iniciar(async () => {
      const r = await definirAcesso(id, ativo);
      if (!r.ok) return avisar(r.erro, "erro");
      router.refresh();
    });
  }
  async function mudarPerfil(id: number, admin: boolean, nome: string) {
    if (!(await confirmar(admin ? "Poderá aprovar, desativar e excluir contas." : "Volta a ser usuário comum.", { titulo: admin ? `Tornar ${nome} administrador?` : `Tirar ${nome} da administração?`, botao: "Confirmar" }))) return;
    iniciar(async () => {
      const r = await definirAdmin(id, admin);
      if (!r.ok) return avisar(r.erro, "erro");
      router.refresh();
    });
  }
  async function removerUsuario(id: number, nome: string) {
    if (!(await confirmar("Não dá para desfazer.", { titulo: `Excluir a conta de ${nome}?`, botao: "Excluir", perigo: true }))) return;
    iniciar(async () => {
      const r = await excluirUsuario(id);
      if (!r.ok) return avisar(r.erro, "erro");
      router.refresh();
    });
  }
  async function novaSenha(id: number, nome: string) {
    if (!(await confirmar("A senha atual deixa de funcionar e a pessoa sai do sistema.", { titulo: `Gerar senha provisória para ${nome}?`, botao: "Gerar senha" }))) return;
    iniciar(async () => {
      const r = await redefinirSenha(id);
      if (!r.ok) return avisar(r.erro, "erro");
      await mostrarTexto(`Senha provisória de ${nome}`, "Copie e repasse para a pessoa. Ela não aparece de novo.", r.senha!);
    });
  }

  const pendentesAprovacao = usuarios.filter((u) => !u.ativo).length;
  const ativos = usuarios.length - pendentesAprovacao;
  const admins = usuarios.filter((u) => u.admin).length;

  const termo = busca.trim().toLowerCase();
  const usuariosFiltrados = usuarios.filter((u) => {
    if (filtro === "ATIVOS" && !u.ativo) return false;
    if (filtro === "PENDENTES" && u.ativo) return false;
    if (filtro === "ADMINS" && !u.admin) return false;
    if (termo && !`${u.nome} ${u.email}`.toLowerCase().includes(termo)) return false;
    return true;
  });

  return (
    <section className="space-y-5">
      {/* BANNER PRINCIPAL DE GESTÃO DE USUÁRIOS (padrão institucional SAGA) */}
      <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
        <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
        <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
        <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

        <div className="relative space-y-2.5 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
              <i className="fa-solid fa-user-shield text-[#FDBA74]"></i> Controle de Acesso
            </span>
          </div>

          <div>
            <h3 className="text-xl md:text-2xl font-black tracking-tight">
              Gestão de Usuários
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
              <i className="fa-solid fa-users text-[#FDBA74]"></i> {usuarios.length} conta(s)
            </span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
              <i className="fa-solid fa-circle-check text-emerald-300"></i> {ativos} ativa(s)
            </span>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
              <i className="fa-solid fa-crown text-[#FDBA74]"></i> {admins} admin(s)
            </span>
            {pendentesAprovacao > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-500/85 text-white text-xs font-extrabold tabular-nums">
                <i className="fa-solid fa-user-clock"></i> {pendentesAprovacao} aguardando aprovação
              </span>
            )}
          </div>
        </div>
      </div>

      {/* BARRA DE BUSCA E FILTROS DE CONTAS */}
      <div className="p-5 space-y-3.5 cartao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
              <i className="fa-solid fa-sliders"></i>
            </span>
            <h3 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
              Filtrar Contas Cadastradas
            </h3>
          </div>
          {(filtro !== "TODOS" || busca.trim() !== "") && (
            <button
              type="button"
              onClick={() => {
                setFiltro("TODOS");
                setBusca("");
              }}
              className="text-xs font-extrabold text-[#B45309] hover:underline flex items-center gap-1"
            >
              <i className="fa-solid fa-rotate-left text-[10px]"></i> Limpar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              <i className="fa-solid fa-magnifying-glass text-[#B45309] mr-1"></i> Buscar por Nome ou E-mail
            </label>
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              data-busca
              placeholder="Ex: Administrador, @unisapiens.edu.br...  ( / )"
              className="campo campo-sm w-full"
            />
          </div>
          <div className="md:col-span-6">
            <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
              <i className="fa-solid fa-filter text-[#B45309] mr-1"></i> Perfil / Situação
            </label>
            <div className="grid grid-cols-4 gap-1.5 bg-[#F1F3F6] p-1 rounded-[14px]">
              {([
                ["TODOS", `Todos (${usuarios.length})`],
                ["ATIVOS", `Ativos (${ativos})`],
                ["PENDENTES", `Pend. (${pendentesAprovacao})`],
                ["ADMINS", `Admins (${admins})`],
              ] as const).map(([val, rotulo]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setFiltro(val)}
                  className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition text-center truncate ${
                    filtro === val
                      ? "bg-[#1A2332] text-white shadow-xs"
                      : "text-gray-600 hover:text-[#1A2332]"
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* LISTA DE CONTAS */}
      <div className="cartao overflow-hidden">
        {usuariosFiltrados.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            Nenhuma conta encontrada com esses filtros.
          </div>
        ) : (
          <div className="divide-y divide-gray-200/80">
            {usuariosFiltrados.map((u) => {
              const souEu = u.id === eu.id;
              const ini = u.nome
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? "")
                .join("");
              return (
                <div
                  key={u.id}
                  className={`p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition ${
                    !u.ativo ? "bg-red-50/40" : "hover:bg-gray-50/70"
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl font-black text-xs flex items-center justify-center shrink-0 shadow-xs ${
                        !u.ativo
                          ? "bg-red-100 text-red-700"
                          : u.admin
                            ? "bg-[#1A2332] text-[#F39200]"
                            : "bg-[#FFF4E5] text-[#B45309]"
                      }`}
                    >
                      {ini}
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-extrabold text-sm text-[#1A2332] truncate">
                          {u.nome}
                        </span>
                        {souEu && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-[#B45309] border border-orange-200/70">
                            Sua conta
                          </span>
                        )}
                        {u.ativo ? (
                          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[11px] px-2.5 py-0.5 rounded-full font-extrabold">
                            <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            Ativo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-red-100 text-red-700 text-[11px] px-2.5 py-0.5 rounded-full font-extrabold">
                            <i className="fa-solid fa-clock text-[10px]"></i> Aguardando aprovação
                          </span>
                        )}
                        <span
                          className={`text-[11px] px-2.5 py-0.5 rounded-full font-extrabold ${
                            u.admin
                              ? "bg-[#1A2332] text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {u.admin ? "Administrador" : "Usuário"}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1.5 truncate">
                          <i className="fa-regular fa-envelope text-[#B45309] text-[11px]"></i>
                          {u.email}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-gray-400 tabular-nums">
                          <i className="fa-regular fa-calendar text-[11px]"></i>
                          Desde {u.desde}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                    {souEu ? (
                      <span className="text-xs font-bold text-gray-400 px-3 py-1.5 rounded-full bg-[#F1F3F6]">
                        <i className="fa-solid fa-shield-halved text-[#B45309] mr-1.5"></i>
                        Sessão ativa
                      </span>
                    ) : (
                      <>
                        {u.ativo ? (
                          <button
                            onClick={() => mudarAcesso(u.id, false, u.nome)}
                            disabled={pendente}
                            className="btn btn-secundario btn-sm"
                          >
                            <i className="fa-solid fa-user-slash text-xs"></i> Desativar
                          </button>
                        ) : (
                          <button
                            onClick={() => mudarAcesso(u.id, true, u.nome)}
                            disabled={pendente}
                            className="btn btn-principal btn-sm"
                          >
                            <i className="fa-solid fa-check"></i> Aprovar Acesso
                          </button>
                        )}
                        {u.ativo && (
                          <button
                            onClick={() => mudarPerfil(u.id, !u.admin, u.nome)}
                            disabled={pendente}
                            className="btn btn-secundario btn-sm"
                          >
                            <i className={`fa-solid ${u.admin ? "fa-user" : "fa-crown"} text-xs`}></i>
                            {u.admin ? "Remover admin" : "Tornar admin"}
                          </button>
                        )}
                        {u.ativo && (
                          <button
                            onClick={() => novaSenha(u.id, u.nome)}
                            disabled={pendente}
                            title="Gerar senha provisória"
                            className="btn btn-secundario btn-sm"
                          >
                            <i className="fa-solid fa-key text-xs"></i> Nova Senha
                          </button>
                        )}
                        <button
                          onClick={() => removerUsuario(u.id, u.nome)}
                          disabled={pendente}
                          title="Excluir conta"
                          aria-label="Excluir conta"
                          className="btn btn-icone text-red-600 hover:bg-red-50"
                        >
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
