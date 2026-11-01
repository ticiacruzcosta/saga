"use client";

// Tela única do SAGA (layout do protótipo v2.8). Os dados vêm do servidor em `dados`;
// as alterações passam pelas server actions de app/.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cadastrarOferta, conferirOferta, criarGrupo, criarProfessor, criarSala, enviarAviso, excluirCadastro,
  previaExclusao, salvarAlteracao, type TipoCadastro,
} from "@/app/actions";
import { aplicarRealocacao, aplicarResolucao, planejarResolucao, sugerirRealocacao } from "@/app/realocacao";
import { gerarProximaOferta, publicarOferta, selecionarOferta } from "@/app/ofertas";
import { sair } from "@/app/auth";
import type { UsuarioLogado } from "@/lib/auth";
import { proximoCodigo } from "@/lib/gerar-oferta";
import { diaDaData, diaMes, somarDias } from "@/lib/datas";
import CalendarioDia, { type Ocupacao } from "./CalendarioDia";
import { OPCOES_DIA, porDiaHora, semTraco } from "./comum";
import TelaBot from "./telas/TelaBot";
import TelaHistorico from "./telas/TelaHistorico";
import TelaImportar from "./telas/TelaImportar";
import TelaSemana from "./telas/TelaSemana";
import TelaUsuarios from "./telas/TelaUsuarios";
import TelaAtividades from "./telas/TelaAtividades";
import TelaCalendario from "./telas/TelaCalendario";
import TelaIndicadores from "./telas/TelaIndicadores";
import ModalSenha from "./ModalSenha";
import type {
  DadosSaga, OfertaInput, PlanoResolucaoVM, ResultadoGeracao, ResultadoOferta, SugestaoRealocacaoVM, TurmaVM,
} from "@/lib/tipos";

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
  usuarios: "USUÁRIOS DO SISTEMA",
  indicadores: "INDICADORES DO SEMESTRE",
  calendario: "CALENDÁRIO LETIVO",
  atividades: "ATIVIDADES E BACKUP",
};

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

export default function SagaApp({ dados, usuario }: { dados: DadosSaga; usuario: UsuarioLogado }) {
  const router = useRouter();
  const [tab, setTab] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tema, setTema] = useState<"claro" | "escuro">("claro");
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  // formulário de janela com alteração ainda não salva
  const [sujo, setSujo] = useState(false);

  // Tela pequena começa com o menu recolhido; o tema escolhido fica guardado neste navegador
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
    try {
      if (localStorage.getItem("saga_tema") === "escuro") setTema("escuro");
    } catch {
      // sem armazenamento: fica no tema claro
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try {
      localStorage.setItem("saga_tema", tema);
    } catch {
      // sem armazenamento: só não lembra a escolha
    }
  }, [tema]);

  // filtros
  const [dashBusca, setDashBusca] = useState("");
  const [gTurma, setGTurma] = useState("TODOS");
  const [gDia, setGDia] = useState("TODOS");
  const [gProf, setGProf] = useState("TODOS");
  const [gEspaco, setGEspaco] = useState("TODOS");

  // janelas
  const [modal, setModal] = useState<"" | "sala" | "professor" | "turma" | "disciplina" | "edit" | "whatsapp" | "realocar" | "resolver" | "gerar">("");
  const [editando, setEditando] = useState<TurmaVM | null>(null);
  const [editSala, setEditSala] = useState("");
  const [editProf, setEditProf] = useState("");
  const [waTurma, setWaTurma] = useState<TurmaVM | null>(null);

  const [sala, setSala] = useState({ nome: "", tipo: "Laboratório/Prático", cap: "", predio: "" });
  const [prof, setProf] = useState<{ nome: string; email: string; dias: string[] }>({ nome: "", email: "", dias: [] });
  const [turma, setTurma] = useState({ nome: "", alunos: "", wa: "" });
  // cadastro sendo editado (null = cadastro novo); vale para sala, professor e turma
  const [editId, setEditId] = useState<number | null>(null);
  const [editAulaId, setEditAulaId] = useState<number | null>(null); // null = cadastrar oferta nova
  const [form, setForm] = useState(FORM_VAZIO);
  const [conf, setConf] = useState<ResultadoOferta | null>(null);
  const [pendente, iniciar] = useTransition();
  const contador = useRef(0);

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

  const fechar = () => {
    if (sujo && !confirm("Há alterações não salvas nesta janela. Descartar?")) return;
    setModal("");
  };
  useEffect(() => setSujo(false), [modal]);
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  // Atalho "/": vai para a busca da tela aberta
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key !== "/" || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName) || alvo.isContentEditable) return;
      const busca = document.querySelector<HTMLInputElement>("[data-busca]");
      if (!busca) return;
      e.preventDefault();
      busca.focus();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
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

  // Feriado/recesso cadastrado ou data fora do período letivo: não há aula
  const semAula = useMemo(() => {
    const feriados = new Map(dados.calendario.semAula.map((d) => [d.data, d.descricao]));
    const { inicio, fim } = dados.calendario;
    return (data: string): string | null =>
      feriados.get(data) ?? ((inicio && data < inicio) || (fim && data > fim) ? "Fora do período letivo" : null);
  }, [dados]);
  const motivoSemAula = semAula(dataVer);

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
      if (!dia || semAula(data)) return null;
      return { livres: controladas.size - usadas(dia, data === dados.dataHoje), total: controladas.size };
    };
  }, [dados, semAula]);

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
      .filter((t) => diaVer && !motivoSemAula && t.dia === diaVer && !t.consome)
      // Troca pontual (lápis) só vale hoje: nos outros dias mostra a grade normal
      .map((t) => (ehHoje ? t : { ...t, sala: t.salaGrade, prof: t.profGrade, alteradaHoje: false }))
      .filter((t) => !termo || `${t.turma} ${t.nome} ${t.prof} ${t.sala}`.toLowerCase().includes(termo))
      .sort(porDiaHora);
  }, [dados, dashBusca, diaVer, ehHoje, motivoSemAula]);

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
      setProf(x ? { nome: x.nome, email: semTraco(x.email), dias: x.dias } : { nome: "", email: "", dias: [] });
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
      setProf({ nome: "", email: "", dias: [] });
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
  const contasPendentes = dados.usuarios.filter((u) => !u.ativo).length;

  // ---------------------------------------------------------------- peças repetidas
  const navBtn = (id: string, icone: string, nome: string, iconeCls = "text-gray-400", nomeCls = "", alerta = 0) => (
    <li>
      <button
        onClick={() => setTab(id)}
        title={nome}
        className={`nav-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
          tab === id ? "bg-[#F39200] text-white" : "text-gray-300 hover:bg-gray-800 hover:text-white"
        }`}
      >
        <span className="relative shrink-0">
          <i className={`${icone} w-5 text-center ${tab === id ? "" : iconeCls}`}></i>
          {/* menu recolhido: só um ponto vermelho */}
          {alerta > 0 && !sidebarOpen && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500"></span>}
        </span>
        <span className={`${sidebarOpen ? "" : "hidden"} truncate ${nomeCls}`}>{nome}</span>
        {alerta > 0 && sidebarOpen && (
          <span title={`${alerta} aviso(s) pendente(s)`} className="ml-auto bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[1.25rem] h-5 px-1.5 flex items-center justify-center">
            {alerta}
          </span>
        )}
      </button>
    </li>
  );

  const inp = "w-full border border-gray-200 rounded-lg p-2.5";
  const filtroSel = "w-full border border-gray-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-[#F39200]";
  const cancelar = "px-4 py-2 border border-gray-200 rounded-lg text-sm";
  const salvar = "px-4 py-2 bg-[#F39200] text-white font-bold rounded-lg text-sm";

  return (
    <div
      className="saga-app bg-[#F4F6F9] text-gray-800 flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white"
      onChangeCapture={() => modal && setSujo(true)}
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
                {navBtn("indicadores", "fa-solid fa-chart-column", "Indicadores")}
                {navBtn("horario-semana", "fa-solid fa-calendar-week", "Horário da Semana")}
                {navBtn("importar", "fa-solid fa-file-import", "Importar Planilha")}
                {navBtn("historico", "fa-solid fa-clock-rotate-left", "Histórico de Avisos", undefined, "", avisosPendentes)}
              </ul>
            </div>
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3`}>Cadastros Base</p>
              <ul className="space-y-1">
                {navBtn("turmas", "fa-solid fa-people-group", "Cursos & Turmas")}
                {navBtn("professores", "fa-solid fa-chalkboard-user", "Professores")}
                {navBtn("salas", "fa-solid fa-door-open", "Salas & Laboratórios")}
                {navBtn("disciplinas", "fa-solid fa-book", "Ofertas & Disciplinas")}
                {navBtn("calendario", "fa-solid fa-calendar-xmark", "Calendário Letivo")}
              </ul>
            </div>
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3`}>Sistema</p>
              <ul className="space-y-1">
                {usuario.admin && navBtn("usuarios", "fa-solid fa-user-shield", "Usuários", undefined, "", contasPendentes)}
                {usuario.admin && navBtn("atividades", "fa-solid fa-list-check", "Atividades e Backup")}
                {navBtn("whatsapp", "fa-brands fa-whatsapp", "Status do Bot", "text-gray-400")}
              </ul>
            </div>
          </nav>
        </div>

        <div className="p-3 border-t border-gray-700/50 flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-[#F39200] text-white flex items-center justify-center font-bold text-xs shrink-0">
            {usuario.nome.charAt(0).toUpperCase()}
          </div>
          <div className={`${sidebarOpen ? "" : "hidden"} overflow-hidden flex-1`}>
            <p className="text-xs font-medium text-white truncate">{usuario.nome}</p>
            <p className="text-[10px] text-gray-400 truncate">{usuario.email}</p>
          </div>
          <button onClick={() => setTrocandoSenha(true)} title="Trocar senha" className={`${sidebarOpen ? "" : "hidden"} text-gray-400 hover:text-white p-1.5 shrink-0`}>
            <i className="fa-solid fa-key"></i>
          </button>
          <button onClick={() => sair()} title="Sair" className={`${sidebarOpen ? "" : "hidden"} text-gray-400 hover:text-white p-1.5 shrink-0`}>
            <i className="fa-solid fa-right-from-bracket"></i>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto print:overflow-visible">
        <header className="print:hidden bg-white border-b border-gray-200 px-4 md:px-8 py-4 flex justify-between items-center gap-3 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen((v) => !v)} className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition mr-1" title="Alternar Menu">
              <i className="fa-solid fa-bars"></i>
            </button>
            <h2 className="text-base md:text-xl font-bold text-[#1A2332]">{titulo}</h2>
          </div>
          <button
            onClick={() => setTema((t) => (t === "claro" ? "escuro" : "claro"))}
            title={tema === "claro" ? "Tema escuro" : "Tema claro"}
            className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 transition shrink-0"
          >
            <i className={`fa-solid ${tema === "claro" ? "fa-moon" : "fa-sun"}`}></i>
          </button>
        </header>

        <div className="p-4 md:p-8">
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
                    type="text" value={dashBusca} onChange={(e) => setDashBusca(e.target.value)} data-busca
                    placeholder="Filtrar por turma, professor ou sala...  ( / )"
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
                      <CalendarioDia hoje={dados.dataHoje} selecionada={dataVer} ocupacao={ocupacao} semAula={semAula} onEscolher={irPara} onFechar={() => setCalendarioAberto(false)} />
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

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[760px]">
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
                      <tr><td colSpan={6} className="p-8 text-center text-gray-400">
                        {motivoSemAula ? <><i className="fa-solid fa-umbrella-beach mr-2"></i>Sem aula: {motivoSemAula}</> : "Nenhuma aula neste dia."}
                      </td></tr>
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
              <h2 className="hidden print:block text-lg font-bold">Oferta {dados.oferta} · UNISAPIENS</h2>
              <div className="print:hidden bg-white p-5 rounded-xl shadow-sm border border-gray-200 space-y-4">
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
                    <a href="/api/exportar" title="Planilha no formato da oferta (pode ser importada de volta)" className="border border-gray-200 text-gray-700 hover:border-[#F39200] px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5">
                      <i className="fa-solid fa-file-excel text-green-600"></i> Excel
                    </a>
                    <button onClick={() => window.print()} title="Imprimir ou salvar como PDF" className="border border-gray-200 text-gray-700 hover:border-[#F39200] px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5">
                      <i className="fa-solid fa-file-pdf text-red-600"></i> PDF
                    </button>
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

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm min-w-[760px]">
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
          {tab === "horario-semana" && <TelaSemana dados={dados} />}

          {/* 4. IMPORTAR PLANILHA */}
          {tab === "importar" && <TelaImportar ofertaAtual={dados.oferta} />}

          {/* 5. HISTÓRICO DE AVISOS */}
          {tab === "historico" && <TelaHistorico avisos={dados.avisos} />}

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

          {tab === "usuarios" && usuario.admin && <TelaUsuarios usuarios={dados.usuarios} eu={usuario} />}

          {tab === "whatsapp" && <TelaBot avisosPendentes={avisosPendentes} />}
          {tab === "indicadores" && <TelaIndicadores dados={dados} />}
          {tab === "calendario" && <TelaCalendario key={dados.oferta} calendario={dados.calendario} oferta={dados.oferta} />}
          {tab === "atividades" && usuario.admin && <TelaAtividades atividades={dados.atividades} />}
        </div>
      </main>

      {/* MODAIS */}
      {trocandoSenha && <ModalSenha onFechar={() => setTrocandoSenha(false)} />}
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
              <div>
                <label className="block font-semibold mb-1">Dias em que NÃO pode dar aula</label>
                <div className="flex flex-wrap gap-2">
                  {OPCOES_DIA.map(([tela, rotulo]) => {
                    const banco = tela.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    const marcado = prof.dias.includes(banco);
                    return (
                      <label key={tela} className={`px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${marcado ? "bg-red-50 border-red-300 text-red-700 font-semibold" : "border-gray-200 text-gray-600"}`}>
                        <input
                          type="checkbox" className="hidden" checked={marcado}
                          onChange={() => setProf({ ...prof, dias: marcado ? prof.dias.filter((d) => d !== banco) : [...prof.dias, banco] })}
                        />
                        {rotulo.split("-")[0]}
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-500 mt-1">A Nova Oferta, a realocação e o gerador de semestre respeitam esses dias.</p>
              </div>
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
