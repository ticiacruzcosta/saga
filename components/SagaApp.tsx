"use client";

// Tela única do SAGA (layout do protótipo v2.8). Os dados vêm do servidor em `dados`;
// as alterações passam pelas server actions de app/.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cadastrarOferta, conferirOferta, criarGrupo, criarProfessor, criarSala, enviarAviso, excluirCadastro,
  previaExclusao, salvarAlteracao, type TipoCadastro,
} from "@/app/actions";
import { confirmarImportacao, previsualizarImportacao } from "@/app/importacao";
import { aplicarRealocacao, aplicarResolucao, planejarResolucao, sugerirRealocacao } from "@/app/realocacao";
import { gerarProximaOferta, publicarOferta, selecionarOferta } from "@/app/ofertas";
import { proximoCodigo } from "@/lib/gerar-oferta";
import { diaDaData, diaMes, somarDias } from "@/lib/datas";
import CalendarioDia, { type Ocupacao } from "./CalendarioDia";
import type {
  DadosSaga, OfertaInput, PlanoResolucaoVM, PreviaImportacao, ResultadoGeracao, ResultadoOferta, SugestaoRealocacaoVM, TurmaVM,
} from "@/lib/tipos";

const ORDEM_DIA = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
const ordemDia = (d: string) => (ORDEM_DIA.includes(d) ? ORDEM_DIA.indexOf(d) : 99);
const porDiaHora = (a: TurmaVM, b: TurmaVM) =>
  ordemDia(a.dia) - ordemDia(b.dia) || a.horario.localeCompare(b.horario) || a.id - b.id;
const semTraco = (v: string) => (v === "—" ? "" : v);

const TITULOS: Record<string, string> = {
  dashboard: "HORÁRIO DO DIA",
  gerador: "MATRIZ DE OFERTA ACADÊMICA",
  "horario-semana": "QUADRO GERAL DA SEMANA",
  importar: "IMPORTAÇÃO DE PLANILHA",
  historico: "HISTÓRICO DE DISPAROS",
  turmas: "CADASTRO DE TURMAS",
  professores: "CORPO DOCENTE",
  salas: "CADASTRO DE SALAS E LABS",
  disciplinas: "CADASTRO DE OFERTAS",
  whatsapp: "BOT WHATSAPP",
};

const OPCOES_DIA = [
  ["SEGUNDA", "Segunda-Feira"], ["TERÇA", "Terça-Feira"], ["QUARTA", "Quarta-Feira"],
  ["QUINTA", "Quinta-Feira"], ["SEXTA", "Sexta-Feira"], ["SÁBADO", "Sábado"],
];

const FORM_VAZIO = {
  grupoId: "", nome: "", formato: "Presencial", cht: "", chp: "", profId: "", dia: "SEGUNDA",
  alunos: "", reqespaco: "Laboratório/Prático", lockSala: "", rodizio: "Não", inicio: "", fim: "",
};

function Selo({ tipo }: { tipo: "ok" | "erro" | "confirmar" }) {
  const cls =
    tipo === "ok" ? "bg-green-100 text-green-800"
    : tipo === "erro" ? "bg-red-100 text-red-800"
    : "bg-yellow-100 text-yellow-800";
  return (
    <span className={`${cls} text-xs px-2.5 py-1 rounded-full font-bold`}>
      {tipo === "ok" ? "OK" : tipo === "erro" ? "Conflito" : "Confirmar"}
    </span>
  );
}

export default function SagaApp({ dados }: { dados: DadosSaga }) {
  const router = useRouter();
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // filtros
  const [dashBusca, setDashBusca] = useState("");
  const [gTurma, setGTurma] = useState("TODOS");
  const [gDia, setGDia] = useState("TODOS");
  const [gProf, setGProf] = useState("TODOS");
  const [gEspaco, setGEspaco] = useState("TODOS");
  const [sDia, setSDia] = useState("TODOS");
  const [sProf, setSProf] = useState("TODOS");
  const [sTurma, setSTurma] = useState("TODOS");
  const [sBusca, setSBusca] = useState("");
  const [sAgrupar, setSAgrupar] = useState<"turma" | "prof" | "sala">("turma");

  // janelas
  const [modal, setModal] = useState<"" | "sala" | "professor" | "turma" | "disciplina" | "edit" | "whatsapp" | "realocar" | "resolver" | "gerar">("");
  const [editando, setEditando] = useState<TurmaVM | null>(null);
  const [editSala, setEditSala] = useState("");
  const [editProf, setEditProf] = useState("");
  const [waTurma, setWaTurma] = useState<TurmaVM | null>(null);

  const [sala, setSala] = useState({ nome: "", tipo: "Laboratório/Prático", cap: "", predio: "" });
  const [prof, setProf] = useState({ nome: "", email: "" });
  const [turma, setTurma] = useState({ nome: "", alunos: "", wa: "" });
  // cadastro sendo editado (null = cadastro novo); vale para sala, professor e turma
  const [editId, setEditId] = useState<number | null>(null);
  const [editAulaId, setEditAulaId] = useState<number | null>(null); // null = cadastrar oferta nova
  const [form, setForm] = useState(FORM_VAZIO);
  const [conf, setConf] = useState<ResultadoOferta | null>(null);
  const [pendente, iniciar] = useTransition();
  const contador = useRef(0);

  // importação de planilha
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [impCodigo, setImpCodigo] = useState(dados.oferta === "—" ? "" : dados.oferta);
  const [impSubstituir, setImpSubstituir] = useState(false);
  const [impPublicar, setImpPublicar] = useState(true);
  const [previa, setPrevia] = useState<PreviaImportacao | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  // realocação de aula com conflito
  const [sugestao, setSugestao] = useState<SugestaoRealocacaoVM | null>(null);
  const [opcaoEscolhida, setOpcaoEscolhida] = useState(0);
  const [plano, setPlano] = useState<PlanoResolucaoVM | null>(null);
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [realocAvisar, setRealocAvisar] = useState(true);

  // semestres
  const [gerAbrirPrimeiro, setGerAbrirPrimeiro] = useState(false);
  const [gerSubstituir, setGerSubstituir] = useState(false);
  const [geracao, setGeracao] = useState<ResultadoGeracao | null>(null);

  const fechar = () => setModal("");
  // Dashboard: data exibida. null = acompanha hoje (e vira sozinha à meia-noite)
  const [dataEscolhida, setDataEscolhida] = useState<string | null>(null);
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const dataVer = dataEscolhida ?? dados.dataHoje;
  const diaVer = diaDaData(dataVer); // null = domingo
  const ehHoje = dataVer === dados.dataHoje;
  const ehAmanha = dataVer === somarDias(dados.dataHoje, 1);
  const nomeDiaVer = OPCOES_DIA.find(([v]) => v === diaVer)?.[1] ?? "Domingo";
  function irPara(data: string) {
    setDataEscolhida(data === dados.dataHoje ? null : data);
    setCalendarioAberto(false);
  }
  function andarDia(passo: number) {
    let d = somarDias(dataVer, passo);
    if (!diaDaData(d)) d = somarDias(d, passo); // pula o domingo
    irPara(d);
  }

  // Salas livres por dia (para as cores do calendário): só as salas que o sistema controla
  const ocupacao = useMemo(() => {
    const controladas = new Set(dados.salas.map((s) => s.nome));
    const usadas = (dia: string, hoje: boolean) =>
      new Set(
        dados.turmas
          .filter((t) => t.dia === dia && !t.consome && t.formato !== "Assíncrona" && t.formato !== "Síncrona")
          .map((t) => (hoje ? t.sala : t.salaGrade))
          .filter((s) => controladas.has(s))
      ).size;
    return (data: string): Ocupacao | null => {
      const dia = diaDaData(data);
      if (!dia) return null;
      return { livres: controladas.size - usadas(dia, data === dados.dataHoje), total: controladas.size };
    };
  }, [dados]);

  // Virou o dia (meia-noite em Porto Velho)? Busca os dados de novo, sem precisar de F5.
  useEffect(() => {
    const dataHoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Porto_Velho" }).format(new Date());
    let ultima = dataHoje();
    const timer = setInterval(() => {
      if (dataHoje() === ultima) return;
      ultima = dataHoje();
      setDataEscolhida(null);
      router.refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [router]);

  const titulo =
    tab === "dashboard"
      ? `HORÁRIO DO DIA: ${nomeDiaVer.toUpperCase()}, ${diaMes(dataVer)}`
      : TITULOS[tab] ?? "FACULDADE UNISAPIENS";

  // ---------------------------------------------------------------- dados derivados
  const dashboard = useMemo(() => {
    const termo = dashBusca.trim().toLowerCase();
    return dados.turmas
      .filter((t) => diaVer && t.dia === diaVer && !t.consome)
      // Troca pontual (lápis) só vale hoje: nos outros dias mostra a grade normal
      .map((t) => (ehHoje ? t : { ...t, sala: t.salaGrade, prof: t.profGrade, alteradaHoje: false }))
      .filter((t) => !termo || `${t.turma} ${t.nome} ${t.prof} ${t.sala}`.toLowerCase().includes(termo))
      .sort(porDiaHora);
  }, [dados, dashBusca, diaVer, ehHoje]);

  const grade = useMemo(
    () =>
      dados.turmas
        .filter((t) => gTurma === "TODOS" || t.turma === gTurma)
        .filter((t) => gDia === "TODOS" || t.dia === gDia)
        .filter((t) => gProf === "TODOS" || t.prof === gProf)
        .filter((t) => gEspaco === "TODOS" || t.reqespaco === gEspaco)
        .sort(porDiaHora),
    [dados, gTurma, gDia, gProf, gEspaco]
  );

  // Quadro da semana: sempre a grade normal (sala/professor sem a troca de hoje; a troca aparece como marca no cartão)
  const semana = useMemo(() => {
    const termo = sBusca.toLowerCase();
    const aulas = dados.turmas
      .filter((t) => sDia === "TODOS" || t.dia === sDia)
      .filter((t) => sProf === "TODOS" || t.profGrade === sProf)
      .filter((t) => sTurma === "TODOS" || t.turma === sTurma)
      .filter((t) => !termo || `${t.dia} ${t.turma} ${t.nome} ${t.profGrade} ${t.salaGrade} ${t.formato}`.toLowerCase().includes(termo))
      // por professor/sala, quem assiste junto repetiria o mesmo cartão
      .filter((t) => sAgrupar === "turma" || !t.consome)
      .filter((t) => sAgrupar !== "sala" || !["Sala comum", "EAD"].includes(t.salaGrade))
      .sort(porDiaHora);
    const chave = (t: TurmaVM) => (sAgrupar === "turma" ? t.turma : sAgrupar === "prof" ? t.profGrade : t.salaGrade);
    const linhas = new Map<string, Map<string, TurmaVM[]>>();
    for (const t of aulas) {
      const k = chave(t);
      if (!linhas.has(k)) linhas.set(k, new Map());
      const col = t.dia || "EAD";
      linhas.get(k)!.set(col, [...(linhas.get(k)!.get(col) ?? []), t]);
    }
    const colunas = [...ORDEM_DIA.filter((d) => sDia === "TODOS" || d === sDia), ...(aulas.some((t) => !t.dia) ? ["EAD"] : [])];
    return { linhas: [...linhas.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR", { numeric: true })), colunas, total: aulas.length };
  }, [dados, sDia, sProf, sTurma, sBusca, sAgrupar]);

  // ---------------------------------------------------------------- nova oferta
  const entrada: OfertaInput = useMemo(
    () => ({
      grupoId: form.grupoId ? Number(form.grupoId) : null,
      nome: form.nome, formato: form.formato, cht: form.cht, chp: form.chp,
      profId: form.profId ? Number(form.profId) : null,
      dia: form.dia, alunos: form.alunos ? Number(form.alunos) : null,
      reqespaco: form.reqespaco, lockSala: form.lockSala, rodizio: form.rodizio,
      turmaId: editAulaId, inicio: form.inicio, fim: form.fim,
    }),
    [form, editAulaId]
  );

  // Confere sozinho (depois de 0,4 s sem digitar) enquanto a janela está aberta
  useEffect(() => {
    if (modal !== "disciplina" || !entrada.grupoId || !entrada.nome.trim()) {
      setConf(null);
      return;
    }
    const minha = ++contador.current;
    const espera = setTimeout(async () => {
      const r = await conferirOferta(entrada);
      if (minha === contador.current) setConf(r);
    }, 400);
    return () => clearTimeout(espera);
  }, [entrada, modal]);

  function abrirNovaOferta() {
    setEditAulaId(null);
    setForm({ ...FORM_VAZIO, grupoId: dados.grupos[0] ? String(dados.grupos[0].id) : "" });
    setConf(null);
    setModal("disciplina");
  }

  function salvarOferta() {
    iniciar(async () => {
      const r = await cadastrarOferta(entrada);
      if (r.ok) {
        alert(`${editAulaId ? "Oferta atualizada" : "Oferta cadastrada"}: ${r.resumo}`);
        setModal("");
        router.refresh();
      } else {
        setConf(r);
        if (r.erro) alert(r.erro);
      }
    });
  }

  const temErro = Boolean(conf?.conflitos.some((c) => c.gravidade === "ERRO"));
  const f = (campo: keyof typeof FORM_VAZIO) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((x) => ({ ...x, [campo]: e.target.value }));

  // ---------------------------------------------------------------- importar planilha
  function formImportacao() {
    const fd = new FormData();
    if (arquivo) fd.set("arquivo", arquivo);
    fd.set("codigo", impCodigo);
    if (impSubstituir) fd.set("substituir", "on");
    if (impPublicar) fd.set("publicar", "on");
    return fd;
  }
  function escolherArquivo(f: File | null | undefined) {
    setArquivo(f ?? null);
    setPrevia(null);
  }
  function previsualizar() {
    iniciar(async () => setPrevia(await previsualizarImportacao(formImportacao())));
  }
  function importar() {
    iniciar(async () => {
      const r = await confirmarImportacao(formImportacao());
      setPrevia(r);
      if (r.gravado) {
        alert(`Oferta ${r.codigo} importada: ${r.turmas} turmas.`);
        router.refresh();
      } else if (r.erro) alert(r.erro);
    });
  }

  // ---------------------------------------------------------------- realocar
  function abrirRealocar(turmaId: number) {
    setSugestao(null);
    setOpcaoEscolhida(0);
    setModal("realocar");
    iniciar(async () => setSugestao(await sugerirRealocacao(turmaId)));
  }
  function confirmarRealocar() {
    const o = sugestao?.opcoes?.[opcaoEscolhida];
    if (!sugestao?.turmaId || !o) return;
    iniciar(async () => {
      const r = await aplicarRealocacao({ turmaId: sugestao.turmaId!, dia: o.dia, inicio: o.inicio, fim: o.fim, ambienteId: o.ambienteId, avisar: realocAvisar });
      if (!r.ok) return alert(r.erro);
      alert(`Aula realocada: ${r.resumo}`);
      setModal("");
      router.refresh();
    });
  }
  function abrirResolverTodos() {
    setPlano(null);
    setModal("resolver");
    iniciar(async () => {
      const p = await planejarResolucao();
      setPlano(p);
      setMarcados(new Set(p.movimentos.map((m) => m.turmaId)));
    });
  }
  function confirmarResolverTodos() {
    if (!plano) return;
    const itens = plano.movimentos
      .filter((m) => marcados.has(m.turmaId))
      .map((m) => ({ turmaId: m.turmaId, dia: m.opcao.dia, inicio: m.opcao.inicio, fim: m.opcao.fim, ambienteId: m.opcao.ambienteId, avisar: realocAvisar }));
    if (itens.length === 0) return alert("Marque pelo menos uma mudança.");
    iniciar(async () => {
      const r = await aplicarResolucao(itens);
      alert(`${r.aplicadas} aula(s) realocada(s).${r.falhas.length ? `\n\nNão aplicadas:\n${r.falhas.join("\n")}` : ""}`);
      setModal("");
      router.refresh();
    });
  }

  // ---------------------------------------------------------------- semestres
  function trocarOferta(codigo: string) {
    iniciar(async () => {
      await selecionarOferta(codigo);
      router.refresh();
    });
  }
  function publicar(codigo: string) {
    if (!confirm(`Publicar ${codigo}? Ele passa a ser o semestre que vale para todos (o atual é arquivado).`)) return;
    iniciar(async () => {
      const r = await publicarOferta(codigo);
      if (!r.ok) return alert(r.erro);
      router.refresh();
    });
  }
  function abrirGerar() {
    setGeracao(null);
    setGerSubstituir(false);
    setModal("gerar");
  }
  function gerar() {
    iniciar(async () => {
      const r = await gerarProximaOferta({ abrirPrimeiro: gerAbrirPrimeiro, substituir: gerSubstituir });
      setGeracao(r);
      if (r.ok) router.refresh();
    });
  }

  // ---------------------------------------------------------------- cadastros
  function abrirCadastro(tipo: "sala" | "professor" | "turma", id: number | null = null) {
    setEditId(id);
    if (tipo === "sala") {
      const x = dados.salas.find((v) => v.id === id);
      setSala(x ? { nome: x.nome, tipo: x.tipo, cap: x.cap != null ? String(x.cap) : "", predio: semTraco(x.predio) } : { nome: "", tipo: "Laboratório/Prático", cap: "", predio: "" });
    }
    if (tipo === "professor") {
      const x = dados.professores.find((v) => v.id === id);
      setProf(x ? { nome: x.nome, email: semTraco(x.email) } : { nome: "", email: "" });
    }
    if (tipo === "turma") {
      const x = dados.grupos.find((v) => v.id === id);
      setTurma(x ? { nome: x.nome, alunos: x.alunos != null ? String(x.alunos) : "", wa: semTraco(x.wa) } : { nome: "", alunos: "", wa: "" });
    }
    setModal(tipo);
  }
  function salvarSala() {
    if (!sala.nome) return alert("Informe a identificação!");
    iniciar(async () => {
      const r = await criarSala({ id: editId ?? undefined, nome: sala.nome, tipo: sala.tipo, cap: sala.cap ? Number(sala.cap) : null, predio: sala.predio });
      if (!r.ok) return alert(r.erro);
      setSala({ nome: "", tipo: "Laboratório/Prático", cap: "", predio: "" });
      setModal("");
      router.refresh();
    });
  }
  function salvarProfessor() {
    if (!prof.nome) return alert("Informe o nome!");
    iniciar(async () => {
      const r = await criarProfessor({ id: editId ?? undefined, ...prof });
      if (!r.ok) return alert(r.erro);
      setProf({ nome: "", email: "" });
      setModal("");
      router.refresh();
    });
  }
  function salvarTurma() {
    if (!turma.nome) return alert("Informe a turma!");
    iniciar(async () => {
      const r = await criarGrupo({ id: editId ?? undefined, nome: turma.nome, alunos: turma.alunos ? Number(turma.alunos) : null, wa: turma.wa });
      if (!r.ok) return alert(r.erro);
      setTurma({ nome: "", alunos: "", wa: "" });
      setModal("");
      router.refresh();
    });
  }
  /** Mostra o que vai mudar, pede confirmação e exclui. */
  function excluir(tipo: TipoCadastro, id: number) {
    iniciar(async () => {
      const p = await previaExclusao(tipo, id);
      if (!p.pode) return alert(p.mensagem);
      if (!confirm(p.mensagem)) return;
      const r = await excluirCadastro(tipo, id);
      if (!r.ok) return alert(r.erro);
      setModal("");
      router.refresh();
    });
  }
  function abrirEdicaoAula(t: TurmaVM) {
    setEditAulaId(t.id);
    setForm({
      grupoId: t.grupoId ? String(t.grupoId) : "", nome: t.nome, formato: t.formato,
      cht: t.cht.replace("h", ""), chp: t.chp.replace("h", ""), profId: t.profId ? String(t.profId) : "",
      dia: t.dia || "SEGUNDA", alunos: t.vagas != null ? String(t.vagas) : "", reqespaco: t.reqespaco,
      // a sala atual fica travada; "Nenhuma (Automático)" deixa o sistema procurar outra
      lockSala: dados.salas.some((x) => x.nome === t.salaGrade) ? t.salaGrade : "",
      rodizio: t.rodizio, inicio: t.inicio || "19:00", fim: t.fim || "21:45",
    });
    setConf(null);
    setModal("disciplina");
  }

  // ---------------------------------------------------------------- dashboard
  function abrirEdicao(t: TurmaVM) {
    setEditando(t);
    setEditSala(String(dados.salas.find((s) => s.nome === t.sala)?.id ?? ""));
    setEditProf(String(dados.professores.find((p) => p.nome === t.prof)?.id ?? ""));
    setModal("edit");
  }
  function salvarEdicao() {
    if (!editando) return;
    iniciar(async () => {
      await salvarAlteracao({
        turmaId: editando.id,
        salaId: editSala ? Number(editSala) : null,
        profId: editProf ? Number(editProf) : null,
      });
      setModal("");
      router.refresh();
    });
  }
  const textoAviso = (t: TurmaVM) =>
    `Turma ${t.turma}: A aula de ${t.nome} ${ehHoje ? "hoje" : ehAmanha ? "amanhã" : `na ${nomeDiaVer} (${diaMes(dataVer)})`} será na sala/lab ${t.sala} com o(a) ${t.prof}.`;
  function abrirWhatsApp(t: TurmaVM) {
    setWaTurma(t);
    setModal("whatsapp");
  }
  function enviarDisparo() {
    if (!waTurma) return;
    iniciar(async () => {
      const r = await enviarAviso({ turmaId: waTurma.id, mensagem: textoAviso(waTurma) });
      if (!r.ok) return alert(r.erro);
      alert("Aviso registrado! O bot envia para o grupo da turma.");
      setModal("");
      router.refresh();
    });
  }
  const avisosPendentes = dados.avisos.filter((a) => a.status === "Pendente").length;

  // ---------------------------------------------------------------- peças repetidas
  const navBtn = (id: string, icone: string, nome: string, iconeCls = "text-gray-400", nomeCls = "") => (
    <li>
      <button
        onClick={() => setTab(id)}
        title={nome}
        className={`nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
          tab === id ? "bg-[#F39200] text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
        }`}
      >
        <i className={`${icone} w-5 text-center shrink-0 ${tab === id ? "" : iconeCls}`}></i>
        <span className={`${sidebarOpen ? "" : "hidden"} truncate ${nomeCls}`}>{nome}</span>
      </button>
    </li>
  );

  const inp = "w-full border border-gray-200 rounded-lg p-2.5";
  const filtroSel = "w-full border border-gray-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-[#F39200]";
  const cancelar = "px-4 py-2 border border-gray-200 rounded-lg text-sm";
  const salvar = "px-4 py-2 bg-[#F39200] text-white font-bold rounded-lg text-sm";

  return (
    <div
      className="bg-[#F4F6F9] text-gray-800 flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white"
      style={{ fontFamily: 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"' }}
    >
      <style>{`button:not(:disabled){cursor:pointer} input::placeholder{color:#9ca3af} @page{size:landscape;margin:10mm}`}</style>

      <aside className={`print:hidden ${sidebarOpen ? "w-64" : "w-16"} bg-[#1A2332] text-white flex flex-col justify-between shrink-0 shadow-lg transition-all duration-300 relative z-20`}>
        <div>
          <div className="p-4 border-b border-gray-700/50 flex items-center justify-between">
            <div className={`${sidebarOpen ? "" : "hidden"} flex items-center gap-3`}>
              <div className="bg-[#F39200] text-white p-2 rounded-xl font-bold text-lg shadow-md shrink-0">US</div>
              <div className="overflow-hidden">
                <h1 className="font-bold tracking-wide text-[#F39200] leading-tight text-xs">FACULDADE</h1>
                <h2 className="font-black text-sm text-white tracking-wider leading-none">UNISAPIENS</h2>
                <span className="text-[9px] text-gray-400 font-mono tracking-widest block mt-0.5">SAGA v2.8</span>
              </div>
            </div>
            <button onClick={() => setSidebarOpen((v) => !v)} className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition" title="Alternar Menu">
              <i className="fa-solid fa-bars-staggered"></i>
            </button>
          </div>

          <nav className="p-3 space-y-5 text-sm">
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3`}>Operacional</p>
              <ul className="space-y-1">
                {navBtn("dashboard", "fa-solid fa-gauge", "Dashboard (Hoje)")}
                {navBtn("gerador", "fa-solid fa-calendar-days", "Grade do Semestre", "text-[#F39200]", "font-bold text-white")}
                {navBtn("horario-semana", "fa-solid fa-calendar-week", "Horário da Semana")}
                {navBtn("importar", "fa-solid fa-file-import", "Importar Planilha")}
                {navBtn("historico", "fa-solid fa-clock-rotate-left", "Histórico de Avisos")}
              </ul>
            </div>
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3`}>Cadastros Base</p>
              <ul className="space-y-1">
                {navBtn("turmas", "fa-solid fa-people-group", "Cursos & Turmas")}
                {navBtn("professores", "fa-solid fa-chalkboard-user", "Professores")}
                {navBtn("salas", "fa-solid fa-door-open", "Salas & Laboratórios")}
                {navBtn("disciplinas", "fa-solid fa-book", "Ofertas & Disciplinas")}
              </ul>
            </div>
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3`}>Sistema</p>
              <ul className="space-y-1">{navBtn("whatsapp", "fa-brands fa-whatsapp", "Status do Bot", "text-gray-400")}</ul>
            </div>
          </nav>
        </div>

        <div className="p-3 border-t border-gray-700/50 flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-[#F39200] text-white flex items-center justify-center font-bold text-xs shrink-0">A</div>
          <div className={`${sidebarOpen ? "" : "hidden"} overflow-hidden`}>
            <p className="text-xs font-medium text-white truncate">Coordenação / Admin</p>
            <p className="text-[10px] text-gray-400 truncate">admin@unisapiens.edu.br</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto print:overflow-visible">
        <header className="print:hidden bg-white border-b border-gray-200 px-8 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen((v) => !v)} className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition mr-1" title="Alternar Menu">
              <i className="fa-solid fa-bars"></i>
            </button>
            <h2 className="text-xl font-bold text-[#1A2332]">{titulo}</h2>
            {avisosPendentes > 0 && (
              <button onClick={() => setTab("historico")} className="bg-yellow-100 text-yellow-800 text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5">
                <i className="fa-brands fa-whatsapp"></i> {avisosPendentes} aviso(s) pendente(s)
              </button>
            )}
          </div>
        </header>

        <div className="p-8">
          {dados.oferta !== "—" && dados.oferta !== dados.ofertaPublicada && (
            <div className="print:hidden mb-6 bg-yellow-50 border border-yellow-300 text-yellow-900 rounded-xl p-4 text-sm flex flex-wrap items-center gap-3 justify-between">
              <span>
                <i className="fa-solid fa-eye mr-1"></i> Você está vendo <b>{dados.oferta}</b> ({dados.ofertaStatus.toLowerCase()}).
                {dados.ofertaPublicada ? <> O semestre que vale para todos é <b>{dados.ofertaPublicada}</b>.</> : " Nenhum semestre publicado."}
              </span>
              <span className="flex gap-2">
                {dados.ofertaPublicada && <button onClick={() => trocarOferta(dados.ofertaPublicada!)} className={cancelar}>Ver {dados.ofertaPublicada}</button>}
                {dados.ofertaStatus !== "PUBLICADA" && <button onClick={() => publicar(dados.oferta)} className={salvar}>Publicar {dados.oferta}</button>}
              </span>
            </div>
          )}
          {/* 1. DASHBOARD (HOJE) */}
          {tab === "dashboard" && (
            <section className="space-y-6">
              <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex gap-4 items-center justify-between">
                <div className="relative flex-1 max-w-md">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400"></i>
                  <input
                    type="text" value={dashBusca} onChange={(e) => setDashBusca(e.target.value)}
                    placeholder="Filtrar por turma, professor ou sala..."
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F39200]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => andarDia(-1)} title="Dia anterior" className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:text-[#F39200] hover:border-[#F39200]">
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>
                  <div className="relative">
                    {/* clicar ou segurar (toque longo / botão direito) abre o calendário */}
                    <button
                      onClick={() => setCalendarioAberto((v) => !v)}
                      onContextMenu={(e) => { e.preventDefault(); setCalendarioAberto(true); }}
                      title="Abrir calendário"
                      className="text-center min-w-[10rem] px-2 py-1 rounded-lg hover:bg-orange-50 select-none"
                    >
                      <div className="text-sm font-bold text-[#1A2332]">
                        <i className="fa-regular fa-calendar text-[#F39200] mr-1"></i>{nomeDiaVer}, {diaMes(dataVer)}
                      </div>
                      <div className={`text-[11px] font-semibold ${ehHoje ? "text-green-600" : "text-[#F39200]"}`}>
                        {ehHoje ? (diaVer ? "Hoje" : "Hoje (sem aulas)") : ehAmanha ? "Amanhã" : dataVer < dados.dataHoje ? "Já passou" : "Outro dia"}
                      </div>
                    </button>
                    {calendarioAberto && (
                      <CalendarioDia hoje={dados.dataHoje} selecionada={dataVer} ocupacao={ocupacao} onEscolher={irPara} onFechar={() => setCalendarioAberto(false)} />
                    )}
                  </div>
                  <button onClick={() => andarDia(1)} title="Próximo dia" className="w-8 h-8 rounded-lg border border-gray-200 text-gray-600 hover:text-[#F39200] hover:border-[#F39200]">
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                  {dataEscolhida && (
                    <button onClick={() => setDataEscolhida(null)} className="text-xs font-bold text-[#F39200] hover:underline ml-1">Voltar para hoje</button>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#1A2332] text-white text-xs uppercase tracking-wider">
                      <th className="p-4">Turma / Disciplina / Professor</th>
                      <th className="p-4">Formato</th>
                      <th className="p-4">Sala / Laboratório</th>
                      <th className="p-4">Prédio / Andar</th>
                      <th className="p-4 text-center">Modo Alocação</th>
                      <th className="p-4 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-sm">
                    {dashboard.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-400">Nenhuma aula neste dia.</td></tr>
                    )}
                    {dashboard.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50 transition">
                        <td className="p-4">
                          <div className="font-bold text-gray-900">{d.turma}</div>
                          <div className="text-xs text-gray-600">{d.nome} - {d.prof} · {d.horario}</div>
                          {d.tambemAtende.length > 0 && <div className="text-xs text-blue-600">Também atende: {d.tambemAtende.join(", ")}</div>}
                        </td>
                        <td className="p-4"><span className="text-xs bg-gray-100 px-2 py-1 rounded font-semibold">{d.formato}</span></td>
                        <td className="p-4 font-bold text-[#F39200]">
                          {d.sala}
                          {d.alteradaHoje && <div className="text-[10px] font-semibold text-blue-600">alterada hoje</div>}
                        </td>
                        <td className="p-4 text-xs text-gray-500">{d.predio}</td>
                        <td className="p-4 text-center">
                          <span className="bg-orange-100 text-[#F39200] text-xs px-2.5 py-1 rounded-full font-bold">{d.rodizio !== "Não" ? "Rodízio Ativo" : "Alocação Fixa"}</span>
                        </td>
                        <td className="p-4 text-center">
                          <div className="flex justify-center gap-2">
                            {/* O lápis grava a troca para HOJE: só aparece quando o dia exibido é hoje */}
                            {ehHoje && <button onClick={() => abrirEdicao(d)} className="p-2 text-gray-600 hover:text-[#F39200]"><i className="fa-solid fa-pen"></i></button>}
                            <button onClick={() => abrirWhatsApp(d)} className="bg-[#F39200] text-white px-3 py-1.5 rounded-lg text-xs font-semibold"><i className="fa-brands fa-whatsapp"></i> Aviso</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 2. GRADE DO SEMESTRE */}
          {tab === "gerador" && (
            <section className="space-y-5">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-4 border-b border-gray-200 pb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-[#1A2332]">Matriz de Oferta Acadêmica</h3>
                    <select value={dados.oferta} onChange={(e) => trocarOferta(e.target.value)} className="bg-gray-100 text-gray-700 font-mono text-xs px-2 py-1 rounded-md font-bold border-0">
                      {dados.ofertas.map((o) => <option key={o.codigo} value={o.codigo}>{o.codigo} · {o.status === "PUBLICADA" ? "publicada" : o.status === "RASCUNHO" ? "rascunho" : "arquivada"}</option>)}
                    </select>
                    {dados.oferta !== "—" && (
                      <button onClick={abrirGerar} className="text-xs font-bold text-[#F39200] hover:underline flex items-center gap-1">
                        <i className="fa-solid fa-forward"></i> Gerar {proximoCodigo(dados.oferta)}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dados.totalConflitos === 0 ? (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5">
                        <i className="fa-solid fa-circle-check text-green-500"></i> 0 Conflitos Detectados
                      </span>
                    ) : (
                      <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5">
                        <i className="fa-solid fa-triangle-exclamation text-red-500"></i> {dados.totalConflitos} Conflitos Detectados
                      </span>
                    )}
                    {dados.totalConfirmar > 0 && (
                      <span className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-lg font-semibold">
                        {dados.totalConfirmar} para confirmar
                      </span>
                    )}
                    {dados.totalConflitos > 0 && (
                      <button onClick={abrirResolverTodos} className="bg-[#F39200] hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5">
                        <i className="fa-solid fa-wand-magic-sparkles"></i> Resolver Conflitos
                      </button>
                    )}
                    <button onClick={() => router.refresh()} title="Busca os dados de novo e reconfere os choques" className="bg-[#1A2332] hover:bg-[#111722] text-white px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5">
                      <i className="fa-solid fa-arrows-rotate"></i> Atualizar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Curso / Turma</label>
                    <select value={gTurma} onChange={(e) => setGTurma(e.target.value)} className={filtroSel}>
                      <option value="TODOS">Todos os Cursos</option>
                      {dados.grupos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Dia da Semana</label>
                    <select value={gDia} onChange={(e) => setGDia(e.target.value)} className={filtroSel}>
                      <option value="TODOS">Todos os Dias</option>
                      {OPCOES_DIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Professor</label>
                    <select value={gProf} onChange={(e) => setGProf(e.target.value)} className={filtroSel}>
                      <option value="TODOS">Todos os Professores</option>
                      {dados.professores.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de Ambiente</label>
                    <select value={gEspaco} onChange={(e) => setGEspaco(e.target.value)} className={filtroSel}>
                      <option value="TODOS">Todos os Tipos</option>
                      <option value="Laboratório/Prático">Laboratórios</option>
                      <option value="Presencial Teórico">Salas Teóricas</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#1A2332] text-white text-xs uppercase tracking-wider">
                      <th className="p-3.5">Dia</th>
                      <th className="p-3.5">Turma / Curso</th>
                      <th className="p-3.5">Disciplina / Docente</th>
                      <th className="p-3.5">Formato</th>
                      <th className="p-3.5">Sala / Lab Alocado</th>
                      <th className="p-3.5 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-sm">
                    {grade.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-400">Nenhuma turma com esses filtros.</td></tr>}
                    {grade.map((d) => {
                      const erro = d.conflitos.some((c) => c.gravidade === "ERRO");
                      return (
                        <tr key={d.id} className="hover:bg-gray-50 align-top">
                          <td className="p-3.5 font-bold text-gray-700">
                            {d.dia || "—"}
                            {d.horario !== "—" && <div className="text-xs font-normal text-gray-400">{d.horario}</div>}
                          </td>
                          <td className="p-3.5 font-semibold">
                            {d.turma} {d.alunos != null && <span className="text-xs font-normal text-gray-500">({d.alunos} alunos)</span>}
                          </td>
                          <td className="p-3.5">
                            {d.nome}
                            <div className="text-xs text-gray-500">{d.prof}</div>
                            {d.consome && <div className="text-xs text-blue-600">assiste turma de outro curso</div>}
                          </td>
                          <td className="p-3.5"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{d.formato}</span></td>
                          <td className="p-3.5 font-bold text-[#F39200]">
                            {d.sala} <span className="text-xs font-normal text-gray-500">({d.reqespaco})</span>
                          </td>
                          <td className="p-3.5 text-center">
                            {d.conflitos.length === 0 ? <Selo tipo="ok" /> : <Selo tipo={erro ? "erro" : "confirmar"} />}
                            {d.conflitos.map((c, i) => (
                              <div key={i} className="text-[10px] text-gray-500 text-left mt-1 max-w-xs">{c.mensagem}</div>
                            ))}
                            {d.conflitos.length > 0 && !d.consome && d.dia && (
                              <button onClick={() => abrirRealocar(d.id)} className="mt-2 text-xs font-bold text-[#F39200] hover:underline flex items-center gap-1">
                                <i className="fa-solid fa-right-left"></i> Realocar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 3. HORÁRIO DA SEMANA */}
          {tab === "horario-semana" && (
            <section className="space-y-4">
              <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4 print:hidden">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-sm font-bold text-[#1A2332] uppercase tracking-wider flex items-center gap-2">
                    <i className="fa-solid fa-filter text-[#F39200]"></i> Filtros do Quadro Geral
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">Linhas por:</span>
                    {([["turma", "Turma"], ["prof", "Professor"], ["sala", "Sala / Lab"]] as const).map(([v, l]) => (
                      <button key={v} onClick={() => setSAgrupar(v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${sAgrupar === v ? "bg-[#1A2332] text-white border-[#1A2332]" : "border-gray-200 text-gray-600 hover:border-[#F39200]"}`}>
                        {l}
                      </button>
                    ))}
                    <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:border-[#F39200]">
                      <i className="fa-solid fa-print mr-1"></i>Imprimir
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Dia da Semana</label>
                    <select value={sDia} onChange={(e) => setSDia(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm">
                      <option value="TODOS">Todos os Dias</option>
                      {OPCOES_DIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Professor</label>
                    <select value={sProf} onChange={(e) => setSProf(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm">
                      <option value="TODOS">Todos os Professores</option>
                      {dados.professores.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Curso / Turma</label>
                    <select value={sTurma} onChange={(e) => setSTurma(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm">
                      <option value="TODOS">Todas as Turmas</option>
                      {dados.grupos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Busca Direta</label>
                    <input type="text" value={sBusca} onChange={(e) => setSBusca(e.target.value)} placeholder="Ex: LAB01, Irvine..." className="w-full border border-gray-200 rounded-lg p-2 text-sm" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto print:shadow-none print:border-0">
                {semana.total === 0 ? (
                  <p className="p-8 text-center text-gray-400">Nada encontrado.</p>
                ) : (
                  <table className="w-full border-collapse text-xs min-w-[900px]">
                    <thead>
                      <tr className="bg-[#1A2332] text-white uppercase tracking-wider">
                        <th className="p-3 text-left w-44 sticky left-0 bg-[#1A2332]">{sAgrupar === "turma" ? "Turma" : sAgrupar === "prof" ? "Professor" : "Sala / Lab"}</th>
                        {semana.colunas.map((c) => (
                          <th key={c} className={`p-3 text-left ${c === dados.diaHoje ? "bg-[#F39200]" : ""}`}>
                            {c === "EAD" ? "EAD / sem dia" : OPCOES_DIA.find(([v]) => v === c)?.[1]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {semana.linhas.map(([nome, porDia]) => (
                        <tr key={nome} className="align-top break-inside-avoid">
                          <td className="p-3 font-bold text-[#1A2332] sticky left-0 bg-white border-r border-gray-100">{nome}</td>
                          {semana.colunas.map((c) => (
                            <td key={c} className={`p-2 space-y-1.5 ${c === dados.diaHoje ? "bg-orange-50/50" : ""}`}>
                              {(porDia.get(c) ?? []).map((a) => {
                                const erro = a.conflitos.some((x) => x.gravidade === "ERRO");
                                const corFormato =
                                  a.formato === "Híbrida" ? "border-l-purple-500" : a.formato === "Síncrona" ? "border-l-teal-500"
                                  : a.formato === "Assíncrona" ? "border-l-gray-400" : "border-l-[#1A2332]";
                                const trocaHoje = a.alteradaHoje && a.dia === dados.diaHoje;
                                return (
                                  <div key={a.id} title={a.conflitos.map((x) => x.mensagem).join("\n") || undefined}
                                    className={`rounded-md border border-l-4 ${corFormato} ${erro ? "border-red-400 bg-red-50" : "border-gray-200 bg-gray-50"} p-2 leading-snug`}>
                                    <div className="font-semibold text-gray-900">{a.nome}</div>
                                    {a.horario !== "—" && <div className="text-gray-500">{a.horario}</div>}
                                    {sAgrupar !== "turma" && <div className="text-gray-600">{a.turma}</div>}
                                    {sAgrupar !== "prof" && <div className="text-gray-600">{a.profGrade}</div>}
                                    {sAgrupar !== "sala" && <div className="font-bold text-[#F39200]">{a.salaGrade}</div>}
                                    {a.formato !== "Presencial" && <div className="text-gray-400">{a.formato}</div>}
                                    {a.consome && <div className="text-blue-600">assiste com outro curso</div>}
                                    {trocaHoje && (
                                      <div className="mt-1 text-[10px] font-bold text-blue-700 bg-blue-50 rounded px-1">
                                        hoje: {a.sala !== a.salaGrade ? a.sala : ""}{a.sala !== a.salaGrade && a.prof !== a.profGrade ? " · " : ""}{a.prof !== a.profGrade ? a.prof : ""}
                                      </div>
                                    )}
                                    {erro && <div className="mt-1 text-[10px] font-bold text-red-700">conflito</div>}
                                  </div>
                                );
                              })}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-[11px] text-gray-500 print:hidden">
                <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-[#1A2332] bg-gray-100 mr-1"></span>Presencial</span>
                <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-purple-500 bg-gray-100 mr-1"></span>Híbrida</span>
                <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-teal-500 bg-gray-100 mr-1"></span>Síncrona</span>
                <span><span className="inline-block w-3 h-3 align-middle border-l-4 border-l-gray-400 bg-gray-100 mr-1"></span>Assíncrona</span>
                <span><span className="inline-block w-3 h-3 align-middle border border-red-400 bg-red-50 mr-1"></span>Com conflito</span>
                <span className="text-[#F39200] font-semibold">Coluna laranja = hoje</span>
              </div>
            </section>
          )}

          {/* 4. IMPORTAR PLANILHA */}
          {tab === "importar" && (
            <section className="space-y-6">
              <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 max-w-2xl mx-auto text-center space-y-4">
                <div className="w-16 h-16 bg-orange-100 text-[#F39200] rounded-full flex items-center justify-center mx-auto text-2xl">
                  <i className="fa-solid fa-cloud-arrow-up"></i>
                </div>
                <h3 className="text-lg font-bold text-[#1A2332]">Importar Planilha de Oferta (.XLSX)</h3>
                <input ref={inputArquivo} type="file" accept=".xlsx" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
                <div
                  onClick={() => inputArquivo.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => { e.preventDefault(); escolherArquivo(e.dataTransfer.files?.[0]); }}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 hover:border-[#F39200] transition cursor-pointer bg-gray-50"
                >
                  <i className="fa-regular fa-file-excel text-4xl text-green-600 mb-2"></i>
                  <p className="text-sm font-semibold text-gray-700">{arquivo ? arquivo.name : "Clique ou arraste o arquivo aqui"}</p>
                  {arquivo && <p className="text-xs text-gray-400">{(arquivo.size / 1024).toFixed(0)} KB</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                  <label className="block text-sm font-semibold text-gray-700">
                    Semestre da oferta
                    <input value={impCodigo} onChange={(e) => { setImpCodigo(e.target.value); setPrevia(null); }} placeholder="2027.1" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-normal" />
                  </label>
                  <div className="space-y-2 text-sm text-gray-700 pt-6">
                    <label className="flex items-center gap-2"><input type="checkbox" checked={impPublicar} onChange={(e) => setImpPublicar(e.target.checked)} /> Publicar (passa a ser a oferta exibida)</label>
                    {previa?.ofertaExistente && (
                      <label className="flex items-center gap-2 text-red-700 font-semibold"><input type="checkbox" checked={impSubstituir} onChange={(e) => setImpSubstituir(e.target.checked)} /> Substituir a oferta {previa.codigo}</label>
                    )}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={previsualizar} disabled={!arquivo || pendente} className="bg-[#1A2332] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex-1">
                    {pendente ? "Lendo..." : "1. Conferir Arquivo"}
                  </button>
                  <button
                    onClick={importar}
                    disabled={!previa?.ok || previa.gravado || pendente || Boolean(previa.ofertaExistente && !impSubstituir)}
                    className="bg-[#F39200] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-bold flex-1"
                  >
                    2. Importar
                  </button>
                </div>
              </div>

              {previa && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-4xl mx-auto space-y-4 text-sm">
                  {previa.erro && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 font-semibold">{previa.erro}</div>}
                  {previa.gravado && <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 font-semibold">Oferta {previa.codigo} gravada com {previa.turmas} turmas.</div>}
                  {previa.turmas != null && (
                    <>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {[
                          ["Turmas lidas", previa.turmas],
                          ["Comunalidade", previa.comunalidade],
                          ["Choques", previa.choques?.filter((c) => c.gravidade === "ERRO").length],
                          ["Para confirmar", previa.choques?.filter((c) => c.gravidade === "AVISO").length],
                        ].map(([rotulo, n]) => (
                          <div key={String(rotulo)} className="bg-gray-50 rounded-lg p-3 text-center">
                            <div className="text-2xl font-bold text-[#1A2332]">{n ?? 0}</div>
                            <div className="text-xs text-gray-500">{rotulo}</div>
                          </div>
                        ))}
                      </div>
                      <p className="text-gray-500">Aba lida: <b>{previa.aba}</b>. Nada foi gravado ainda{previa.gravado ? " (agora já foi)" : ""}.</p>
                      {previa.ofertaExistente && (
                        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3">
                          A oferta <b>{previa.codigo}</b> já existe ({previa.ofertaExistente.status}) com {previa.ofertaExistente.turmas} turmas
                          {previa.ofertaExistente.alteracoes > 0 && ` e ${previa.ofertaExistente.alteracoes} alterações do dashboard`}. Ao substituir, essas turmas
                          {previa.ofertaExistente.alteracoes > 0 && " e alterações"} são apagadas. Cadastros e avisos não mudam.
                        </div>
                      )}
                      {([
                        ["Professores novos", previa.professoresNovos],
                        ["Disciplinas novas (sem código de matriz)", previa.disciplinasNovas],
                        ["Laboratórios novos (sem capacidade)", previa.salasNovas],
                        ["Turmas de alunos novas", previa.gruposNovos],
                      ] as const).map(([rotulo, lista]) => lista && lista.length > 0 && (
                        <details key={rotulo}>
                          <summary className="cursor-pointer font-semibold text-gray-700">{rotulo}: {lista.length}</summary>
                          <p className="text-gray-600 mt-1">{lista.join(" · ")}</p>
                        </details>
                      ))}
                      {previa.problemas && previa.problemas.length > 0 && (
                        <details open>
                          <summary className="cursor-pointer font-semibold text-gray-700">Linhas para conferir na planilha: {previa.problemas.length}</summary>
                          <ul className="mt-1 space-y-1">{previa.problemas.map((p, i) => <li key={i} className="text-gray-600">Linha {p.linha}: {p.mensagem}</li>)}</ul>
                        </details>
                      )}
                      {previa.choques && previa.choques.length > 0 && (
                        <details open>
                          <summary className="cursor-pointer font-semibold text-gray-700">Choques encontrados: {previa.choques.length}</summary>
                          <ul className="mt-1 space-y-1">
                            {previa.choques.map((c, i) => (
                              <li key={i} className={c.gravidade === "ERRO" ? "text-red-700" : "text-yellow-700"}>
                                <i className={`fa-solid ${c.gravidade === "ERRO" ? "fa-circle-xmark" : "fa-triangle-exclamation"} mr-1`}></i>
                                Linha {c.linha}: {c.mensagem}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 5. HISTÓRICO DE AVISOS */}
          {tab === "historico" && (
            <section className="space-y-6">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 font-bold text-[#1A2332]">Histórico de Disparos WhatsApp</div>
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-gray-100 text-xs uppercase text-gray-600">
                    <tr>
                      <th className="p-3">Data/Hora</th>
                      <th className="p-3">Turma</th>
                      <th className="p-3">Mensagem</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.avisos.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-gray-400">Nenhum aviso ainda.</td></tr>}
                    {dados.avisos.map((a) => (
                      <tr key={a.id}>
                        <td className="p-3 text-xs text-gray-500">{a.quando}</td>
                        <td className="p-3 font-semibold">{a.turma}</td>
                        <td className="p-3">{a.mensagem}</td>
                        <td className="p-3 text-center">
                          <span className={`${a.status === "Falhou" ? "bg-red-100 text-red-700" : a.status === "Pendente" ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-700"} text-xs px-2.5 py-0.5 rounded-full font-bold`}>{a.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* CADASTROS BASE */}
          {tab === "turmas" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-[#1A2332]">Cursos & Turmas</h3>
                <button onClick={() => abrirCadastro("turma")} className="bg-[#F39200] text-white px-4 py-2 rounded-lg text-sm font-bold"><i className="fa-solid fa-plus"></i> Nova Turma</button>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <ul className="divide-y divide-gray-200 text-sm">
                  {dados.grupos.map((t) => (
                    <li key={t.id} className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-900">{t.nome}</p>
                        <p className="text-xs text-gray-500">Alunos: {t.alunos ?? "—"} | WA: {t.wa}</p>
                      </div>
                      <span className="flex"><button onClick={() => abrirCadastro("turma", t.id)} title="Editar" className="p-2 text-gray-500 hover:text-[#F39200]"><i className="fa-solid fa-pen"></i></button><button onClick={() => excluir("turma", t.id)} title="Excluir" className="p-2 text-gray-400 hover:text-red-600"><i className="fa-solid fa-trash"></i></button></span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {tab === "professores" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-[#1A2332]">Corpo Docente</h3>
                <button onClick={() => abrirCadastro("professor")} className="bg-[#F39200] text-white px-4 py-2 rounded-lg text-sm font-bold"><i className="fa-solid fa-plus"></i> Novo Professor</button>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <ul className="divide-y divide-gray-200 text-sm">
                  {dados.professores.map((p) => (
                    <li key={p.id} className="py-2.5 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-gray-900">{p.nome}</span>
                        <p className="text-xs text-gray-500">{p.email}</p>
                      </div>
                      <span className="flex"><button onClick={() => abrirCadastro("professor", p.id)} title="Editar" className="p-2 text-gray-500 hover:text-[#F39200]"><i className="fa-solid fa-pen"></i></button><button onClick={() => excluir("professor", p.id)} title="Excluir" className="p-2 text-gray-400 hover:text-red-600"><i className="fa-solid fa-trash"></i></button></span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {tab === "salas" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-[#1A2332]">Salas & Laboratórios</h3>
                <button onClick={() => abrirCadastro("sala")} className="bg-[#F39200] text-white px-4 py-2 rounded-lg text-sm font-bold"><i className="fa-solid fa-plus"></i> Novo Espaço</button>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <ul className="divide-y divide-gray-200 text-sm">
                  {dados.salas.map((s) => (
                    <li key={s.id} className="py-3 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-[#F39200]">{s.nome}</span>
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded ml-2">{s.tipo}</span>
                        <p className="text-xs text-gray-500 mt-0.5">Capacidade: {s.cap ?? "—"} alunos | {s.predio}</p>
                      </div>
                      <span className="flex"><button onClick={() => abrirCadastro("sala", s.id)} title="Editar" className="p-2 text-gray-500 hover:text-[#F39200]"><i className="fa-solid fa-pen"></i></button><button onClick={() => excluir("sala", s.id)} title="Excluir" className="p-2 text-gray-400 hover:text-red-600"><i className="fa-solid fa-trash"></i></button></span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {tab === "disciplinas" && (
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-[#1A2332]">Ofertas & Disciplinas</h3>
                <button onClick={abrirNovaOferta} className="bg-[#F39200] text-white px-4 py-2 rounded-lg text-sm font-bold"><i className="fa-solid fa-plus"></i> Cadastrar Oferta</button>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <ul className="divide-y divide-gray-200 text-sm">
                  {[...dados.turmas].sort(porDiaHora).map((d) => (
                    <li key={d.id} className="py-3 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-900">{d.nome} — <span className="text-xs font-normal text-gray-600">{d.turma}</span></p>
                        <p className="text-xs text-gray-500">{d.prof} | {d.dia || "EAD"}{d.cht || d.chp ? ` | CH: ${d.cht || "0h"}/${d.chp || "0h"}` : ""}</p>
                      </div>
                      <span className="flex items-center">
                        {d.consome ? (
                          <span className="text-xs text-blue-600 mr-1" title="Edite a aula principal (a do outro curso)">assiste outro curso</span>
                        ) : (
                          <button onClick={() => abrirEdicaoAula(d)} title="Editar" className="p-2 text-gray-500 hover:text-[#F39200]"><i className="fa-solid fa-pen"></i></button>
                        )}
                        <button onClick={() => excluir("aula", d.id)} title="Excluir" className="p-2 text-gray-400 hover:text-red-600"><i className="fa-solid fa-trash"></i></button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {tab === "whatsapp" && (
            <section className="space-y-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 max-w-md mx-auto text-center space-y-4">
                <div className="w-16 h-16 bg-gray-100 text-gray-500 rounded-full flex items-center justify-center mx-auto text-3xl"><i className="fa-brands fa-whatsapp"></i></div>
                <h3 className="text-lg font-bold text-[#1A2332]">Status do Bot WhatsApp</h3>
                <p className="text-xs text-gray-600 font-bold bg-gray-100 py-1.5 rounded-lg">● NÃO CONECTADO</p>
                <p className="text-sm text-gray-600">
                  O envio automático ainda não foi implementado. Os avisos gerados ficam como <b>Pendente</b> no Histórico de Avisos
                  {avisosPendentes > 0 && <> ({avisosPendentes} na fila)</>}.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* MODAIS */}
      {modal === "edit" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-[#1A2332]">Alteração Pontual de Sala/Docente</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block font-semibold mb-1">Novo Local</label>
                <select value={editSala} onChange={(e) => setEditSala(e.target.value)} className={inp}>
                  {!editSala && <option value="">Sala comum</option>}
                  {dados.salas.map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.tipo})</option>)}
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Novo Docente</label>
                <select value={editProf} onChange={(e) => setEditProf(e.target.value)} className={inp}>
                  {!editProf && <option value="">A definir</option>}
                  {dados.professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              <button onClick={salvarEdicao} disabled={pendente} className={salvar}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      {modal === "sala" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-[#1A2332]">{editId ? "Editar" : "Cadastrar"} Sala / Lab</h3>
            <div className="space-y-3 text-sm">
              <div><label className="block font-semibold mb-1">Identificação</label><input value={sala.nome} onChange={(e) => setSala({ ...sala, nome: e.target.value })} type="text" placeholder="Ex: LAB01, IRVINE" className={inp} /></div>
              <div>
                <label className="block font-semibold mb-1">Tipo</label>
                <select value={sala.tipo} onChange={(e) => setSala({ ...sala, tipo: e.target.value })} className={inp}>
                  <option value="Laboratório/Prático">Laboratório/Prático</option>
                  <option value="Presencial Teórico">Presencial Teórico</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block font-semibold mb-1">Capacidade</label><input value={sala.cap} onChange={(e) => setSala({ ...sala, cap: e.target.value })} type="number" placeholder="Ex: 50" className={inp} /></div>
                <div><label className="block font-semibold mb-1">Prédio</label><input value={sala.predio} onChange={(e) => setSala({ ...sala, predio: e.target.value })} type="text" placeholder="Ex: Central / Térreo" className={inp} /></div>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              {editId && <button onClick={() => excluir("sala", editId)} disabled={pendente} className="mr-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold"><i className="fa-solid fa-trash mr-1"></i>Excluir</button>}
              <button onClick={salvarSala} disabled={pendente} className={salvar}>Salvar Espaço</button>
            </div>
          </div>
        </div>
      )}

      {modal === "professor" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-[#1A2332]">{editId ? "Editar" : "Cadastrar"} Professor</h3>
            <div className="space-y-3 text-sm">
              <div><label className="block font-semibold mb-1">Nome Completo</label><input value={prof.nome} onChange={(e) => setProf({ ...prof, nome: e.target.value })} type="text" placeholder="Ex: Prof. Anderson Seixas" className={inp} /></div>
              <div><label className="block font-semibold mb-1">E-mail Institucional</label><input value={prof.email} onChange={(e) => setProf({ ...prof, email: e.target.value })} type="email" placeholder="Ex: professor@unisapiens.edu.br" className={inp} /></div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              {editId && <button onClick={() => excluir("professor", editId)} disabled={pendente} className="mr-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold"><i className="fa-solid fa-trash mr-1"></i>Excluir</button>}
              <button onClick={salvarProfessor} disabled={pendente} className={salvar}>Salvar Docente</button>
            </div>
          </div>
        </div>
      )}

      {modal === "turma" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-[#1A2332]">{editId ? "Editar" : "Cadastrar"} Turma</h3>
            <div className="space-y-3 text-sm">
              <div><label className="block font-semibold mb-1">Nome / Período</label><input value={turma.nome} onChange={(e) => setTurma({ ...turma, nome: e.target.value })} type="text" placeholder="Ex: Eng. Civil (4º Período)" className={inp} /></div>
              <div><label className="block font-semibold mb-1">Qtd Alunos</label><input value={turma.alunos} onChange={(e) => setTurma({ ...turma, alunos: e.target.value })} type="number" placeholder="Ex: 38" className={inp} /></div>
              <div><label className="block font-semibold mb-1">Link WhatsApp</label><input value={turma.wa} onChange={(e) => setTurma({ ...turma, wa: e.target.value })} type="text" placeholder="Ex: chat.whatsapp.com/..." className={inp} /></div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              {editId && <button onClick={() => excluir("turma", editId)} disabled={pendente} className="mr-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold"><i className="fa-solid fa-trash mr-1"></i>Excluir</button>}
              <button onClick={salvarTurma} disabled={pendente} className={salvar}>Salvar Turma</button>
            </div>
          </div>
        </div>
      )}

      {modal === "disciplina" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#1A2332]">{editAulaId ? "Editar" : "Cadastrar"} Oferta de Disciplina</h3>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Turma Alvo</label>
                  <select value={form.grupoId} onChange={f("grupoId")} className={inp}>
                    {dados.grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Nome Disciplina</label>
                  <input value={form.nome} onChange={f("nome")} list="sugestoes-disciplinas" type="text" placeholder="Ex: Programação Web..." className={inp} />
                  <datalist id="sugestoes-disciplinas">
                    {dados.disciplinas.map((n) => <option key={n} value={n} />)}
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Formato</label>
                  <select value={form.formato} onChange={f("formato")} className={inp}>
                    <option value="Presencial">Presencial</option>
                    <option value="Híbrida">Híbrida</option>
                    <option value="Síncrona">Síncrona</option>
                    <option value="Assíncrona">Assíncrona</option>
                  </select>
                </div>
                <div><label className="block font-semibold mb-1">CH Teórica</label><input value={form.cht} onChange={f("cht")} type="text" placeholder="Ex: 40h" className={inp} /></div>
                <div><label className="block font-semibold mb-1">CH Prática</label><input value={form.chp} onChange={f("chp")} type="text" placeholder="Ex: 20h" className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Professor Responsável</label>
                  <select value={form.profId} onChange={f("profId")} className={inp}>
                    <option value="">A definir</option>
                    {dados.professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Dia da Semana</label>
                  <select value={form.dia} onChange={f("dia")} className={inp}>
                    {OPCOES_DIA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              {/* No cadastro o horário é escolhido sozinho; na edição dá para mudar */}
              {editAulaId && form.formato !== "Assíncrona" && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block font-semibold mb-1">Início</label><input type="time" value={form.inicio} onChange={f("inicio")} className={inp} /></div>
                  <div><label className="block font-semibold mb-1">Fim</label><input type="time" value={form.fim} onChange={f("fim")} className={inp} /></div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block font-semibold mb-1">Nº Alunos</label><input value={form.alunos} onChange={f("alunos")} type="number" placeholder="Ex: 38" className={inp} /></div>
                <div>
                  <label className="block font-semibold mb-1">Requisito Espaço</label>
                  <select value={form.reqespaco} onChange={f("reqespaco")} className={inp}>
                    <option value="Laboratório/Prático">Exige Laboratório/Prático</option>
                    <option value="Presencial Teórico">Apenas Sala Teórica</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">Bloquear Sala (Lock)</label>
                  <select value={form.lockSala} onChange={f("lockSala")} className={inp}>
                    <option value="">Nenhuma (Automático)</option>
                    {dados.salas.map((s) => <option key={s.id} value={s.nome}>{s.nome} ({s.tipo})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold mb-1">Ativar Rodízio?</label>
                  <select value={form.rodizio} onChange={f("rodizio")} className={inp}>
                    <option value="Não">Não</option>
                    <option value="Sim (1x1)">Sim (1x1)</option>
                    <option value="Sim (2x2)">Sim (2x2)</option>
                  </select>
                </div>
              </div>

              {editAulaId && (
                <p className="text-xs text-gray-500">CH e rodízio são da disciplina: mudam em todas as turmas dela. Turmas que assistem junto acompanham dia, horário, sala e professor.</p>
              )}
              {conf?.erro && <p className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-lg p-2.5">{conf.erro}</p>}

              {/* Conferência de choques: só aparece depois que turma e disciplina foram preenchidas */}
              {conf && (
                <div className="space-y-1.5">
                  {conf.conflitos.length === 0 && conf.ok && (
                    <p className="text-xs bg-green-50 border border-green-200 text-green-800 rounded-lg p-2.5">✓ Sem choques. Ficará: {conf.resumo}</p>
                  )}
                  {conf.conflitos.map((c, i) => (
                    <p key={i} className={`text-xs rounded-lg p-2.5 border ${c.gravidade === "ERRO" ? "bg-red-50 border-red-200 text-red-800" : "bg-yellow-50 border-yellow-200 text-yellow-800"}`}>
                      <b>{c.gravidade === "ERRO" ? "Choque" : "Confirmar"}:</b> {c.mensagem}
                    </p>
                  ))}
                  {conf.conflitos.length > 0 && conf.ok && <p className="text-xs text-gray-500">Ficará: {conf.resumo}</p>}
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              {editAulaId && (
                <button onClick={() => excluir("aula", editAulaId)} disabled={pendente} className="mr-auto px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-semibold">
                  <i className="fa-solid fa-trash mr-1"></i>Excluir
                </button>
              )}
              <button onClick={salvarOferta} disabled={pendente || temErro || !form.nome.trim() || Boolean(conf?.erro)} className={`${salvar} disabled:opacity-50 disabled:cursor-not-allowed`}>
                Salvar Oferta
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "whatsapp" && waTurma && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md space-y-4">
            <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-brands fa-whatsapp text-green-500"></i> Enviar Notificação</h3>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-xs font-mono text-gray-800 space-y-1">
              <p className="font-bold text-green-800">📲 [AVISO ACADÊMICO - UNISAPIENS]</p>
              <p>{textoAviso(waTurma)}</p>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              <button onClick={enviarDisparo} disabled={pendente} className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg text-sm">Enviar Disparo</button>
            </div>
          </div>
        </div>
      )}

      {modal === "gerar" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto text-sm">
            <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-solid fa-forward text-[#F39200]"></i> Gerar {dados.oferta !== "—" ? proximoCodigo(dados.oferta) : ""}</h3>
            {!geracao?.ok && (
              <>
                <p className="text-gray-600">
                  A partir de <b>{dados.oferta}</b>: cada turma avança um período, as disciplinas vêm da matriz, o professor é quem já deu a
                  disciplina (com menos aulas primeiro) e dia, horário e laboratório são escolhidos sem choque. Fica como <b>rascunho</b> até você publicar.
                </p>
                <label className="flex items-center gap-2"><input type="checkbox" checked={gerAbrirPrimeiro} onChange={(e) => setGerAbrirPrimeiro(e.target.checked)} /> Abrir turma de 1º período (A) nos cursos com matriz</label>
                {geracao?.existe && (
                  <label className="flex items-center gap-2 text-red-700 font-semibold"><input type="checkbox" checked={gerSubstituir} onChange={(e) => setGerSubstituir(e.target.checked)} /> Substituir o rascunho {geracao.codigo} (as mudanças feitas nele se perdem)</label>
                )}
                {geracao?.erro && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3">{geracao.erro}</div>}
              </>
            )}
            {geracao?.ok && (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg p-3 font-semibold">
                  Rascunho {geracao.codigo} gerado a partir de {geracao.origem}: {geracao.turmas} turmas, {geracao.alocadas} de {geracao.comHorario} aulas com dia e horário.
                </div>
                {([
                  ["Sem professor (definir na mão)", geracao.semProfessor],
                  ["Sem encaixe livre (alocar na mão)", geracao.semHorario],
                  ["Cursos sem matriz (não gerados: importar planilha ou cadastrar matriz)", geracao.semMatriz],
                  ["Turmas que se formaram", geracao.formados],
                  ["Turmas de alunos no novo semestre", geracao.gruposNovos],
                ] as const).map(([rotulo, lista]) => lista && lista.length > 0 && (
                  <details key={rotulo} open={rotulo.startsWith("Sem encaixe")}>
                    <summary className="cursor-pointer font-semibold text-gray-700">{rotulo}: {lista.length}</summary>
                    <ul className="mt-1 text-xs text-gray-600 space-y-0.5">{lista.map((x) => <li key={x}>• {x}</li>)}</ul>
                  </details>
                ))}
                <p className="text-gray-500">Confira na Grade, ajuste o que precisar e use <b>Publicar</b> na faixa amarela do topo.</p>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>{geracao?.ok ? "Fechar" : "Cancelar"}</button>
              {!geracao?.ok && <button onClick={gerar} disabled={pendente || Boolean(geracao?.existe && !gerSubstituir)} className={`${salvar} disabled:opacity-50`}>{pendente ? "Gerando..." : "Gerar Rascunho"}</button>}
            </div>
          </div>
        </div>
      )}

      {modal === "realocar" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-solid fa-right-left text-[#F39200]"></i> Realocar Aula</h3>
            {!sugestao && <p className="text-sm text-gray-500">Procurando horários e salas livres...</p>}
            {sugestao && !sugestao.ok && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{sugestao.erro}</div>}
            {sugestao?.ok && (
              <>
                <div className="text-sm space-y-1">
                  <p className="font-semibold">{sugestao.turma}</p>
                  <p className="text-gray-500">Hoje: <b>{sugestao.atual}</b></p>
                  {sugestao.conflitos?.map((c, i) => (
                    <p key={i} className={`text-xs ${c.gravidade === "ERRO" ? "text-red-700" : "text-yellow-700"}`}>• {c.mensagem}</p>
                  ))}
                  {sugestao.acompanham && sugestao.acompanham.length > 0 && (
                    <p className="text-xs text-blue-600">Também mudam (assistem junto): {sugestao.acompanham.join(", ")}</p>
                  )}
                </div>
                {sugestao.opcoes && sugestao.opcoes.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-600 uppercase">Opções sem choque</p>
                    {sugestao.opcoes.map((o, i) => (
                      <label key={i} className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer text-sm ${opcaoEscolhida === i ? "border-[#F39200] bg-orange-50" : "border-gray-200"}`}>
                        <input type="radio" checked={opcaoEscolhida === i} onChange={() => setOpcaoEscolhida(i)} className="mt-1" />
                        <span>
                          <b>{o.descricao}</b> <span className="text-xs text-gray-500">({o.muda})</span>
                          {o.avisos.map((a, j) => <span key={j} className="block text-xs text-yellow-700">⚠️ {a}</span>)}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-3 text-sm">
                    Nenhum dia, horário ou laboratório livre para esta aula sem mexer em outras. Tente trocar o professor ou mover a outra aula do choque.
                  </div>
                )}
                {sugestao.professoresLivres && sugestao.professoresLivres.length > 0 && (
                  <p className="text-xs text-gray-500">Já deram esta disciplina e estão livres no horário atual: <b>{sugestao.professoresLivres.join(", ")}</b> (troca de professor não é automática).</p>
                )}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={realocAvisar} onChange={(e) => setRealocAvisar(e.target.checked)} /> Gerar aviso de WhatsApp para a turma</label>
              </>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              <button onClick={confirmarRealocar} disabled={pendente || !sugestao?.opcoes?.length} className={`${salvar} disabled:opacity-50`}>Aplicar Mudança</button>
            </div>
          </div>
        </div>
      )}

      {modal === "resolver" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-solid fa-wand-magic-sparkles text-[#F39200]"></i> Resolver Conflitos</h3>
            {!plano && <p className="text-sm text-gray-500">Montando sugestões...</p>}
            {plano && !plano.ok && <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm">{plano.erro}</div>}
            {plano?.ok && (
              <>
                <p className="text-sm text-gray-500">Uma mudança por aula, conferida em sequência (mover uma aula costuma resolver o choque da outra). Desmarque o que não quiser.</p>
                {plano.movimentos.length === 0 && <p className="text-sm">Nenhuma mudança possível sem mexer em mais de uma aula.</p>}
                <div className="space-y-2">
                  {plano.movimentos.map((m) => (
                    <label key={m.turmaId} className="flex items-start gap-3 border border-gray-200 rounded-lg p-3 text-sm cursor-pointer">
                      <input
                        type="checkbox" className="mt-1" checked={marcados.has(m.turmaId)}
                        onChange={(e) => setMarcados((s) => { const n = new Set(s); if (e.target.checked) n.add(m.turmaId); else n.delete(m.turmaId); return n; })}
                      />
                      <span>
                        <b>{m.turma}</b>
                        <span className="block text-xs text-red-700">{m.motivo}</span>
                        <span className="block">{m.de} → <b className="text-[#F39200]">{m.opcao.descricao}</b> <span className="text-xs text-gray-500">({m.opcao.muda})</span></span>
                        {m.opcao.avisos.map((a, j) => <span key={j} className="block text-xs text-yellow-700">⚠️ {a}</span>)}
                      </span>
                    </label>
                  ))}
                </div>
                {plano.semSolucao.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm space-y-1">
                    <p className="font-semibold text-yellow-800">Sem opção automática (resolver na mão):</p>
                    {plano.semSolucao.map((s) => <p key={s.turmaId} className="text-xs text-yellow-800">• {s.turma}: {s.motivo}</p>)}
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={realocAvisar} onChange={(e) => setRealocAvisar(e.target.checked)} /> Gerar aviso de WhatsApp para as turmas</label>
              </>
            )}
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              <button onClick={confirmarResolverTodos} disabled={pendente || !plano?.movimentos.length} className={`${salvar} disabled:opacity-50`}>
                Aplicar {plano ? marcados.size : ""} Mudança(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
