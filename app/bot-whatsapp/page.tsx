import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { diaHojePV, mascararTelefone } from "@/lib/whatsapp/texto.mjs";
import { modoBot, credenciaisReaisValidas } from "@/lib/whatsapp/meta";
import { cadastrarDestinatarioTesteAction, confirmarAction, desativarDestinatarioTesteAction, ocorrenciaAction, prepararAction, processarAction } from "./actions";

export const dynamic = "force-dynamic";
const btn = "rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700";
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900";
const card = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";

const feedbacks: Record<string, { mensagem: string; erro: boolean }> = {
  cadastrado: { mensagem: "Destinatário de teste cadastrado. Agora os avisos podem ser preparados para simulação.", erro: false },
  desativado: { mensagem: "Destinatário de teste desativado e mensagens pendentes canceladas.", erro: false },
  telefone_invalido: { mensagem: "Telefone inválido. Informe um número brasileiro com DDD, por exemplo (69) 99999-9999.", erro: true },
  sem_autorizacao: { mensagem: "Confirme que este telefone é seu ou que você tem autorização para testá-lo.", erro: true },
  modo_invalido: { mensagem: "Cadastro manual disponível apenas no modo SIMULAÇÃO.", erro: true },
  inscrito_real: { mensagem: "Esse número já tem registro de inscrição via WhatsApp. Não será convertido em destinatário de teste.", erro: true },
  nao_encontrado: { mensagem: "Destinatário de teste não encontrado ou já desativado.", erro: true },
};

export default async function BotWhatsappPage({ searchParams }: { searchParams?: Promise<{ feedback?: string }> }) {
  await exigirAdmin();
  const real = modoBot() === "REAL";
  const [inscritos, inscritosReais, testesAtivos, destinatariosTeste, avisos, lotes, aulas] = await Promise.all([
    prisma.whatsappAssinante.count({ where: { ativo: true, ...(real ? { apenasSimulacao: false } : {}) } }),
    prisma.whatsappAssinante.count({ where: { ativo: true, apenasSimulacao: false } }),
    prisma.whatsappAssinante.count({ where: { ativo: true, apenasSimulacao: true } }),
    prisma.whatsappAssinante.findMany({ where: { ativo: true, apenasSimulacao: true }, orderBy: { id: "desc" }, take: 50 }),
    prisma.aviso.findMany({ where: { status: "PENDENTE" }, include: { grupo: true }, take: 30, orderBy: { criadoEm: "desc" } }),
    prisma.whatsappLote.findMany({ include: { mensagens: { select: { status: true } } }, orderBy: { criadoEm: "desc" }, take: 20 }),
    prisma.turma.findMany({ where: { oferta: { is: { status: "PUBLICADA" } }, grupoId: { not: null }, diaSemana: { not: null } },
      include: { grupo: true, disciplina: true }, orderBy: { id: "asc" }, take: 500 }),
  ]);
  const lotesPorAviso = new Map(lotes.map((x) => [x.avisoId, x]));
  const feedback = feedbacks[(await searchParams)?.feedback ?? ""];
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-10">
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/" className="text-sm text-orange-700 hover:underline">← Voltar ao SAGA</Link>
          <h1 className="mt-3 text-3xl font-extrabold">Integração WhatsApp — SAGA</h1>
          <p className="mt-1 text-slate-600">Avisos existentes, assinaturas voluntárias e fila de envios para toda a faculdade.</p>
        </div>
        <div className={`rounded-full px-4 py-2 text-sm font-bold ${real ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800"}`}>
          {real ? "Modo REAL" : "Modo SIMULAÇÃO"}
        </div>
      </header>
      {feedback && <div role="status" className={`rounded-lg border px-4 py-3 text-sm ${feedback.erro ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{feedback.mensagem}</div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className={card}><div className="text-sm text-slate-500">Destinatários elegíveis {real ? "(real)" : "(simulação)"}</div><div className="text-3xl font-black">{inscritos}</div><div className="mt-1 text-xs text-slate-500">{inscritosReais} inscrições voluntárias · {testesAtivos} testes locais</div></div>
        <div className={card}><div className="text-sm text-slate-500">Avisos pendentes (últimos 30)</div><div className="text-3xl font-black">{avisos.length}</div></div>
        <div className={card}><div className="text-sm text-slate-500">Configuração real</div><div className="text-lg font-black">{credenciaisReaisValidas() ? "Credenciais presentes" : "Pendente"}</div></div>
      </div>
      <section className={card}>
        <h2 className="text-lg font-bold">1. Registrar alteração ou cancelamento</h2>
        <p className="mb-3 text-sm text-slate-600">A ocorrência aparece na imagem do dia e cria um aviso para revisão. Nenhuma mensagem é enviada nesta etapa.</p>
        <form action={ocorrenciaAction} className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium">Disciplina e turma
            <select name="turmaId" className={input} required>{aulas.map((a) => <option key={a.id} value={a.id}>{a.grupo?.nome} — {a.nomeNaPlanilha ?? a.disciplina.nome} ({a.diaSemana})</option>)}</select>
          </label>
          <label className="space-y-1 text-sm font-medium">Data da ocorrência
            <input name="data" type="date" required defaultValue={diaHojePV().iso} className={input}/>
          </label>
          <label className="space-y-1 text-sm font-medium">Tipo
            <select name="tipo" className={input} defaultValue="CANCELAMENTO">
              <option value="CANCELAMENTO">Não haverá aula</option>
              <option value="TROCA_SALA">Mudança de sala</option>
              <option value="TROCA_HORARIO">Mudança de horário</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium">Nova sala ou horário (para alterações)
            <input name="valorNovo" placeholder="LAB 04 ou 19:00-21:45" className={input}/>
          </label>
          <label className="space-y-1 text-sm font-medium md:col-span-2">Motivo (opcional)
            <input name="motivo" maxLength={240} placeholder="Informação complementar" className={input}/>
          </label>
          <button className={`${btn} md:col-span-2`} type="submit" disabled={!aulas.length}>Salvar ocorrência e preparar aviso</button>
        </form>
      </section>
      <section className={card}>
        <h2 className="text-lg font-bold">2. Preparar avisos pendentes</h2>
        <p className="mb-3 text-sm text-slate-600">Os avisos já criados no Dashboard também aparecem aqui. Em SIMULAÇÃO são usados os inscritos e os destinatários de teste; em REAL, apenas os inscritos voluntariamente pelo WhatsApp.</p>
        {!inscritos && !real && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nenhum destinatário de simulação ainda. <a href="#destinatarios-teste" className="font-bold underline">Cadastre um número de teste abaixo</a> antes de preparar avisos.</p>}
        <div className="space-y-3">{avisos.map((a) => {
          const lote = lotesPorAviso.get(a.id);
          return <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div className="max-w-2xl"><div className="text-sm font-bold">#{a.id} • {a.grupo.nome}</div><div className="whitespace-pre-line text-sm text-slate-600">{a.conteudo}</div></div>
            {!lote ? <form action={prepararAction}><input type="hidden" name="avisoId" value={a.id}/><button className={btn}>Preparar {inscritos} destinatários</button></form>
              : <div className="text-sm font-semibold text-orange-700">Lote #{lote.id} • {lote.status}</div>}
          </div>;
        })}{!avisos.length && <p className="text-sm text-slate-500">Nenhum aviso pendente no SAGA.</p>}</div>
      </section>
      <section className={card}>
        <h2 className="text-lg font-bold">3. Conferir e processar a fila</h2>
        <p className="mb-3 text-sm text-slate-600">A liberação é explícita. Em simulação, os registros passam a SIMULADO sem fazer chamadas à Meta.</p>
        <div className="mb-4 space-y-2">{lotes.map((l) => {
          const contagem: Record<string, number> = {};
          for (const m of l.mensagens) contagem[m.status] = (contagem[m.status] ?? 0) + 1;
          return <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm">
            <div><strong>Lote #{l.id}</strong> (Aviso #{l.avisoId}) • {l.status}{l.modoConfirmado ? ` (${l.modoConfirmado})` : ""}<div className="text-slate-500">{Object.entries(contagem).map(([s, n]) => `${s}: ${n}`).join(" · ") || "0 mensagens"}</div></div>
            {l.status === "PREPARADO" && <form action={confirmarAction} className="flex flex-col gap-2">
              <input type="hidden" name="loteId" value={l.id}/>
              <input type="hidden" name="modo" value={real ? "REAL" : "SIMULACAO"}/>
              <label className="flex items-start gap-2 text-xs"><input type="checkbox" name="confirmacao" value="sim" required className="mt-0.5"/>
                Confirmo que revisei o aviso, os destinatários e o modo {real ? "REAL" : "SIMULAÇÃO"}.</label>
              <button className={btn}>{real ? "CONFIRMAR ENVIO REAL" : "Confirmar simulação"}</button>
            </form>}
          </div>;
        })}</div>
        <form action={processarAction}><button className={btn} type="submit">Processar até 10 mensagens da fila</button></form>
        {real && !credenciaisReaisValidas() && <p className="mt-2 text-sm text-red-600">Modo REAL configurado, mas faltam credenciais. Não processe a fila até completar o .env.</p>}
      </section>
      <section className={card}>
        <h2 className="text-lg font-bold">4. Consultar a imagem do horário</h2>
        <div className="flex flex-wrap gap-2">{["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO"].map((dia) =>
          <a key={dia} href={`/api/whatsapp/horario?dia=${dia}`} target="_blank" rel="noreferrer" className="rounded-lg border border-orange-500 px-3 py-2 text-sm font-semibold text-orange-800">{dia}</a>)}</div>
        <p className="mt-3 text-xs text-slate-500">Para envio de imagens pela Meta, a URL precisa ser pública e o semestre publicado.</p>
      </section>
      <section id="destinatarios-teste" className={card}>
        <h2 className="text-lg font-bold">5. Gerenciar destinatários de teste</h2>
        <p className="mt-1 text-sm text-slate-600">Cadastre seu próprio telefone para validar o fluxo. Esses contatos são identificados como <strong>somente simulação</strong> no banco e nunca entram em envios reais. Nenhuma mensagem será enviada ao telefone enquanto o modo for SIMULAÇÃO.</p>
        {!real ? <form action={cadastrarDestinatarioTesteAction} className="mt-4 space-y-3">
          <label className="block space-y-1 text-sm font-medium">Número com DDD
            <input type="tel" name="telefone" required className={input} placeholder="(69) 99999-9999" autoComplete="tel" maxLength={26}/>
          </label>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="autorizacao" value="sim" required className="mt-1"/>
            Este número é meu ou tenho autorização da pessoa para usá-lo em simulações.
          </label>
          <button type="submit" className={btn}>Adicionar destinatário de teste</button>
        </form> : <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Cadastro de testes indisponível no modo REAL. Inscrições reais só são feitas pelo comando INSCREVER no WhatsApp.</p>}
        <h3 className="mt-6 text-sm font-bold">Destinatários de teste ativos ({testesAtivos})</h3>
        <div className="mt-2 space-y-2">{destinatariosTeste.map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm">
          <div><strong>{mascararTelefone(a.telefone)}</strong><span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">Somente simulação</span></div>
          <form action={desativarDestinatarioTesteAction}>
            <input type="hidden" name="assinanteId" value={a.id}/>
            <button type="submit" className="rounded-lg border border-red-200 px-3 py-2 font-semibold text-red-700 hover:bg-red-50">Desativar</button>
          </form>
        </div>)}
        {!testesAtivos && <p className="text-sm text-slate-500">Ainda não há destinatários de teste.</p>}
        {testesAtivos > destinatariosTeste.length && <p className="text-xs text-slate-500">Exibindo os 50 cadastrados mais recentes.</p>}
        </div>
        <p className="mt-3 text-xs text-slate-500">A lista é fotografada quando você clica em Preparar. Se cadastrar alguém depois, o destinatário não entra automaticamente em um lote já preparado.</p>
      </section>
    </div>
  </main>;
}
