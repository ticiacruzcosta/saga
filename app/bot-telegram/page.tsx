import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { telegramConfigurado, modoTelegram } from "@/lib/telegram/api";
import {
  prepararTelegramAction,
  confirmarTelegramAction,
  processarTelegramAction,
  reabrirFalhasTelegramAction,
  sincronizarBotAction,
  alterarTurmaAssinanteAction,
} from "./actions";
import { ocorrenciaAction } from "@/app/bot-whatsapp/actions";
import { diaHojePV } from "@/lib/whatsapp/texto.mjs";

export const dynamic = "force-dynamic";

export default async function TelegramPainel({
  searchParams,
}: {
  searchParams?: Promise<{ erro?: string; ok?: string }>;
}) {
  await exigirAdmin();
  const params = (await searchParams) ?? {};
  const modo = modoTelegram();
  const tokenOk = telegramConfigurado();

  const [totalAtivos, totalInativos, avisos, lotes, assinantes, todosGrupos, aulas] = await Promise.all([
    prisma.telegramAssinante.count({ where: { ativo: true } }),
    prisma.telegramAssinante.count({ where: { ativo: false } }),
    prisma.aviso.findMany({ where: { status: "PENDENTE" }, include: { grupo: true }, orderBy: { criadoEm: "desc" }, take: 50 }),
    prisma.telegramLote.findMany({ include: { mensagens: { select: { status: true } } }, orderBy: { criadoEm: "desc" }, take: 30 }),
    prisma.telegramAssinante.findMany({
      include: { grupo: { select: { id: true, nome: true } } },
      orderBy: [{ ativo: "desc" }, { atualizadoEm: "desc" }],
      take: 25,
    }),
    prisma.grupoAlunos.findMany({ orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.turma.findMany({
      where: { oferta: { is: { status: "PUBLICADA" } }, grupoId: { not: null }, diaSemana: { not: null } },
      include: { grupo: true, disciplina: true },
      orderBy: { id: "asc" },
      take: 500,
    }),
  ]);

  const lotesPorAviso = new Map(lotes.map((l) => [l.avisoId, l]));
  const pendentesNaFila = lotes.reduce(
    (acc, l) => acc + l.mensagens.filter((m) => m.status === "PENDENTE").length,
    0
  );

  return (
    <div className="saga-app min-h-screen bg-[#F4F6F9] text-gray-800 pb-12">
      {/* Barra Superior igual ao cabeçalho do painel principal */}
      <header className="bg-white border-b border-gray-200 px-4 md:px-8 py-4 sticky top-0 z-10">
        <div className="mx-auto max-w-6xl flex flex-wrap justify-between items-center gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="btn btn-icone" title="Voltar ao SAGA">
              <i className="fa-solid fa-arrow-left"></i>
            </Link>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-[#1A2332] leading-tight">
                Status e Fila do Bot
              </h1>
              <p className="text-xs text-gray-500">Faculdade Unisapiens · Integração Telegram (@saga_avisos_academicos_bot)</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-extrabold ${
                modo === "REAL" ? "bg-yellow-50 text-yellow-800" : "bg-emerald-50 text-emerald-700"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${modo === "REAL" ? "bg-amber-500" : "bg-emerald-500"}`}></span>
              Modo: {modo === "REAL" ? "ENVIO REAL" : "SIMULAÇÃO"}
            </span>

            <form action={sincronizarBotAction}>
              <button type="submit" disabled={!tokenOk} className="btn btn-principal btn-sm">
                <i className="fa-solid fa-rotate"></i> Sincronizar Bot
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4 md:p-8 space-y-6">
        {/* Alertas */}
        {params.erro && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-800 rounded-[14px] p-4 text-sm font-semibold flex items-center gap-2.5">
            <i className="fa-solid fa-circle-xmark text-red-600"></i>
            <span>{params.erro}</span>
          </div>
        )}
        {params.ok && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-800 rounded-[14px] p-4 text-sm font-semibold flex items-center gap-2.5">
            <i className="fa-solid fa-circle-check text-green-600"></i>
            <span>{params.ok}</span>
          </div>
        )}

        {/* Banner idêntico ao do Dashboard Principal */}
        <div className="relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-7 min-h-[150px] flex flex-col justify-center gap-3.5 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
          <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90" />
          <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35" />
          <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85" />

          <div className="relative max-w-xl">
            <h2 className="text-2xl md:text-[26px] font-black">Central de Disparos & Horários</h2>
            <p className="text-[15px] text-white/90">
              Prepare lotes de avisos para as turmas, confirme o disparo e acompanhe os alunos inscritos no bot da Unisapiens.
            </p>
          </div>

          <div className="relative flex flex-wrap gap-2">
            <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
              {totalAtivos} aluno(s) ativo(s)
            </span>
            {totalInativos > 0 && (
              <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
                {totalInativos} pausado(s)
              </span>
            )}
            <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
              {avisos.length} aviso(s) pendente(s)
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
              {pendentesNaFila} mensagem(ns) na fila
            </span>
            <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">
              {tokenOk ? "Chave BotFather ativa" : "Chave pendente"}
            </span>
          </div>
        </div>

        {/* Conteúdo Principal em 2 colunas com cartões (.cartao) padrão SAGA */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Avisos Pendentes */}
            <section className="p-5 cartao space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-bold text-[#1A2332]">1. Avisos Pendentes para Disparo</h3>
                  <p className="text-xs text-gray-500">Escolha enviar para os alunos da turma ou para todos os inscritos.</p>
                </div>
                <span className="bg-[#FFF4E5] text-[#B45309] text-xs px-3 py-1 rounded-full font-extrabold">
                  {avisos.length} pendente(s)
                </span>
              </div>

              {!totalAtivos && (
                <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-[14px] p-3.5 text-xs">
                  Ainda não há alunos inscritos. Abra{" "}
                  <a href="https://t.me/saga_avisos_academicos_bot" target="_blank" rel="noreferrer" className="font-bold underline">
                    @saga_avisos_academicos_bot
                  </a>{" "}
                  no Telegram, envie <b>/start</b> e clique em <b>Sincronizar Bot</b> no topo.
                </div>
              )}

              {avisos.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nenhum aviso pendente no momento.</p>
              ) : (
                <ul className="divide-y divide-gray-200 text-sm">
                  {avisos.map((a) => {
                    const lote = lotesPorAviso.get(a.id);
                    return (
                      <li key={a.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 max-w-xl">
                          <p className="font-bold text-gray-900">
                            <span className="text-xs text-[#B45309] mr-1.5">#{a.id}</span>
                            {a.grupo.nome}
                          </p>
                          <p className="text-xs text-gray-600 whitespace-pre-line">{a.conteudo}</p>
                        </div>

                        {lote ? (
                          <span className="bg-emerald-50 text-emerald-700 inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-extrabold shrink-0">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            Lote #{lote.id} ({lote.status})
                          </span>
                        ) : (
                          <form action={prepararTelegramAction} className="flex flex-wrap items-center gap-2 shrink-0">
                            <input type="hidden" name="avisoId" value={a.id} />
                            <select name="escopo" defaultValue="TURMA" className="campo campo-sm !w-auto text-xs">
                              <option value="TURMA">Alunos da turma</option>
                              <option value="TODOS">Todos ({totalAtivos})</option>
                            </select>
                            <button disabled={!totalAtivos} className="btn btn-principal btn-sm">
                              Preparar Lote
                            </button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 2. Fila de Lotes */}
            <section className="p-5 cartao space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-100 pb-3">
                <div>
                  <h3 className="font-bold text-[#1A2332]">2. Confirmar e Processar Lotes</h3>
                  <p className="text-xs text-gray-500">Confirme os lotes preparados e processe a fila de envio.</p>
                </div>
                <form action={processarTelegramAction}>
                  <button className="btn btn-escuro btn-sm">
                    <i className="fa-solid fa-play text-[#F39200]"></i> Processar Fila (até 15)
                  </button>
                </form>
              </div>

              {lotes.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Nenhum lote preparado ainda.</p>
              ) : (
                <ul className="divide-y divide-gray-200 text-sm">
                  {lotes.map((l) => {
                    const contagem: Record<string, number> = {};
                    for (const m of l.mensagens) contagem[m.status] = (contagem[m.status] ?? 0) + 1;
                    const concluido = l.status === "CONCLUIDO";
                    return (
                      <li key={l.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">
                              Lote #{l.id} · Aviso #{l.avisoId}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full font-extrabold ${
                                concluido ? "bg-emerald-50 text-emerald-700" : "bg-yellow-50 text-yellow-800"
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${concluido ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                              {l.status}
                              {l.modoConfirmado ? ` (${l.modoConfirmado})` : ""}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {Object.entries(contagem)
                              .map(([s, n]) => `${s}: ${n}`)
                              .join(" · ") || "Sem mensagens"}
                          </p>
                        </div>

                        {l.status === "PREPARADO" && (
                          <form action={confirmarTelegramAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="loteId" value={l.id} />
                            <input type="hidden" name="modo" value={modo} />
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                              <input type="checkbox" name="confirmacao" value="sim" required />
                              <span>Confirmar ({modo})</span>
                            </label>
                            <button className="btn btn-principal btn-sm">Confirmar</button>
                          </form>
                        )}

                        {l.status === "CONCLUIDO" && (contagem.FALHOU ?? 0) > 0 && l.modoConfirmado === modo && (
                          <form action={reabrirFalhasTelegramAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="loteId" value={l.id} />
                            <input type="hidden" name="modo" value={modo} />
                            <label className="flex items-center gap-1.5 text-xs text-red-700 cursor-pointer">
                              <input type="checkbox" name="confirmacao" value="sim" required />
                              <span>Reenviar {contagem.FALHOU} falha(s)</span>
                            </label>
                            <button className="btn btn-secundario btn-sm">Reabrir</button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* 3. Registrar Ocorrência */}
            <section className="p-5 cartao space-y-4">
              <div className="border-b border-gray-100 pb-3">
                <h3 className="font-bold text-[#1A2332]">3. Registrar Alteração ou Cancelamento de Aula</h3>
                <p className="text-xs text-gray-500">Registra a mudança na grade do dia e já cria o aviso pendente acima.</p>
              </div>

              <form action={ocorrenciaAction} className="grid gap-3 md:grid-cols-2 text-sm">
                <input type="hidden" name="origem" value="telegram" />
                <div>
                  <label className="block font-semibold mb-1 text-xs">Aula / Turma</label>
                  <select name="turmaId" required className="campo campo-sm">
                    {aulas.map((a) => (
                      <option value={a.id} key={a.id}>
                        {a.grupo?.nome} — {a.nomeNaPlanilha ?? a.disciplina.nome} ({a.diaSemana})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">Data</label>
                  <input type="date" name="data" required defaultValue={diaHojePV().iso} className="campo campo-sm" />
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">Ocorrência</label>
                  <select name="tipo" className="campo campo-sm">
                    <option value="CANCELAMENTO">Não haverá aula (Cancelamento)</option>
                    <option value="TROCA_SALA">Mudança de sala / laboratório</option>
                    <option value="TROCA_HORARIO">Mudança de horário</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1 text-xs">Nova Sala ou Horário</label>
                  <input name="valorNovo" className="campo campo-sm" placeholder="Ex.: LAB03 ou 19:00-21:45" />
                </div>
                <div className="md:col-span-2">
                  <label className="block font-semibold mb-1 text-xs">Motivo (opcional)</label>
                  <input name="motivo" className="campo campo-sm" maxLength={240} placeholder="Ex.: Docente em atividade externa" />
                </div>
                <div className="md:col-span-2 flex justify-end pt-1">
                  <button type="submit" disabled={!aulas.length} className="btn btn-principal">
                    Registrar Ocorrência
                  </button>
                </div>
              </form>
            </section>
          </div>

          {/* Coluna Direita (1/3) */}
          <div className="space-y-6">
            {/* Alunos Inscritos */}
            <section className="p-5 cartao space-y-3">
              <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                <h3 className="font-bold text-[#1A2332]">Alunos Inscritos</h3>
                <span className="bg-[#FFF4E5] text-[#B45309] text-xs px-2.5 py-0.5 rounded-full font-extrabold">
                  {assinantes.length}
                </span>
              </div>

              {assinantes.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">
                  Nenhum aluno inscrito ainda. Envie <b>/start</b> no bot e clique em <b>Sincronizar Bot</b>.
                </p>
              ) : (
                <ul className="divide-y divide-gray-200 text-sm max-h-[420px] overflow-y-auto pr-1">
                  {assinantes.map((s) => (
                    <li key={s.id} className="py-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-gray-900 truncate">
                          {s.nome ?? "Aluno"}{" "}
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
                      <form action={alterarTurmaAssinanteAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="assinanteId" value={s.id} />
                        <select
                          name="grupoId"
                          defaultValue={s.grupoId ? String(s.grupoId) : ""}
                          className="campo campo-sm !py-1.5 text-xs flex-1"
                        >
                          <option value="">Sem turma definida</option>
                          {todosGrupos.map((g) => (
                            <option key={g.id} value={String(g.id)}>
                              {g.nome}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-secundario btn-sm">
                          Salvar
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Comandos disponíveis */}
            <section className="p-5 cartao space-y-3">
              <div className="border-b border-gray-100 pb-2">
                <h3 className="font-bold text-[#1A2332]">Comandos do Bot</h3>
                <p className="text-xs text-gray-500">Atalhos ativos em @saga_avisos_academicos_bot</p>
              </div>
              <ul className="divide-y divide-gray-200 text-xs">
                <li className="py-2 flex justify-between">
                  <b className="text-[#B45309]">/start</b>
                  <span className="text-gray-600">Inscrição e menu com botões</span>
                </li>
                <li className="py-2 flex justify-between">
                  <b className="text-[#B45309]">/hoje · /amanha</b>
                  <span className="text-gray-600">Imagem PNG das aulas</span>
                </li>
                <li className="py-2 flex justify-between">
                  <b className="text-[#B45309]">/semana</b>
                  <span className="text-gray-600">Resumo da semana inteira</span>
                </li>
                <li className="py-2 flex justify-between">
                  <b className="text-[#B45309]">/segunda ... /sabado</b>
                  <span className="text-gray-600">Imagem do dia escolhido</span>
                </li>
                <li className="py-2 flex justify-between">
                  <b className="text-[#B45309]">/turmas [sigla]</b>
                  <span className="text-gray-600">Buscar/trocar turma com botões</span>
                </li>
                <li className="py-2 flex justify-between">
                  <b className="text-[#B45309]">/avisos</b>
                  <span className="text-gray-600">Últimos avisos da turma</span>
                </li>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
