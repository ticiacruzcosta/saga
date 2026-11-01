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
    if (!(await confirmar(admin ? "Poderá aprovar, desativar e excluir contas, e ver Atividades e Backup." : "Volta a ser usuário comum.", { titulo: admin ? `Tornar ${nome} administrador?` : `Tirar ${nome} da administração?`, botao: "Confirmar" }))) return;
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

  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-bold text-[#1A2332]">Usuários</h3>
        <p className="text-xs text-gray-500">Contas criadas na tela de login ficam aguardando aprovação até um administrador liberar aqui.</p>
      </div>
      <div className="p-4 cartao">
        <ul className="divide-y divide-gray-200 text-sm">
          {usuarios.map((u) => {
            const souEu = u.id === eu.id;
            return (
              <li key={u.id} className="py-3 flex flex-wrap justify-between items-center gap-3">
                <div>
                  <p className="font-bold text-gray-900">
                    {u.nome} {souEu && <span className="text-xs font-normal text-gray-400">(você)</span>}
                    {u.admin && <span className="ml-2 bg-[#1A2332] text-white text-[10px] px-2 py-0.5 rounded-full font-bold align-middle">Administrador</span>}
                  </p>
                  <p className="text-xs text-gray-500">{u.email} · desde {u.desde}</p>
                </div>
                <div className="flex items-center gap-2">
                  {u.ativo ? (
                    <span className="bg-green-100 text-green-700 text-xs px-2.5 py-0.5 rounded-full font-bold">Ativo</span>
                  ) : (
                    <span className="bg-red-50 text-red-600 text-xs px-2.5 py-0.5 rounded-full font-bold">
                      <i className="fa-solid fa-circle-exclamation mr-1"></i>Aguardando aprovação
                    </span>
                  )}
                  {!souEu && (u.ativo ? (
                    <button onClick={() => mudarAcesso(u.id, false, u.nome)} disabled={pendente} className="btn btn-secundario btn-sm">Desativar</button>
                  ) : (
                    <button onClick={() => mudarAcesso(u.id, true, u.nome)} disabled={pendente} className="btn btn-principal btn-sm">Aprovar</button>
                  ))}
                  {!souEu && u.ativo && (
                    <button onClick={() => mudarPerfil(u.id, !u.admin, u.nome)} disabled={pendente} className="btn btn-secundario btn-sm">
                      {u.admin ? "Remover admin" : "Tornar admin"}
                    </button>
                  )}
                  {!souEu && u.ativo && (
                    <button onClick={() => novaSenha(u.id, u.nome)} disabled={pendente} title="Gerar senha provisória" className="btn btn-secundario btn-sm">
                      <i className="fa-solid fa-key mr-1"></i>Redefinir senha
                    </button>
                  )}
                  {!souEu && (
                    <button onClick={() => removerUsuario(u.id, u.nome)} disabled={pendente} title="Excluir" className="btn btn-icone hover:text-red-600"><i className="fa-solid fa-trash"></i></button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
