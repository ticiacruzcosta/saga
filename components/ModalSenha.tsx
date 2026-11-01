"use client";

// Janela "Trocar senha" (rodapé do menu).

import { useState, useTransition } from "react";
import { alterarMinhaSenha } from "@/app/auth";

const inp = "w-full border border-gray-200 rounded-lg p-2.5";

export default function ModalSenha({ onFechar }: { onFechar: () => void }) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  function salvar() {
    setErro("");
    if (nova !== confirmacao) return setErro("A confirmação não confere com a nova senha.");
    iniciar(async () => {
      const r = await alterarMinhaSenha({ atual, nova });
      if (!r.ok) return setErro(r.erro ?? "Não foi possível trocar a senha.");
      alert("Senha alterada.");
      onFechar();
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm space-y-4 text-sm">
        <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-solid fa-key text-[#F39200] mr-2"></i>Trocar senha</h3>
        <label className="block font-semibold">Senha atual<input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" className={inp} /></label>
        <label className="block font-semibold">Nova senha (mínimo 8 caracteres)<input type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" className={inp} /></label>
        <label className="block font-semibold">Confirmar nova senha<input type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} autoComplete="new-password" className={inp} /></label>
        {erro && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">{erro}</p>}
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onFechar} className="px-4 py-2 border border-gray-200 rounded-lg">Cancelar</button>
          <button onClick={salvar} disabled={pendente || !atual || !nova} className="px-4 py-2 bg-[#F39200] text-white font-bold rounded-lg disabled:opacity-50">Salvar</button>
        </div>
      </div>
    </div>
  );
}
