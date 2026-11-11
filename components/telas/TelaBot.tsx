"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  definirTurmaAssinantePainel,
  editarAviso,
  enviarAvisoTelegram,
  sincronizarBotPainel,
} from "@/app/actions";
import { avisar } from "@/components/avisos";
import type { AssinanteTelegramVM, AvisoVM, GrupoVM } from "@/lib/tipos";

export default function TelaBot({
  avisosPendentes,
  telegramOk = true,
  avisos = [],
  assinantes = [],
  grupos = [],
  irParaHistorico,
}: {
  avisosPendentes: number;
  telegramOk?: boolean;
  avisos?: AvisoVM[];
  assinantes?: AssinanteTelegramVM[];
  grupos?: GrupoVM[];
  irParaHistorico?: () => void;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [editId, setEditId] = useState<number | null>(null);
  const [textoEdit, setTextoEdit] = useState("");

  const enviados = avisos.filter((a) => a.statusTelegram === "Enviado").length;
  const naFila = avisos.filter((a) => a.statusTelegram === "Na fila").length;
  const falhas = avisos.filter((a) => a.statusTelegram === "Falhou").length;
  const pendentesLista = avisos.filter((a) => a.status === "Pendente" || a.status === "Falhou").slice(0, 6);
  const recentes = avisos.slice(0, 6);
  const ativos = assinantes.filter((s) => s.ativo).length;

  function sincronizar() {
    iniciar(async () => {
      const r = await sincronizarBotPainel();
      if (!r.ok) return avisar(r.erro ?? "Falha ao sincronizar", "erro");
      avisar(r.resumo ?? "Bot sincronizado!");
      router.refresh();
    });
  }

  function dispararAviso(a: AvisoVM) {
    const txt = editId === a.id ? textoEdit.trim() : a.mensagem;
    if (!txt) return avisar("A mensagem não pode ficar vazia.", "erro");
    iniciar(async () => {
      const r = await enviarAvisoTelegram(a.id, editId === a.id ? txt : undefined);
      if (!r.ok) return avisar(r.erro ?? "Erro ao disparar aviso.", "erro");
      setEditId(null);
      avisar(r.resumo ?? `Aviso de ${a.turma} disparado!`);
      router.refresh();
    });
  }

  function salvarEdicaoAviso(a: AvisoVM) {
    const txt = textoEdit.trim();
    if (!txt) return avisar("A mensagem não pode ficar vazia.", "erro");
    iniciar(async () => {
      const r = await editarAviso({ id: a.id, mensagem: txt });
      if (!r.ok) return avisar(r.erro ?? "Não foi possível salvar.", "erro");
      setEditId(null);
      avisar("Mensagem atualizada!");
      router.refresh();
    });
  }

  function trocarTurmaAluno(assinanteId: number, valor: string) {
    iniciar(async () => {
      const r = await definirTurmaAssinantePainel(assinanteId, valor ? Number(valor) : null);
      if (!r.ok) return avisar(r.erro ?? "Erro ao atualizar turma", "erro");
      avisar("Turma do aluno atualizada!");
      router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      {/* 1. Banner no formato e cores do Dashboard principal */}
      <div className="relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-7 min-h-[150px] flex flex-col justify-center gap-3.5 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
        <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90" />
        <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35" />
        <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85" />

        <div className="relative max-w-xl">
          <h2 className="text-2xl md:text-[26px] font-black">Bot Acadêmico SAGA</h2>
          <p className="text-[15px] text-white/90">
            {telegramOk
              ? "Conectado ao @saga_avisos_academicos_bot. Os alunos consultam horários do dia, de amanhã e da semana e recebem avisos das turmas."
              : "Chave do BotFather pendente de configuração no .env."}
          </p>
        </div>

        <div className="relative flex flex-wrap items-center gap-2">
          <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold inline-flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${telegramOk ? "bg-emerald-400" : "bg-amber-400"}`}></span>
            {telegramOk ? "Bot ativo" : "Token pendente"}
          </span>
          <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
            {ativos} aluno(s) inscrito(s)
          </span>
          <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
            {avisosPendentes} aviso(s) pendente(s)
          </span>
          <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
            {enviados} disparo(s) enviado(s)
          </span>
          {naFila > 0 && (
            <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
              {naFila} na fila
            </span>
          )}
          {falhas > 0 && (
            <span className="px-3.5 py-1.5 rounded-full bg-red-500/80 text-white text-[13px] font-bold">
              {falhas} falha(s)
            </span>
          )}
        </div>
      </div>

      {/* 2. Barra de Controle Rápido */}
      <div className="p-4 cartao flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-[14px] bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-lg shrink-0 font-black">
            <i className="fa-solid fa-paper-plane"></i>
          </div>
          <div>
            <p className="text-sm font-bold text-[#1A2332]">@saga_avisos_academicos_bot</p>
            <p className="text-xs text-gray-500">
              Sincronize os comandos do bot ou dispare os avisos pendentes direto abaixo
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://t.me/saga_avisos_academicos_bot"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secundario btn-sm"
          >
            <i className="fa-solid fa-arrow-up-right-from-square"></i> Abrir no Telegram
          </a>
          <button onClick={sincronizar} disabled={pendente || !telegramOk} className="btn btn-escuro btn-sm">
            <i className={`fa-solid fa-rotate ${pendente ? "fa-spin" : ""}`}></i> Sincronizar Bot
          </button>
          <Link href="/bot-telegram" className="btn btn-principal btn-sm">
            <i className="fa-solid fa-sliders"></i> Fila de Lotes
          </Link>
        </div>
      </div>

      {/* 3. Colunas Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna Esquerda (2/3): Avisos Pendentes para Disparo Direto */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-5 cartao space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-[#1A2332]">Avisos Prontos para Disparo</h3>
                <p className="text-xs text-gray-500">
                  Edite a mensagem se desejar e envie com 1 clique para o bot
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-[#FFF4E5] text-[#B45309] text-xs px-3 py-1 rounded-full font-extrabold">
                  {avisosPendentes} pendente(s)
                </span>
                {irParaHistorico && (
                  <button onClick={irParaHistorico} className="text-xs font-bold text-[#B45309] hover:underline">
                    Ver todos →
                  </button>
                )}
              </div>
            </div>

            {(pendentesLista.length > 0 ? pendentesLista : recentes).length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">Nenhum aviso registrado no momento.</p>
            ) : (
              <ul className="divide-y divide-gray-200 text-sm">
                {(pendentesLista.length > 0 ? pendentesLista : recentes).map((a) => {
                  const emEdicao = editId === a.id;
                  const jaEnviado = a.status === "Enviado" || a.status === "Entregue";
                  return (
                    <li key={a.id} className="py-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900">{a.turma}</span>
                          <span className="text-xs text-gray-400">· {a.quando}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-extrabold ${
                              jaEnviado ? "bg-emerald-50 text-emerald-700" : "bg-yellow-50 text-yellow-800"
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${jaEnviado ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                            {a.status}
                          </span>
                          {!emEdicao && !jaEnviado && (
                            <>
                              <button
                                onClick={() => {
                                  setEditId(a.id);
                                  setTextoEdit(a.mensagem);
                                }}
                                disabled={pendente}
                                title="Editar mensagem antes de disparar"
                                className="btn btn-icone !w-8 !h-8 text-xs"
                              >
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button
                                onClick={() => dispararAviso(a)}
                                disabled={pendente}
                                className="btn btn-principal btn-sm"
                              >
                                <i className="fa-solid fa-paper-plane"></i> Disparar
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {emEdicao ? (
                        <div className="space-y-2 pt-1">
                          <textarea
                            value={textoEdit}
                            onChange={(e) => setTextoEdit(e.target.value)}
                            rows={3}
                            className="campo text-xs"
                          />
                          <div className="flex justify-end gap-2">
                            <button onClick={() => setEditId(null)} className="btn btn-secundario btn-sm">
                              Cancelar
                            </button>
                            <button onClick={() => salvarEdicaoAviso(a)} disabled={pendente} className="btn btn-escuro btn-sm">
                              Salvar texto
                            </button>
                            <button onClick={() => dispararAviso(a)} disabled={pendente} className="btn btn-principal btn-sm">
                              Salvar e Disparar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 whitespace-pre-line">{a.mensagem}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Comandos Interativos do Aluno */}
          <div className="p-5 cartao space-y-3">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <h3 className="font-bold text-[#1A2332]">Comandos & Botões do Aluno no Telegram</h3>
              <span className="bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-extrabold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Botões Ativos
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-sm pt-1">
              {[
                ["/start", "Menu Rápido", "Inscreve o aluno e exibe botões para Hoje, Amanhã, Semana e Avisos."],
                ["/hoje e /amanha", "Imagem PNG", "Gera na hora o card da grade da turma com salas e alterações do dia."],
                ["/semana", "Grade Semanal", "Lista todas as disciplinas, horários e professores da semana."],
                ["/turmas [sigla]", "Busca + Botões", "Filtra turmas (ex.: /turmas SI) e permite escolher tocando no botão."],
              ].map(([cmd, tag, desc]) => (
                <div key={cmd} className="p-3 rounded-[14px] bg-gray-50 border border-gray-200/80 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-[#1A2332]">{cmd}</span>
                    <span className="text-[10px] font-extrabold text-[#B45309] bg-[#FFF4E5] px-2 py-0.5 rounded-full">
                      {tag}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Direita (1/3): Alunos Inscritos no Bot */}
        <div className="space-y-6">
          <div className="p-5 cartao space-y-3">
            <div className="flex justify-between items-center border-b border-gray-100 pb-2">
              <div>
                <h3 className="font-bold text-[#1A2332]">Alunos Inscritos</h3>
                <p className="text-xs text-gray-500">Vincule ou troque a turma de cada aluno</p>
              </div>
              <span className="bg-[#FFF4E5] text-[#B45309] text-xs px-2.5 py-0.5 rounded-full font-extrabold">
                {assinantes.length}
              </span>
            </div>

            {assinantes.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <p className="text-xs text-gray-500">Nenhum aluno inscrito ainda.</p>
                <p className="text-[11px] text-gray-400">
                  Abra <b>@saga_avisos_academicos_bot</b> no Telegram, envie <b>/start</b> e clique em{" "}
                  <b>Sincronizar Bot</b> acima.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 text-sm max-h-[460px] overflow-y-auto pr-1">
                {assinantes.map((s) => (
                  <li key={s.id} className="py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-gray-900 truncate">
                        {s.nome}{" "}
                        <span className="text-xs font-normal text-gray-400">#{s.chatId.slice(-4)}</span>
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-extrabold ${
                          s.ativo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {s.ativo ? "Ativo" : "Pausado"}
                      </span>
                    </div>
                    <select
                      value={s.grupoId ? String(s.grupoId) : ""}
                      onChange={(e) => trocarTurmaAluno(s.id, e.target.value)}
                      disabled={pendente}
                      className="campo campo-sm !py-1.5 text-xs"
                    >
                      <option value="">Sem turma definida</option>
                      {grupos.map((g) => (
                        <option key={g.id} value={String(g.id)}>
                          {g.nome}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
