import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { telegramConfigurado, modoTelegram } from "@/lib/telegram/api";
import { prepararTelegramAction, confirmarTelegramAction, processarTelegramAction, reabrirFalhasTelegramAction } from "./actions";
import { ocorrenciaAction } from "@/app/bot-whatsapp/actions";
import { diaHojePV } from "@/lib/whatsapp/texto.mjs";
export const dynamic = "force-dynamic";
const box = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const btn = "rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50";
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";

export default async function TelegramPainel({
  searchParams,
}: {
  searchParams?: Promise<{ erro?: string; ok?: string }>;
}) {
  await exigirAdmin();
  const params = (await searchParams) ?? {};
  const modo = modoTelegram();
  const [total, avisos, lotes, grupos, aulas] = await Promise.all([
    prisma.telegramAssinante.count({ where: { ativo: true } }),
    prisma.aviso.findMany({ where: { status: "PENDENTE" }, include: { grupo: true }, orderBy: { criadoEm: "desc" }, take: 50 }),
    prisma.telegramLote.findMany({ include: { mensagens: { select: { status: true } } }, orderBy: { criadoEm: "desc" }, take: 30 }),
    prisma.telegramAssinante.findMany({ where: { ativo: true }, select: { nome: true, grupo: { select: { nome: true } } }, orderBy: { atualizadoEm: "desc" }, take: 8 }),
    prisma.turma.findMany({ where: { oferta: { is: { status: "PUBLICADA" } }, grupoId: { not: null }, diaSemana: { not: null } },
      include: { grupo: true, disciplina: true }, orderBy: { id: "asc" }, take: 500 }),
  ]);
  const lotesPorAviso = new Map(lotes.map(l => [l.avisoId, l]));
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-10">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/" className="text-sm text-sky-700 hover:underline">← Voltar ao SAGA</Link>
          <h1 className="mt-2 text-3xl font-extrabold">Integração Telegram — SAGA</h1>
          <p className="text-sm text-slate-600">Aproveita as turmas e os avisos existentes. O WhatsApp fica disponível separadamente, sem disparos automáticos.</p></div>
        <span className={`rounded-full px-4 py-2 text-sm font-bold ${modo === "REAL" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>Lotes: {modo === "REAL" ? "ENVIO REAL" : "SIMULAÇÃO"}</span>
      </header>
      {params.erro && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {params.erro}
        </div>
      )}
      {params.ok && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
          {params.ok}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className={box}><p className="text-sm text-slate-500">Alunos inscritos</p><p className="text-3xl font-black">{total}</p></div>
        <div className={box}><p className="text-sm text-slate-500">Avisos pendentes</p><p className="text-3xl font-black">{avisos.length}</p></div>
        <div className={box}><p className="text-sm text-slate-500">Token BotFather</p><p className="text-lg font-bold text-emerald-700">{telegramConfigurado() ? "Configurado (@saga_avisos_academicos_bot)" : "Pendente"}</p></div>
      </div>
      <section className={box}><h2 className="text-lg font-bold">1. Conectar alunos ao bot</h2>
        <p className="mt-2 text-sm text-slate-600">
          Abra o bot <a href="https://t.me/saga_avisos_academicos_bot" target="_blank" rel="noreferrer" className="font-bold text-sky-700 underline">@saga_avisos_academicos_bot</a> no Telegram e envie <strong>/start</strong> para autorizar a inscrição.
        </p>
        <p className="mt-2 text-sm text-amber-800">O modo SIMULAÇÃO afeta apenas os disparos em lote; respostas a comandos enviados ao bot são mensagens reais.</p>
        {grupos.length > 0 && <p className="mt-3 text-xs text-slate-500">Últimos inscritos: {grupos.map(g => `${g.nome ?? "Aluno"}${g.grupo ? ` (${g.grupo.nome})` : ""}`).join(" · ")}</p>}
      </section>
      <section className={box}><h2 className="text-lg font-bold">2. Registrar mudança ou cancelamento</h2>
        <p className="mb-3 text-sm text-slate-600">Registra a ocorrência no SAGA e cria o aviso pendente. Se a data escolhida não cair no dia da semana da aula, o sistema ajusta automaticamente para a próxima aula daquela disciplina.</p>
        <form action={ocorrenciaAction} className="grid gap-3 md:grid-cols-2">
          <input type="hidden" name="origem" value="telegram" />
          <label className="space-y-1 text-sm">Aula/turma <select name="turmaId" required className={input}>{aulas.map(a => <option value={a.id} key={a.id}>{a.grupo?.nome} — {a.nomeNaPlanilha ?? a.disciplina.nome} ({a.diaSemana})</option>)}</select></label>
          <label className="space-y-1 text-sm">Data <input type="date" name="data" required defaultValue={diaHojePV().iso} className={input}/></label>
          <label className="space-y-1 text-sm">Ocorrência <select name="tipo" className={input}><option value="CANCELAMENTO">Não haverá aula</option><option value="TROCA_SALA">Mudança de sala</option><option value="TROCA_HORARIO">Mudança de horário</option></select></label>
          <label className="space-y-1 text-sm">Nova sala ou novo horário <input name="valorNovo" className={input} placeholder="LAB 03 ou 19:00-21:45"/></label>
          <label className="space-y-1 text-sm md:col-span-2">Motivo (opcional) <input name="motivo" className={input} maxLength={240}/></label>
          <button type="submit" className={`${btn} md:col-span-2`} disabled={!aulas.length}>Registrar ocorrência</button>
        </form>
      </section>
      <section className={box}><h2 className="text-lg font-bold">3. Preparar aviso para todos os inscritos</h2>
        <p className="mb-3 text-sm text-slate-600">Cada aviso cria um lote próprio do Telegram. Os destinatários são capturados ao preparar; o envio exige confirmação explícita.</p>
        {!total && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Ainda não há inscritos. Abra o bot <a href="https://t.me/saga_avisos_academicos_bot" target="_blank" rel="noreferrer" className="font-bold underline">@saga_avisos_academicos_bot</a> e envie /start antes de preparar lotes.</p>}
        <div className="space-y-3">{avisos.map(a => { const lote = lotesPorAviso.get(a.id); return <div key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3">
          <div className="max-w-2xl"><p className="text-sm font-bold">Aviso #{a.id} · {a.grupo.nome}</p><p className="whitespace-pre-line text-sm text-slate-600">{a.conteudo}</p></div>
          {lote ? <span className="text-sm font-bold text-sky-700">Lote #{lote.id} • {lote.status}</span> : <form action={prepararTelegramAction}><input type="hidden" name="avisoId" value={a.id}/><button disabled={!total} className={btn}>Preparar para {total} aluno(s)</button></form>}
        </div>; })}{avisos.length === 0 && <p className="text-sm text-slate-500">Nenhum aviso pendente.</p>}</div>
      </section>
      <section className={box}><h2 className="text-lg font-bold">4. Confirmar e processar os lotes</h2>
        <div className="mt-3 space-y-3">{lotes.map(l => {
          const contagem: Record<string, number> = {};
          for (const m of l.mensagens) contagem[m.status] = (contagem[m.status] ?? 0) + 1;
          return <div key={l.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div><strong>Lote #{l.id} · Aviso #{l.avisoId}</strong> — {l.status}{l.modoConfirmado ? ` (${l.modoConfirmado})` : ""}<p className="text-slate-500">{Object.entries(contagem).map(([s,n]) => `${s}: ${n}`).join(" · ")}</p></div>
            {l.status === "PREPARADO" && <form action={confirmarTelegramAction} className="space-y-2"><input type="hidden" name="loteId" value={l.id}/><input type="hidden" name="modo" value={modo}/><label className="flex items-start gap-2 text-xs"><input type="checkbox" name="confirmacao" value="sim" required/>Revisei os destinatários e confirmo o modo {modo}.</label><button className={btn}>Confirmar {modo === "REAL" ? "envio REAL" : "simulação"}</button></form>}
            {l.status === "CONCLUIDO" && (contagem.FALHOU ?? 0) > 0 && l.modoConfirmado === modo && <form action={reabrirFalhasTelegramAction} className="space-y-2 max-w-xs">
              <input type="hidden" name="loteId" value={l.id}/><input type="hidden" name="modo" value={modo}/>
              <label className="flex items-start gap-2 text-xs text-amber-900"><input type="checkbox" name="confirmacao" value="sim" required/>
                Confirmei que as {contagem.FALHOU} mensagem(ns) com falha não chegaram ao destinatário. Sei que repetir uma tentativa pode duplicar mensagens.</label>
              <button className={btn}>Reabrir {contagem.FALHOU} falha(s) para {modo === "REAL" ? "reenvio REAL" : "simulação"}</button>
            </form>}
          </div>; })}{lotes.length === 0 && <p className="text-sm text-slate-500">Ainda não há lotes preparados.</p>}</div>
        <form action={processarTelegramAction} className="mt-4"><button className={btn}>Processar até 10 mensagens</button></form>
        <p className="mt-3 text-xs text-slate-500">Avisos já simulados não serão enviados automaticamente ao mudar o .env. Para notificações reais, confirme um novo lote com TELEGRAM_MODE=REAL.</p>
      </section>
      <section className={box}><h2 className="text-lg font-bold">5. Consultar horários pelo Telegram</h2>
        <p className="mt-2 text-sm text-slate-600">O aluno envia /turmas, escolhe /turma ID e solicita /horario ou um dia (/segunda, /sexta...). O bot gera a imagem PNG de sua turma usando a oferta publicada e eventuais alterações da data.</p>
        <p className="mt-2 text-xs text-slate-500">Em testes locais, use o polling. Para receber comandos depois da publicação do site, configure um webhook HTTPS com o segredo adequado; não use os dois métodos ao mesmo tempo.</p>
      </section>
      <p className="text-xs text-slate-500">Documentação: docs/TELEGRAM_INTEGRACAO.md. Credenciais e dados pessoais não devem ser publicados no GitHub.</p>
    </div>
  </main>;
}
