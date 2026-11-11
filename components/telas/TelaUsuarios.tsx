"use client";

// Usuários (só administradores): aprovar, desativar, excluir, mudar perfil e redefinir senha.

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { definirAcesso, definirAdmin, excluirUsuario, redefinirSenha } from "@/app/auth";
import type { UsuarioLogado } from "@/lib/auth";
import type { UsuarioVM } from "@/lib/tipos";
import { avisar, confirmar, mostrarTexto } from "@/components/avisos";

export default function TelaUsuarios({ usuarios, eu }: { usuarios: UsuarioVM[]; eu: UsuarioLogado }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

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

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#1A2332]">Gestão de Usuários</h3>
          <p className="text-xs text-gray-500">Contas criadas na tela de login ficam aguardando aprovação até um administrador liberar aqui.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-extrabold">
          <span className="px-3 py-1 rounded-full bg-gray-100 text-[#1A2332] tabular-nums">
            {usuarios.length} conta(s)
          </span>
          {pendentesAprovacao > 0 && (
            <span className="px-3 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 tabular-nums">
              <i className="fa-solid fa-user-clock mr-1"></i>
              {pendentesAprovacao} aguardando aprovação
            </span>
          )}
        </div>
      </div>
      <div className="p-5 cartao">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {usuarios.map((u) => {
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
                className={`relative overflow-hidden rounded-2xl border p-4 flex flex-col justify-between gap-3 transition ${
                  !u.ativo ? "border-red-200 bg-red-50/30" : "border-gray-200/90 bg-white shadow-2xs"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-0 top-0 h-1 ${
                    !u.ativo ? "bg-red-500" : u.admin ? "bg-gradient-to-r from-[#F39200] to-[#C2410C]" : "bg-[#1A2332]"
                  }`}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-[#1A2332] text-[#F39200] font-black text-xs flex items-center justify-center shrink-0">
                      {ini}
                    </div>
                    <div className="min-w-0">
                      <p className="font-extrabold text-sm text-[#1A2332] truncate">
                        {u.nome} {souEu && <span className="text-xs font-normal text-gray-400">(você)</span>}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Desde {u.desde}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {u.ativo ? (
                      <span className="bg-emerald-50 text-emerald-700 text-[11px] px-2.5 py-0.5 rounded-full font-extrabold">
                        Ativo
                      </span>
                    ) : (
                      <span className="bg-red-100 text-red-700 text-[11px] px-2.5 py-0.5 rounded-full font-extrabold">
                        <i className="fa-solid fa-clock mr-1"></i>Pendente
                      </span>
                    )}
                    {u.admin && (
                      <span className="bg-[#1A2332] text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                        Administrador
                      </span>
                    )}
                  </div>
                </div>

                {!souEu && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5 pt-2 border-t border-gray-100">
                    {u.ativo ? (
                      <button onClick={() => mudarAcesso(u.id, false, u.nome)} disabled={pendente} className="btn btn-secundario btn-sm">
                        Desativar
                      </button>
                    ) : (
                      <button onClick={() => mudarAcesso(u.id, true, u.nome)} disabled={pendente} className="btn btn-principal btn-sm">
                        <i className="fa-solid fa-check"></i> Aprovar
                      </button>
                    )}
                    {u.ativo && (
                      <button onClick={() => mudarPerfil(u.id, !u.admin, u.nome)} disabled={pendente} className="btn btn-secundario btn-sm">
                        {u.admin ? "Remover admin" : "Tornar admin"}
                      </button>
                    )}
                    {u.ativo && (
                      <button onClick={() => novaSenha(u.id, u.nome)} disabled={pendente} title="Gerar senha provisória" className="btn btn-secundario btn-sm">
                        <i className="fa-solid fa-key mr-1"></i>Senha
                      </button>
                    )}
                    <button onClick={() => removerUsuario(u.id, u.nome)} disabled={pendente} title="Excluir conta" className="btn btn-icone !w-8 !h-8 hover:text-red-600">
                      <i className="fa-solid fa-trash text-xs"></i>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
