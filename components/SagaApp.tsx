"use client";

// Tela única do SAGA (layout do protótipo v2.8). Os dados vêm do servidor em `dados`;
// as alterações passam pelas server actions de app/.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cadastrarOferta, conferirOferta, criarCurso, criarGrupo, criarProfessor, criarSala, enviarAviso, excluirCadastro,
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
import ModalSenha from "./ModalSenha";
import Avisos, { avisar, confirmar } from "./avisos";
import type {
  DadosSaga, GrupoVM, OfertaInput, PlanoResolucaoVM, ResultadoGeracao, ResultadoOferta, SugestaoRealocacaoVM, TurmaVM,
} from "@/lib/tipos";

const TITULOS: Record<string, string> = {
  gerador: "Grade do semestre",
  "horario-semana": "Horário da semana",
  importar: "Importar planilha",
  historico: "Histórico de avisos",
  turmas: "Cursos e turmas",
  professores: "Professores",
  salas: "Salas e laboratórios",
  disciplinas: "Ofertas e disciplinas",
  whatsapp: "Status do bot",
  usuarios: "Usuários",
};

const FORM_VAZIO = {
  grupoId: "", nome: "", formato: "Presencial", cht: "", chp: "", profId: "", dia: "SEGUNDA",
  alunos: "", reqespaco: "Laboratório/Prático", lockSala: "", rodizio: "Não", inicio: "", fim: "",
};

/** Selo de status: sempre ponto + palavra (nunca só a cor). */
function Selo({ tipo }: { tipo: "ok" | "erro" | "confirmar" }) {
  const [fundo, ponto, texto] =
    tipo === "ok" ? ["bg-emerald-50 text-emerald-700", "bg-emerald-500", "OK"]
    : tipo === "erro" ? ["bg-red-50 text-red-700", "bg-red-600", "Conflito"]
    : ["bg-yellow-50 text-yellow-800", "bg-amber-500", "Confirmar"];
  return (
    <span className={`${fundo} inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-extrabold`}>
      <span aria-hidden="true" className={`w-2 h-2 rounded-full ${ponto}`}></span>
      {texto}
    </span>
  );
}

/** Paleta suave por curso para destacar visualmente cada área. */
const CORES_CURSO = [
  { borda: "border-l-amber-500", selo: "bg-amber-50 text-amber-800 border-amber-200", ponto: "bg-amber-500", ativo: "bg-amber-600 text-white border-amber-600" },
  { borda: "border-l-blue-600", selo: "bg-blue-50 text-blue-800 border-blue-200", ponto: "bg-blue-600", ativo: "bg-blue-600 text-white border-blue-600" },
  { borda: "border-l-emerald-600", selo: "bg-emerald-50 text-emerald-800 border-emerald-200", ponto: "bg-emerald-600", ativo: "bg-emerald-600 text-white border-emerald-600" },
  { borda: "border-l-purple-600", selo: "bg-purple-50 text-purple-800 border-purple-200", ponto: "bg-purple-600", ativo: "bg-purple-600 text-white border-purple-600" },
  { borda: "border-l-rose-600", selo: "bg-rose-50 text-rose-800 border-rose-200", ponto: "bg-rose-600", ativo: "bg-rose-600 text-white border-rose-600" },
  { borda: "border-l-cyan-600", selo: "bg-cyan-50 text-cyan-800 border-cyan-200", ponto: "bg-cyan-600", ativo: "bg-cyan-600 text-white border-cyan-600" },
  { borda: "border-l-indigo-600", selo: "bg-indigo-50 text-indigo-800 border-indigo-200", ponto: "bg-indigo-600", ativo: "bg-indigo-600 text-white border-indigo-600" },
];

function corDoCurso(id: number) {
  return CORES_CURSO[Math.abs(id) % CORES_CURSO.length];
}

/** Rótulo resumido da turma para a visualização em blocos (ex.: "S.I - 1º V", "E.C - 3º A"). */
function rotuloBlocoTurma(t: GrupoVM): string {
  const s = (t.cursoSigla || "CUR").toUpperCase();
  const siglaFmt = s.length === 2 ? `${s[0]}.${s[1]}` : s;
  const per = t.periodo != null ? `${t.periodo}º` : (/\d+º?/.exec(t.nome)?.[0] ?? "");
  const ehVesp = t.turno === "VESPERTINO" || /\bVESP/i.test(t.nome);
  const letra = t.letra && t.letra !== "A" ? t.letra : (/\b([B-D])\b/.exec(t.nome)?.[1] ?? "");
  const sufixo = ehVesp ? `${letra ? `${letra} ` : ""}V` : (t.letra || "A");
  const detalhe = [per, sufixo].filter(Boolean).join(" ");
  return detalhe ? `${siglaFmt} - ${detalhe}` : siglaFmt;
}

function iniciais(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
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
  const [turmasBusca, setTurmasBusca] = useState("");
  const [turmasCursoFiltro, setTurmasCursoFiltro] = useState<number | null>(null);
  const [turmasModo, setTurmasModo] = useState<"lista" | "blocos">("blocos");
  const [profBusca, setProfBusca] = useState("");
  const [profModo, setProfModo] = useState<"lista" | "blocos">("blocos");
  const [salasBusca, setSalasBusca] = useState("");
  const [salasTipoFiltro, setSalasTipoFiltro] = useState<string>("TODOS");
  const [salasModo, setSalasModo] = useState<"lista" | "blocos">("blocos");
  const [ofertasBusca, setOfertasBusca] = useState("");
  const [ofertasDiaFiltro, setOfertasDiaFiltro] = useState<string>("TODOS");
  const [ofertasCursoFiltro, setOfertasCursoFiltro] = useState<string>("TODOS");
  const [ofertasModo, setOfertasModo] = useState<"lista" | "blocos">("blocos");
  const [gTurma, setGTurma] = useState("TODOS");
  const [gDia, setGDia] = useState("TODOS");
  const [gProf, setGProf] = useState("TODOS");
  const [gEspaco, setGEspaco] = useState("TODOS");

  // janelas
  const [modal, setModal] = useState<"" | "sala" | "professor" | "turma" | "curso" | "disciplina" | "edit" | "whatsapp" | "realocar" | "resolver" | "gerar">("");
  const [editando, setEditando] = useState<TurmaVM | null>(null);
  const [editSala, setEditSala] = useState("");
  const [editProf, setEditProf] = useState("");
  const [editCancelada, setEditCancelada] = useState(false);
  const [editMotivo, setEditMotivo] = useState("");
  const [editGerarAviso, setEditGerarAviso] = useState(true);
  const [editMsgCustom, setEditMsgCustom] = useState("");
  const [editMsgTocado, setEditMsgTocado] = useState(false);
  const [waTurma, setWaTurma] = useState<TurmaVM | null>(null);
  const [waTexto, setWaTexto] = useState("");

  const [sala, setSala] = useState({ nome: "", tipo: "Laboratório/Prático", cap: "", predio: "" });
  const [prof, setProf] = useState<{ nome: string; email: string; dias: string[] }>({ nome: "", email: "", dias: [] });
  const [curso, setCurso] = useState({ nome: "", sigla: "" });
  const [turma, setTurma] = useState({ cursoId: "", novoCurso: "", siglaCurso: "", nome: "", alunos: "", wa: "" });
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

  const fechar = async () => {
    if (sujo && !(await confirmar("As alterações feitas nesta janela ainda não foram salvas.", { titulo: "Descartar alterações?", botao: "Descartar", perigo: true }))) return;
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

  // Salas livres por dia (para as cores do calendário): só as salas que o sistema controla
  const ocupacao = useMemo(() => {
    const controladas = new Set(dados.salas.map((s) => s.nome));
    const usadas = (dia: string, data: string) =>
      new Set(
        dados.turmas
          .filter((t) => {
            if (t.dia !== dia || t.consome || t.formato === "Assíncrona" || t.formato === "Síncrona") return false;
            const alt = t.alteracoesPorData?.[data];
            if (alt?.cancelada || (data === dados.dataHoje && t.canceladaHoje)) return false;
            return true;
          })
          .map((t) => t.alteracoesPorData?.[data]?.sala ?? (data === dados.dataHoje ? t.sala : t.salaGrade))
          .filter((s) => controladas.has(s))
      ).size;
    return (data: string): Ocupacao | null => {
      const dia = diaDaData(data);
      if (!dia) return null;
      return { livres: controladas.size - usadas(dia, data), total: controladas.size };
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

  const titulo = tab === "dashboard" ? "Horário do dia" : TITULOS[tab] ?? "Faculdade Unisapiens";

  // ---------------------------------------------------------------- dados derivados
  const dashboard = useMemo(() => {
    const termo = dashBusca.trim().toLowerCase();
    return dados.turmas
      .filter((t) => diaVer && t.dia === diaVer && !t.consome)
      .map((t) => {
        const alt = t.alteracoesPorData?.[dataVer];
        const salaDia = alt?.sala ?? (ehHoje ? t.sala : t.salaGrade);
        const profDia = alt?.prof ?? (ehHoje ? t.prof : t.profGrade);
        const canceladaDia = Boolean(alt?.cancelada ?? (ehHoje ? t.canceladaHoje : false));
        const motivoDia = alt?.motivo ?? (ehHoje ? t.motivoCancelamento : null);
        const alteradaDia = Boolean(alt?.sala || alt?.prof || canceladaDia || (ehHoje && t.alteradaHoje));
        return {
          ...t,
          sala: salaDia,
          prof: profDia,
          alteradaHoje: alteradaDia,
          canceladaHoje: canceladaDia,
          motivoCancelamento: motivoDia,
        };
      })
      .filter((t) => !termo || `${t.turma} ${t.nome} ${t.prof} ${t.sala}`.toLowerCase().includes(termo))
      .sort(porDiaHora);
  }, [dados, dashBusca, diaVer, dataVer, ehHoje]);

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
    const g0 = dados.grupos[0];
    const vesp = g0?.turno === "VESPERTINO" || /\bVESP/i.test(g0?.nome ?? "");
    setForm({
      ...FORM_VAZIO,
      grupoId: g0 ? String(g0.id) : "",
      inicio: vesp ? "15:00" : "19:00",
      fim: vesp ? "17:45" : "21:45",
    });
    setConf(null);
    setModal("disciplina");
  }

  function salvarOferta() {
    iniciar(async () => {
      const r = await cadastrarOferta(entrada);
      if (r.ok) {
        avisar(`${editAulaId ? "Oferta atualizada" : "Oferta cadastrada"}: ${r.resumo}`);
        setModal("");
        router.refresh();
      } else {
        setConf(r);
        const msgErro = r.erro ?? r.conflitos.find((c) => c.gravidade === "ERRO")?.mensagem ?? "Corrija o choque de horário antes de salvar.";
        avisar(msgErro, "erro");
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
      if (!r.ok) return avisar(r.erro, "erro");
      avisar(`Aula realocada: ${r.resumo}`);
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
    if (itens.length === 0) return avisar("Marque pelo menos uma mudança.", "erro");
    iniciar(async () => {
      const r = await aplicarResolucao(itens);
      avisar(`${r.aplicadas} aula(s) realocada(s).${r.falhas.length ? `\n\nNão aplicadas:\n${r.falhas.join("\n")}` : ""}`);
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
  async function publicar(codigo: string) {
    if (!(await confirmar("Ele passa a ser o semestre que vale para todos. O publicado atual é arquivado.", { titulo: `Publicar ${codigo}?`, botao: "Publicar" }))) return;
    iniciar(async () => {
      const r = await publicarOferta(codigo);
      if (!r.ok) return avisar(r.erro, "erro");
      avisar(`Semestre ${codigo} publicado`);
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
  function abrirCadastro(tipo: "sala" | "professor" | "turma" | "curso", id: number | null = null) {
    setEditId(id);
    if (tipo === "sala") {
      const x = dados.salas.find((v) => v.id === id);
      setSala(x ? { nome: x.nome, tipo: x.tipo, cap: x.cap != null ? String(x.cap) : "", predio: semTraco(x.predio) } : { nome: "", tipo: "Laboratório/Prático", cap: "", predio: "" });
    }
    if (tipo === "professor") {
      const x = dados.professores.find((v) => v.id === id);
      setProf(x ? { nome: x.nome, email: semTraco(x.email), dias: x.dias } : { nome: "", email: "", dias: [] });
    }
    if (tipo === "curso") {
      const x = dados.cursos.find((v) => v.id === id);
      setCurso(x ? { nome: x.nome, sigla: x.sigla } : { nome: "", sigla: "" });
    }
    if (tipo === "turma") {
      const x = dados.grupos.find((v) => v.id === id);
      const cursoPadrao = dados.cursos[0] ? String(dados.cursos[0].id) : "NOVO";
      setTurma(
        x
          ? { cursoId: String(x.cursoId), novoCurso: "", siglaCurso: "", nome: x.nome, alunos: x.alunos != null ? String(x.alunos) : "", wa: semTraco(x.wa) }
          : { cursoId: cursoPadrao, novoCurso: "", siglaCurso: "", nome: "", alunos: "", wa: "" }
      );
    }
    setModal(tipo);
  }
  function salvarSala() {
    if (!sala.nome) return avisar("Informe a identificação!", "erro");
    iniciar(async () => {
      const r = await criarSala({ id: editId ?? undefined, nome: sala.nome, tipo: sala.tipo, cap: sala.cap ? Number(sala.cap) : null, predio: sala.predio });
      if (!r.ok) return avisar(r.erro, "erro");
      avisar(`Sala ${sala.nome.trim().toUpperCase()} salva`);
      setSala({ nome: "", tipo: "Laboratório/Prático", cap: "", predio: "" });
      setModal("");
      router.refresh();
    });
  }
  function salvarProfessor() {
    if (!prof.nome) return avisar("Informe o nome!", "erro");
    iniciar(async () => {
      const r = await criarProfessor({ id: editId ?? undefined, ...prof });
      if (!r.ok) return avisar(r.erro, "erro");
      avisar("Professor salvo");
      setProf({ nome: "", email: "", dias: [] });
      setModal("");
      router.refresh();
    });
  }
  function salvarCurso() {
    if (!curso.nome.trim()) return avisar("Informe o nome do curso!", "erro");
    iniciar(async () => {
      const r = await criarCurso({ id: editId ?? undefined, nome: curso.nome, sigla: curso.sigla });
      if (!r.ok) return avisar(r.erro, "erro");
      avisar("Curso salvo");
      setCurso({ nome: "", sigla: "" });
      setModal("");
      router.refresh();
    });
  }
  function salvarTurma() {
    if (!turma.nome.trim()) return avisar("Informe a turma ou período!", "erro");
    if (turma.cursoId === "NOVO" && !turma.novoCurso.trim()) return avisar("Informe o nome do novo curso!", "erro");
    iniciar(async () => {
      const r = await criarGrupo({
        id: editId ?? undefined,
        nome: turma.nome,
        cursoId: turma.cursoId && turma.cursoId !== "NOVO" ? Number(turma.cursoId) : null,
        novoCurso: turma.cursoId === "NOVO" ? turma.novoCurso : undefined,
        siglaCurso: turma.cursoId === "NOVO" ? turma.siglaCurso : undefined,
        alunos: turma.alunos ? Number(turma.alunos) : null,
        wa: turma.wa,
      });
      if (!r.ok) return avisar(r.erro, "erro");
      avisar("Turma salva");
      setTurma({ cursoId: "", novoCurso: "", siglaCurso: "", nome: "", alunos: "", wa: "" });
      setModal("");
      router.refresh();
    });
  }
  /** Mostra o que vai mudar, pede confirmação e exclui. */
  function excluir(tipo: TipoCadastro, id: number) {
    iniciar(async () => {
      const p = await previaExclusao(tipo, id);
      if (!p.pode) return avisar(p.mensagem, "erro");
      const [titulo, ...resto] = p.mensagem.split("\n\n");
      if (!(await confirmar(resto.join("\n\n") || "Não dá para desfazer pela tela.", { titulo, botao: "Excluir", perigo: true }))) return;
      const r = await excluirCadastro(tipo, id);
      if (!r.ok) return avisar(r.erro, "erro");
      avisar("Excluído");
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
  const textoPadraoEdicao = (t: TurmaVM, salaIdStr: string, profIdStr: string, cancelada: boolean, motivo: string) => {
    const dataBr = dataVer.split("-").reverse().join("/");
    const motivoLimpo = motivo.trim();
    if (cancelada) {
      return `NÃO HAVERÁ AULA de ${t.nome} na turma ${t.turma} em ${dataBr}.${motivoLimpo ? ` Motivo: ${motivoLimpo}.` : ""}`;
    }
    const salaNova = dados.salas.find((s) => String(s.id) === salaIdStr)?.nome ?? "Sala comum";
    const profNovo = dados.professores.find((p) => String(p.id) === profIdStr)?.nome ?? "A definir";
    const detalhes: string[] = [];
    if (t.canceladaHoje) detalhes.push("Aula confirmada/reativada");
    if (salaNova !== t.sala) detalhes.push(`Sala: ${t.sala} → ${salaNova}`);
    if (profNovo !== t.prof) detalhes.push(`Professor: ${t.prof} → ${profNovo}`);
    if (t.canceladaHoje && detalhes.length === 1) {
      return `Aula confirmada em ${dataBr}: ${t.nome} (${t.turma}) acontecerá normalmente na sala/lab ${salaNova} com ${profNovo}.`;
    }
    return `Alteração de aula em ${dataBr}: ${t.nome} (${t.turma}). ${detalhes.length ? detalhes.join("; ") : `Sala: ${salaNova}; Professor: ${profNovo}`}.`;
  };

  function abrirEdicao(t: TurmaVM, iniciarCancelando?: boolean) {
    const salaIdStr = String(dados.salas.find((s) => s.nome === t.sala)?.id ?? "");
    const profIdStr = String(dados.professores.find((p) => p.nome === t.prof)?.id ?? "");
    const canceladaInicial = iniciarCancelando !== undefined ? iniciarCancelando : Boolean(t.canceladaHoje);
    const motivoInicial = t.motivoCancelamento ?? "";
    setEditando(t);
    setEditSala(salaIdStr);
    setEditProf(profIdStr);
    setEditCancelada(canceladaInicial);
    setEditMotivo(motivoInicial);
    setEditGerarAviso(true);
    setEditMsgTocado(false);
    setEditMsgCustom(textoPadraoEdicao(t, salaIdStr, profIdStr, canceladaInicial, motivoInicial));
    setModal("edit");
  }
  function salvarEdicao() {
    if (!editando) return;
    const msgPadrao = textoPadraoEdicao(editando, editSala, editProf, editCancelada, editMotivo);
    const msgFinal = editMsgTocado ? editMsgCustom.trim() : msgPadrao;
    iniciar(async () => {
      const r = await salvarAlteracao({
        turmaId: editando.id,
        salaId: editSala ? Number(editSala) : null,
        profId: editProf ? Number(editProf) : null,
        cancelada: editCancelada,
        motivo: editMotivo,
        dataIso: dataVer,
        mensagemCustomizada: msgFinal,
        gerarAviso: editGerarAviso,
      });
      if (!r.ok) return avisar(r.erro, "erro");
      avisar(editCancelada ? "Aula cancelada e aviso preparado" : editando.canceladaHoje ? "Aula reativada" : "Alteração registrada");
      setModal("");
      router.refresh();
    });
  }
  const textoAviso = (t: TurmaVM) => {
    const quando = ehHoje ? "hoje" : ehAmanha ? "amanhã" : `na ${nomeDiaVer} (${diaMes(dataVer)})`;
    if (t.canceladaHoje) {
      return `Turma ${t.turma}: Informamos que NÃO HAVERÁ AULA de ${t.nome} ${quando}.${t.motivoCancelamento ? ` Motivo: ${t.motivoCancelamento}.` : ""}`;
    }
    return `Turma ${t.turma}: A aula de ${t.nome} ${quando} será na sala/lab ${t.sala} com o(a) ${t.prof}.`;
  };
  function abrirWhatsApp(t: TurmaVM) {
    setWaTurma(t);
    setWaTexto(textoAviso(t));
    setModal("whatsapp");
  }
  function enviarDisparo(abrirWa = false) {
    if (!waTurma) return;
    const msg = waTexto.trim();
    if (!msg) return avisar("A mensagem do aviso não pode ficar vazia.", "erro");
    iniciar(async () => {
      const r = await enviarAviso({ turmaId: waTurma.id, mensagem: msg });
      if (!r.ok) return avisar(r.erro, "erro");
      if (abrirWa) {
        try {
          await navigator.clipboard.writeText(msg);
        } catch {
          // sem permissão de copiar
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
      }
      avisar("Aviso registrado no histórico (pendente de envio)");
      setModal("");
      router.refresh();
    });
  }
  const avisosPendentes = dados.avisos.filter((a) => a.status === "Pendente").length;
  const contasPendentes = dados.usuarios.filter((u) => !u.ativo).length;

  // ---------------------------------------------------------------- peças repetidas
  const navBtn = (id: string, icone: string, nome: string, alerta = 0) => {
    const ativo = tab === id;
    return (
      <li className={sidebarOpen ? "pl-3" : "px-2"}>
        <button
          onClick={() => {
            setTab(id);
            if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false);
          }}
          title={nome}
          aria-current={ativo ? "page" : undefined}
          className={`group w-full flex items-center gap-2.5 py-2 text-left text-[13px] ${
            sidebarOpen
              ? ativo
                ? "nav-aba-item nav-aba-ativa pl-3.5 pr-3.5"
                : "nav-aba-item pl-3.5 pr-3.5 text-slate-300 font-semibold hover:text-white hover:translate-x-0.5"
              : ativo
                ? "justify-center px-0 rounded-2xl bg-[var(--saga-fundo)] text-[#1A2332] font-extrabold shadow-sm transition-all duration-250"
                : "justify-center px-0 rounded-2xl text-slate-300 font-semibold hover:bg-white/8 hover:text-white transition-all duration-250"
          }`}
        >
          {sidebarOpen && <span aria-hidden="true" className="nav-aba-bg" />}
          <span
            className={`relative shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-250 ease-out ${
              ativo ? "bg-[#F39200]/15 text-[#C2410C]" : "text-slate-300 group-hover:text-white"
            }`}
          >
            <i className={`${icone} text-[13px] text-center transition-transform duration-200 ease-out`}></i>
            {/* menu recolhido: só um ponto vermelho */}
            {alerta > 0 && !sidebarOpen && <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-red-500"></span>}
          </span>
          <span className={`${sidebarOpen ? "" : "hidden"} truncate transition-colors duration-200`}>{nome}</span>
          {alerta > 0 && sidebarOpen && (
            <span
              title={`${alerta} aviso(s) pendente(s)`}
              className={`ml-auto text-white text-[10px] font-extrabold rounded-full min-w-[1.15rem] h-4.5 px-1.5 flex items-center justify-center transition-colors duration-200 ${
                ativo ? "bg-[#C2410C]" : "bg-red-500"
              }`}
            >
              {alerta}
            </span>
          )}
        </button>
      </li>
    );
  };

  const inp = "campo";
  const filtroSel = "campo campo-sm";
  const cancelar = "btn btn-secundario";
  const salvar = "btn btn-principal";

  return (
    <div
      className="saga-app bg-[#F4F6F9] text-gray-800 flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible print:bg-white"
      onChangeCapture={() => modal && setSujo(true)}
    >
      <style>{`button:not(:disabled){cursor:pointer} input::placeholder{color:#6b7280} nextjs-portal{display:none!important} @page{size:landscape;margin:10mm}`}</style>

      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
          className="print:hidden fixed inset-0 bg-black/45 z-20 md:hidden"
        />
      )}

      <aside
        className={`print:hidden ${
          sidebarOpen ? "fixed inset-y-0 left-0 z-30 w-64 flex md:static" : "hidden md:flex md:w-[4.5rem]"
        } bg-[linear-gradient(270deg,#243247_0%,#1A2332_55%,#131A26_100%)] text-white flex-col justify-between shrink-0 transition-all duration-300 relative overflow-hidden`}
      >
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="px-4 pt-3.5 pb-3 mx-2 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-[12px] bg-white text-[#B45309] flex items-center justify-center font-black text-base shrink-0">US</div>
              <div className={`${sidebarOpen ? "" : "hidden"} flex flex-col leading-tight min-w-0`}>
                <span className="text-[10px] font-extrabold tracking-[0.12em] text-[#F7A428]">FACULDADE</span>
                <span className="text-[16px] font-black tracking-wide">UNISAPIENS</span>
                <span className="text-[9px] tracking-[0.25em] text-slate-400">SAGA</span>
              </div>
            </div>
            <button onClick={() => setSidebarOpen((v) => !v)} className={`${sidebarOpen ? "" : "hidden"} w-8 h-8 rounded-full text-slate-400 hover:text-white hover:bg-white/5 transition shrink-0`} title="Recolher menu" aria-label="Recolher menu">
              <i className="fa-solid fa-angles-left text-xs"></i>
            </button>
          </div>

          <nav aria-label="Menu principal" className="py-2.5 pl-0 pr-0 space-y-3 text-sm flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.14em] mb-1 px-6`}>Operacional</p>
              <ul className="space-y-0.5">
                {navBtn("dashboard", "fa-solid fa-gauge", "Dashboard")}
                {navBtn("gerador", "fa-solid fa-calendar-days", "Grade do Semestre")}
                {navBtn("horario-semana", "fa-solid fa-calendar-week", "Horário da Semana")}
                {navBtn("importar", "fa-solid fa-file-import", "Importar Planilha")}
                {navBtn("historico", "fa-solid fa-clock-rotate-left", "Histórico de Avisos", avisosPendentes)}
              </ul>
            </div>
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.14em] mb-1 px-6`}>Cadastros</p>
              <ul className="space-y-0.5">
                {navBtn("turmas", "fa-solid fa-people-group", "Cursos e Turmas")}
                {navBtn("professores", "fa-solid fa-chalkboard-user", "Professores")}
                {navBtn("salas", "fa-solid fa-door-open", "Salas e Laboratórios")}
                {navBtn("disciplinas", "fa-solid fa-book", "Ofertas e Disciplinas")}
              </ul>
            </div>
            <div>
              <p className={`${sidebarOpen ? "" : "hidden"} text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.14em] mb-1 px-6`}>Sistema</p>
              <ul className="space-y-0.5">
                {usuario.admin && navBtn("usuarios", "fa-solid fa-user-shield", "Usuários", contasPendentes)}
                {navBtn("whatsapp", "fa-solid fa-paper-plane", "Status do Bot")}
              </ul>
            </div>
          </nav>
        </div>

        <div className="mx-2 px-2 py-2.5 border-t border-white/10 flex items-center gap-2.5 overflow-hidden shrink-0">
          <div title={`${usuario.nome} · ${usuario.email}`} className="w-9 h-9 rounded-full bg-gradient-to-br from-[#F39200] to-[#C2410C] flex items-center justify-center font-black text-sm shrink-0">
            {usuario.nome.charAt(0).toUpperCase()}
          </div>
          <div className={`${sidebarOpen ? "" : "hidden"} overflow-hidden flex-1 leading-tight`}>
            <p className="text-[13px] font-extrabold truncate">{usuario.nome}</p>
            <p className="text-[11px] text-slate-400 truncate">{usuario.admin ? "Administrador" : "Coordenação"}</p>
          </div>
          <button onClick={() => setTrocandoSenha(true)} title="Trocar senha" aria-label="Trocar senha" className={`${sidebarOpen ? "" : "hidden"} w-8 h-8 rounded-full bg-white/5 text-slate-300 hover:text-white shrink-0`}>
            <i className="fa-solid fa-key text-xs"></i>
          </button>
          <button onClick={() => sair()} title="Sair" aria-label="Sair" className={`${sidebarOpen ? "" : "hidden"} w-8 h-8 rounded-full bg-white/5 text-slate-300 hover:text-white shrink-0`}>
            <i className="fa-solid fa-right-from-bracket text-xs"></i>
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto print:overflow-visible">
        <header className="print:hidden bg-white border-b border-gray-200 px-4 md:px-8 py-4 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-3 min-w-0">
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="btn btn-icone shrink-0" title="Abrir menu" aria-label="Abrir menu">
                <i className="fa-solid fa-bars"></i>
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-black text-[#1A2332] leading-tight">{titulo}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {dados.oferta !== "—" && (
              <span className="hidden sm:inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-extrabold bg-[#1A2332] text-white shadow-2xs tabular-nums">
                <span aria-hidden="true" className="w-2 h-2 rounded-full bg-[#F39200]"></span>
                Semestre {dados.oferta}{dados.ofertaStatus === "RASCUNHO" ? " (rascunho)" : dados.ofertaStatus === "ARQUIVADA" ? " (arquivado)" : ""}
              </span>
            )}
            <button
              onClick={() => setTema((t) => (t === "claro" ? "escuro" : "claro"))}
              title={tema === "claro" ? "Tema escuro" : "Tema claro"}
              aria-label={tema === "claro" ? "Tema escuro" : "Tema claro"}
              className="w-10 h-10 rounded-full border border-gray-200 bg-white text-gray-600 hover:text-[#B45309] transition shrink-0"
            >
              <i className={`fa-solid ${tema === "claro" ? "fa-moon" : "fa-sun"}`}></i>
            </button>
          </div>
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
              <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-7 min-h-[150px] flex flex-col justify-center gap-3.5 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
                <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90" />
                <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35" />
                <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85" />
                <div className="relative max-w-xl">
                  <h2 className="text-2xl md:text-[26px] font-black">Olá, {usuario.nome.split(" ")[0]}</h2>
                  <p className="text-[15px] text-white/90">
                    {`${ehHoje ? "Hoje tem" : "Neste dia há"} ${dashboard.length} aula(s) em ${new Set(dashboard.map((t) => t.turma)).size} turma(s). ${dados.totalConflitos ? `${dados.totalConflitos} conflito(s) na grade.` : "Nenhum conflito na grade."}`}
                  </p>
                </div>
                {diaVer && (
                  <div className="relative flex flex-wrap gap-2">
                    <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">{dashboard.length} aula(s)</span>
                    {(() => { const o = ocupacao(dataVer); return o ? <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">{o.livres} de {o.total} salas livres</span> : null; })()}
                    <span className="px-3.5 py-1.5 rounded-full bg-white/15 text-[13px] font-bold">{dashboard.filter((t) => t.alteradaHoje).length} alteração(ões) {ehHoje ? "hoje" : "neste dia"}</span>
                    {dashboard.some((t) => t.canceladaHoje) && (
                      <span className="px-3.5 py-1.5 rounded-full bg-red-500/80 text-white text-[13px] font-bold">
                        {dashboard.filter((t) => t.canceladaHoje).length} aula(s) cancelada(s)
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="p-4 flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch sm:items-center justify-between cartao">
                <div className="relative flex-1 sm:max-w-md">
                  <i className="fa-solid fa-magnifying-glass absolute left-3 top-3 text-gray-400"></i>
                  <input
                    type="text" value={dashBusca} onChange={(e) => setDashBusca(e.target.value)} data-busca
                    placeholder="Filtrar por turma, professor ou sala...  ( / )"
                    className="campo campo-sm w-full pl-9"
                  />
                </div>
                <div className="flex items-center justify-center sm:justify-end gap-2">
                  <button onClick={() => andarDia(-1)} title="Dia anterior" className="w-10 h-10 rounded-full border border-gray-200 bg-white text-[#1A2332] hover:border-[#F39200] shrink-0">
                    <i className="fa-solid fa-chevron-left"></i>
                  </button>
                  <div className="relative flex-1 sm:flex-initial">
                    {/* clicar ou segurar (toque longo / botão direito) abre o calendário */}
                    <button
                      onClick={() => setCalendarioAberto((v) => !v)}
                      onContextMenu={(e) => { e.preventDefault(); setCalendarioAberto(true); }}
                      title="Abrir calendário"
                      className="w-full text-center min-w-[9rem] sm:min-w-[10rem] px-4 sm:px-5 py-1.5 rounded-full bg-[#FFF4E5] hover:brightness-95 select-none"
                    >
                      <div className="text-sm font-bold text-[#1A2332]">
                        <i className="fa-regular fa-calendar text-[#B45309] mr-1"></i>{nomeDiaVer}, {diaMes(dataVer)}
                      </div>
                      <div className={`text-[11px] font-semibold ${ehHoje ? "text-green-600" : "text-[#B45309]"}`}>
                        {ehHoje ? (diaVer ? "Hoje" : "Hoje (sem aulas)") : ehAmanha ? "Amanhã" : dataVer < dados.dataHoje ? "Já passou" : "Outro dia"}
                      </div>
                    </button>
                    {calendarioAberto && (
                      <CalendarioDia hoje={dados.dataHoje} selecionada={dataVer} ocupacao={ocupacao} onEscolher={irPara} onFechar={() => setCalendarioAberto(false)} />
                    )}
                  </div>
                  <button onClick={() => andarDia(1)} title="Próximo dia" className="w-10 h-10 rounded-full border border-gray-200 bg-white text-[#1A2332] hover:border-[#F39200] shrink-0">
                    <i className="fa-solid fa-chevron-right"></i>
                  </button>
                  {dataEscolhida && (
                    <button onClick={() => setDataEscolhida(null)} className="text-xs font-bold text-[#B45309] hover:underline ml-1 shrink-0">Hoje</button>
                  )}
                </div>
              </div>

              {/* VISÃO CELULAR DO DASHBOARD */}
              <div className="md:hidden space-y-3">
                {dashboard.length === 0 && (
                  <div className="cartao p-6 text-center text-gray-400">
                    <b className="block text-base text-[#1A2332]">Nenhuma aula neste dia</b>
                    <span className="text-xs">Use as setas para ver outro dia.</span>
                  </div>
                )}
                {dashboard.map((d) => (
                  <div key={d.id} className={`cartao p-4 space-y-2.5 ${d.canceladaHoje ? "border-red-200 bg-red-50/40" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`font-bold text-sm ${d.canceladaHoje ? "text-red-800 line-through" : "text-gray-900"}`}>{d.turma}</span>
                          {d.canceladaHoje && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-extrabold">
                              AULA CANCELADA
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-gray-700 mt-0.5">{d.nome}</div>
                      </div>
                      <span className="text-[11px] bg-gray-100 px-2 py-0.5 rounded font-semibold shrink-0">{d.formato}</span>
                    </div>
                    <div className="text-xs text-gray-600">
                      <span className="font-semibold">{d.prof}</span> · {d.horario}
                    </div>
                    {d.canceladaHoje && d.motivoCancelamento && (
                      <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1">
                        <b>Motivo:</b> {d.motivoCancelamento}
                      </div>
                    )}
                    {d.tambemAtende.length > 0 && <div className="text-[11px] text-blue-600">Também atende: {d.tambemAtende.join(", ")}</div>}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100">
                      <div>
                        {d.canceladaHoje ? (
                          <span className="font-extrabold text-sm text-red-700">SEM AULA</span>
                        ) : (
                          <>
                            <span className="font-bold text-sm text-[#B45309]">{d.sala}</span>
                            <span className="text-xs text-gray-500 ml-1.5">({d.predio})</span>
                          </>
                        )}
                        {d.alteradaHoje && !d.canceladaHoje && <span className="ml-2 text-[10px] font-semibold text-blue-600">alterada {ehHoje ? "hoje" : "neste dia"}</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => abrirEdicao(d)} title="Alterar sala, professor ou cancelar aula" className="btn btn-icone">
                          <i className="fa-solid fa-pen"></i>
                        </button>
                        <button onClick={() => abrirWhatsApp(d)} className="btn btn-principal btn-sm"><i className="fa-solid fa-bell"></i> Aviso</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto cartao">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="tabela-cab">
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
                        <span className="flex flex-col items-center gap-2 py-4">
                          <span aria-hidden="true" className="relative w-20 h-20">
                            <span className="absolute left-2 -top-1 w-8 h-[4.4rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C]" />
                            <span className="absolute left-10 top-4 w-6 h-[3.4rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-slate-600 to-[#1A2332]" />
                          </span>
                          <b className="text-base text-[#1A2332]">Nenhuma aula neste dia</b>
                          <span className="text-sm">Use as setas para ver outro dia.</span>
                        </span>
                      </td></tr>
                    )}
                    {dashboard.map((d) => {
                      const ehLab = d.sala.toUpperCase().startsWith("LAB") || d.reqespaco === "Laboratório/Prático";
                      const ehEad = d.sala === "EAD" || d.formato === "Assíncrona" || d.formato === "Síncrona";
                      return (
                        <tr key={d.id} className={`transition ${d.canceladaHoje ? "bg-red-50/40 hover:bg-red-50/70" : "hover:bg-gray-50/90"}`}>
                          <td className="p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`font-extrabold text-[14px] tracking-tight ${d.canceladaHoje ? "text-red-800 line-through" : "text-[#1A2332]"}`}>{d.turma}</span>
                              {d.horario !== "—" && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                  <i className="fa-regular fa-clock text-[10px] text-[#B45309]"></i>
                                  {d.horario}
                                </span>
                              )}
                              {d.canceladaHoje && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-extrabold">
                                  AULA CANCELADA
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                              <span className="font-semibold text-gray-800">{d.nome}</span>
                              <span className="text-gray-300">•</span>
                              <span className="text-gray-500 font-medium">
                                <i className="fa-solid fa-chalkboard-user text-[10px] text-gray-400 mr-1"></i>
                                {d.prof}
                              </span>
                            </div>
                            {d.canceladaHoje && d.motivoCancelamento && (
                              <div className="text-xs text-red-700 mt-1"><b>Motivo:</b> {d.motivoCancelamento}</div>
                            )}
                            {d.tambemAtende.length > 0 && <div className="text-xs text-blue-600 mt-0.5">Também atende: {d.tambemAtende.join(", ")}</div>}
                          </td>
                          <td className="p-4"><span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-semibold">{d.formato}</span></td>
                          <td className="p-4 font-bold">
                            {d.canceladaHoje ? (
                              <>
                                <span className="inline-flex items-center gap-1.5 text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-lg font-extrabold">
                                  <i className="fa-solid fa-ban text-[10px]"></i> SEM AULA
                                </span>
                                <div className="text-[10px] font-semibold text-red-600 mt-0.5">cancelada {ehHoje ? "hoje" : "neste dia"}</div>
                              </>
                            ) : (
                              <>
                                <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-extrabold ${
                                  ehEad
                                    ? "bg-slate-100 text-slate-700"
                                    : ehLab
                                      ? "bg-[#FFF4E5] text-[#B45309] border border-orange-200/70"
                                      : "bg-gray-100 text-[#1A2332]"
                                }`}>
                                  <i className={`fa-solid ${ehEad ? "fa-globe" : ehLab ? "fa-computer" : "fa-door-open"} text-[10px]`}></i>
                                  {d.sala}
                                </span>
                                {d.alteradaHoje && <div className="text-[10px] font-semibold text-blue-600 mt-0.5">alterada {ehHoje ? "hoje" : "neste dia"}</div>}
                              </>
                            )}
                          </td>
                          <td className="p-4 text-xs text-gray-500 font-medium">{d.canceladaHoje ? "—" : d.predio}</td>
                          <td className="p-4 text-center">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                              d.rodizio !== "Não" ? "bg-orange-100 text-[#B45309]" : "bg-gray-100 text-gray-700"
                            }`}>
                              {d.rodizio !== "Não" ? "Rodízio Ativo" : "Alocação Fixa"}
                            </span>
                          </td>
                          <td className="p-4 text-center">
                            <div className="flex justify-center items-center gap-2">
                              <button onClick={() => abrirEdicao(d)} title="Alterar sala, professor ou cancelar aula" className="btn btn-icone">
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button onClick={() => abrirWhatsApp(d)} className="btn btn-principal btn-sm"><i className="fa-solid fa-bell"></i> Aviso</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* 2. GRADE DO SEMESTRE */}
          {tab === "gerador" && (() => {
            const gradeSemConsome = grade.filter((t) => !t.consome && t.conflitos.length > 0);
            const conflitosFiltrados = gradeSemConsome.filter((t) => t.conflitos.some((c) => c.gravidade === "ERRO")).length;
            const confirmarFiltrados = gradeSemConsome.filter((t) => !t.conflitos.some((c) => c.gravidade === "ERRO")).length;
            const rotuloDiaSel = gDia !== "TODOS" ? OPCOES_DIA.find(([v]) => v === gDia)?.[1] ?? gDia : null;

            const conflitosPorDia = OPCOES_DIA.map(([valor, rotulo]) => {
              const turmasDia = dados.turmas
                .filter((t) => !t.consome && t.dia === valor)
                .filter((t) => gTurma === "TODOS" || t.turma === gTurma)
                .filter((t) => gProf === "TODOS" || t.prof === gProf)
                .filter((t) => gEspaco === "TODOS" || t.reqespaco === gEspaco);
              const erros = turmasDia.filter((t) => t.conflitos.some((c) => c.gravidade === "ERRO")).length;
              const avisos = turmasDia.filter((t) => t.conflitos.length > 0 && !t.conflitos.some((c) => c.gravidade === "ERRO")).length;
              return { valor, rotulo, curto: rotulo.split("-")[0], erros, avisos };
            });

            return (
              <section className="space-y-5">
                <h2 className="hidden print:block text-lg font-bold">Oferta {dados.oferta} · UNISAPIENS</h2>

                {/* BANNER PRINCIPAL DA MATRIZ DE OFERTA (padronizado com o Dashboard) */}
                <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
                  <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
                  <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
                  <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

                  <div className="relative space-y-2.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
                        <i className="fa-solid fa-calendar-days text-[#FDBA74]"></i> Matriz de Oferta Acadêmica
                      </span>
                      <select
                        value={dados.oferta}
                        onChange={(e) => trocarOferta(e.target.value)}
                        aria-label="Selecionar oferta do semestre"
                        className="bg-white/15 hover:bg-white/25 text-white border border-white/25 rounded-full px-3.5 py-1 text-xs font-extrabold outline-none cursor-pointer transition"
                      >
                        {dados.ofertas.map((o) => (
                          <option key={o.codigo} value={o.codigo} className="text-[#1A2332] bg-white font-bold">
                            {o.codigo} · {o.status === "PUBLICADA" ? "publicada" : o.status === "RASCUNHO" ? "rascunho" : "arquivada"}
                          </option>
                        ))}
                      </select>
                      {dados.oferta !== "—" && (
                        <button
                          onClick={abrirGerar}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-white text-xs font-extrabold transition"
                        >
                          <i className="fa-solid fa-forward text-[#FDBA74]"></i> Gerar {proximoCodigo(dados.oferta)}
                        </button>
                      )}
                    </div>

                    <div>
                      <h3 className="text-xl md:text-2xl font-black tracking-tight">
                        Semestre {dados.oferta}{rotuloDiaSel ? ` · ${rotuloDiaSel}` : ""}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {conflitosFiltrados === 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500/25 border border-emerald-300/40 text-white text-xs font-extrabold tabular-nums">
                          <i className="fa-solid fa-circle-check text-emerald-300"></i> 0 Conflitos{rotuloDiaSel ? ` na ${rotuloDiaSel.split("-")[0]}` : " Detectados"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-red-500/85 text-white text-xs font-extrabold shadow-xs tabular-nums">
                          <i className="fa-solid fa-triangle-exclamation"></i> {conflitosFiltrados} Conflito(s){rotuloDiaSel ? ` na ${rotuloDiaSel.split("-")[0]}` : " Detectado(s)"}
                        </span>
                      )}
                      {confirmarFiltrados > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-400/25 border border-amber-200/45 text-amber-100 text-xs font-extrabold tabular-nums">
                          <i className="fa-solid fa-circle-info text-amber-300"></i> {confirmarFiltrados} para confirmar
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        {dados.cursos.length} cursos · {dados.grupos.length} turmas
                      </span>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center gap-2 shrink-0">
                    {dados.totalConflitos > 0 && (
                      <button
                        onClick={abrirResolverTodos}
                        className="btn btn-sm bg-white text-[#1A2332] hover:bg-orange-50 shadow-md font-extrabold"
                      >
                        <i className="fa-solid fa-wand-magic-sparkles text-[#C2410C]"></i> Resolver Conflitos
                      </button>
                    )}
                    <a
                      href="/api/exportar"
                      title="Planilha no formato da oferta (pode ser importada de volta)"
                      className="btn btn-sm bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-xs"
                    >
                      <i className="fa-solid fa-file-excel text-emerald-300"></i> Excel
                    </a>
                    <button
                      onClick={() => window.print()}
                      title="Imprimir ou salvar como PDF"
                      className="btn btn-sm bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-xs"
                    >
                      <i className="fa-solid fa-file-pdf text-rose-300"></i> PDF
                    </button>
                    <button
                      onClick={() => router.refresh()}
                      title="Busca os dados de novo e reconfere os choques"
                      className="btn btn-sm bg-[#1A2332]/80 hover:bg-[#1A2332] text-white border border-white/20"
                    >
                      <i className="fa-solid fa-arrows-rotate"></i> Atualizar
                    </button>
                  </div>
                </div>

                {/* BARRA DE FILTROS DA GRADE */}
                <div className="print:hidden p-5 space-y-3.5 cartao">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                        <i className="fa-solid fa-sliders"></i>
                      </span>
                      <span className="text-xs font-extrabold uppercase tracking-wider text-[#1A2332]">
                        Filtrar Matriz de Oferta
                      </span>
                    </div>
                    {(gTurma !== "TODOS" || gDia !== "TODOS" || gProf !== "TODOS" || gEspaco !== "TODOS") && (
                      <button
                        type="button"
                        onClick={() => {
                          setGTurma("TODOS");
                          setGDia("TODOS");
                          setGProf("TODOS");
                          setGEspaco("TODOS");
                        }}
                        className="text-xs font-extrabold text-[#B45309] hover:underline flex items-center gap-1"
                      >
                        <i className="fa-solid fa-rotate-left text-[10px]"></i> Limpar filtros
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-users text-[#B45309] mr-1"></i> Curso / Turma
                      </label>
                      <select value={gTurma} onChange={(e) => setGTurma(e.target.value)} className={filtroSel}>
                        <option value="TODOS">Todos os Cursos</option>
                        {dados.grupos.map((g) => <option key={g.id} value={g.nome}>{g.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-regular fa-calendar text-[#B45309] mr-1"></i> Dia da Semana
                      </label>
                      <select value={gDia} onChange={(e) => setGDia(e.target.value)} className={filtroSel}>
                        <option value="TODOS">Todos os Dias</option>
                        {OPCOES_DIA.map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-chalkboard-user text-[#B45309] mr-1"></i> Professor
                      </label>
                      <select value={gProf} onChange={(e) => setGProf(e.target.value)} className={filtroSel}>
                        <option value="TODOS">Todos os Professores</option>
                        {dados.professores.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-computer text-[#B45309] mr-1"></i> Tipo de Ambiente
                      </label>
                      <select value={gEspaco} onChange={(e) => setGEspaco(e.target.value)} className={filtroSel}>
                        <option value="TODOS">Todos os Tipos</option>
                        <option value="Laboratório/Prático">Laboratórios</option>
                        <option value="Presencial Teórico">Salas Teóricas</option>
                      </select>
                    </div>
                  </div>
                </div>

              {/* VISÃO CELULAR DA GRADE */}
              <div className="md:hidden space-y-3">
                {grade.length === 0 && (
                  <div className="cartao p-6 text-center text-gray-400 text-sm">Nenhuma turma com esses filtros.</div>
                )}
                {grade.map((d) => {
                  const erro = d.conflitos.some((c) => c.gravidade === "ERRO");
                  return (
                    <div key={d.id} className="cartao p-4 space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-xs font-extrabold text-[#B45309]">{d.dia || "EAD"}</span>
                          {d.horario !== "—" && <span className="text-xs text-gray-500 ml-1.5">· {d.horario}</span>}
                          <div className="font-bold text-sm text-gray-900 mt-0.5">{d.turma}</div>
                        </div>
                        {d.conflitos.length === 0 ? <Selo tipo="ok" /> : <Selo tipo={erro ? "erro" : "confirmar"} />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-800">{d.nome}</div>
                        <div className="text-xs text-gray-500">{d.prof}</div>
                        {d.consome && <div className="text-[11px] text-blue-600">assiste turma de outro curso</div>}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-gray-100 text-xs">
                        <div>
                          <span className="font-bold text-[#B45309]">{d.sala}</span>
                          <span className="text-gray-500 ml-1">({d.formato})</span>
                        </div>
                        {d.conflitos.length > 0 && !d.consome && d.dia && (
                          <button onClick={() => abrirRealocar(d.id)} className="text-xs font-bold text-[#B45309] hover:underline flex items-center gap-1">
                            <i className="fa-solid fa-right-left"></i> Realocar
                          </button>
                        )}
                      </div>
                      {d.conflitos.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {d.conflitos.map((c, i) => (
                            <div key={i} className="text-[11px] text-gray-600 bg-gray-50 rounded-lg px-2.5 py-1.5">{c.mensagem}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="hidden md:block overflow-x-auto cartao">
                <table className="w-full text-left border-collapse text-sm min-w-[760px]">
                  <thead>
                    <tr className="tabela-cab">
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
                      const ehLab = d.sala.toUpperCase().startsWith("LAB") || d.reqespaco === "Laboratório/Prático";
                      const ehEad = d.sala === "EAD" || d.formato === "Assíncrona" || d.formato === "Síncrona";
                      return (
                        <tr key={d.id} className="hover:bg-gray-50/90 align-top transition">
                          <td className="p-3.5 font-bold text-[#1A2332] whitespace-nowrap">
                            <div>{d.dia || "EAD"}</div>
                            {d.horario !== "—" && (
                              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                <i className="fa-regular fa-clock text-[9px] text-[#B45309]"></i>
                                {d.horario}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div className="font-extrabold text-[#1A2332]">{d.turma}</div>
                            {d.alunos != null && (
                              <div className="text-[11px] font-semibold text-gray-500 mt-0.5 tabular-nums">
                                <i className="fa-solid fa-user-group text-[9px] text-gray-400 mr-1"></i>
                                {d.alunos} alunos
                              </div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div className="font-semibold text-gray-900">{d.nome}</div>
                            <div className="text-xs text-gray-500 font-medium mt-0.5">
                              <i className="fa-solid fa-chalkboard-user text-[10px] text-gray-400 mr-1"></i>
                              {d.prof}
                            </div>
                            {d.consome && <div className="text-xs text-blue-600 mt-0.5 font-medium">assiste turma de outro curso</div>}
                          </td>
                          <td className="p-3.5"><span className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-semibold">{d.formato}</span></td>
                          <td className="p-3.5">
                            <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-extrabold ${
                              ehEad
                                ? "bg-slate-100 text-slate-700"
                                : ehLab
                                  ? "bg-[#FFF4E5] text-[#B45309] border border-orange-200/70"
                                  : "bg-gray-100 text-[#1A2332]"
                            }`}>
                              <i className={`fa-solid ${ehEad ? "fa-globe" : ehLab ? "fa-computer" : "fa-door-open"} text-[10px]`}></i>
                              {d.sala}
                            </span>
                            <div className="text-[11px] text-gray-400 mt-1">{d.reqespaco}</div>
                          </td>
                          <td className="p-3.5 text-center">
                            {d.conflitos.length === 0 ? <Selo tipo="ok" /> : <Selo tipo={erro ? "erro" : "confirmar"} />}
                            {d.conflitos.map((c, i) => (
                              <div key={i} className="text-[10px] text-gray-500 text-left mt-1 max-w-xs">{c.mensagem}</div>
                            ))}
                            {d.conflitos.length > 0 && !d.consome && d.dia && (
                              <button onClick={() => abrirRealocar(d.id)} className="mt-2 text-xs font-bold text-[#B45309] hover:underline flex items-center gap-1">
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
            );
          })()}

          {/* 3. HORÁRIO DA SEMANA */}
          {tab === "horario-semana" && <TelaSemana dados={dados} />}

          {/* 4. IMPORTAR PLANILHA */}
          {tab === "importar" && <TelaImportar ofertaAtual={dados.oferta} />}

          {/* 5. HISTÓRICO DE AVISOS */}
          {tab === "historico" && <TelaHistorico avisos={dados.avisos} admin={usuario.admin} />}

          {/* CADASTROS BASE */}
          {tab === "turmas" && (() => {
            const termoTurma = turmasBusca.trim().toLowerCase();
            const cursosFiltrados = dados.cursos.filter(
              (c) => !termoTurma || `${c.nome} ${c.sigla}`.toLowerCase().includes(termoTurma)
            );
            const gruposFiltrados = dados.grupos.filter((t) => {
              if (turmasCursoFiltro !== null && t.cursoId !== turmasCursoFiltro) return false;
              if (!termoTurma) return true;
              return `${t.nome} ${t.cursoNome} ${t.cursoSigla} ${rotuloBlocoTurma(t)}`.toLowerCase().includes(termoTurma);
            });

            // Agrupa turmas por curso para manter a organização visual nos blocos
            const gruposPorCurso = cursosFiltrados
              .map((c) => ({
                curso: c,
                turmas: gruposFiltrados.filter((t) => t.cursoId === c.id),
              }))
              .filter((g) => g.turmas.length > 0);

            const totalAlunos = dados.grupos.reduce((s, g) => s + (g.alunos ?? 0), 0);

            return (
              <section className="space-y-5">
                {/* BANNER PRINCIPAL DE CURSOS E TURMAS */}
                <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
                  <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
                  <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
                  <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

                  <div className="relative space-y-2.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
                        <i className="fa-solid fa-graduation-cap text-[#FDBA74]"></i> Cadastros Acadêmicos
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl md:text-2xl font-black tracking-tight">
                        Cursos e Turmas
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-bookmark text-[#FDBA74]"></i> {dados.cursos.length} curso(s)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-users-rectangle text-[#FDBA74]"></i> {dados.grupos.length} turma(s)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-user-graduate text-emerald-300"></i> {totalAlunos} aluno(s)
                      </span>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => abrirCadastro("curso")}
                      className="btn btn-sm bg-white/15 hover:bg-white/25 text-white border border-white/25 font-extrabold backdrop-blur-xs"
                    >
                      <i className="fa-solid fa-graduation-cap"></i> Novo Curso
                    </button>
                    <button
                      onClick={() => abrirCadastro("turma")}
                      className="btn btn-sm bg-white text-[#1A2332] hover:bg-orange-50 shadow-md font-extrabold"
                    >
                      <i className="fa-solid fa-plus text-[#C2410C]"></i> Nova Turma
                    </button>
                  </div>
                </div>

                {/* BARRA DE BUSCA E VISUALIZAÇÃO */}
                <div className="p-5 space-y-3.5 cartao">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                        <i className="fa-solid fa-sliders"></i>
                      </span>
                      <h3 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
                        Filtrar Cursos e Turmas
                      </h3>
                    </div>
                    {(turmasCursoFiltro !== null || turmasBusca.trim() !== "") && (
                      <button
                        type="button"
                        onClick={() => {
                          setTurmasCursoFiltro(null);
                          setTurmasBusca("");
                        }}
                        className="text-xs font-extrabold text-[#B45309] hover:underline flex items-center gap-1"
                      >
                        <i className="fa-solid fa-rotate-left text-[10px]"></i> Limpar filtros
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-9">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-magnifying-glass text-[#B45309] mr-1"></i> Buscar Curso, Sigla ou Turma
                      </label>
                      <input
                        data-busca
                        value={turmasBusca}
                        onChange={(e) => setTurmasBusca(e.target.value)}
                        type="text"
                        placeholder="Ex: SIST. DE INFORM., SI, 4º A, Vespertino...  ( / )"
                        className="campo campo-sm w-full"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-table-cells-large text-[#B45309] mr-1"></i> Modo de Exibição
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-[#F1F3F6] p-1 rounded-[14px]">
                        <button
                          type="button"
                          onClick={() => setTurmasModo("blocos")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            turmasModo === "blocos" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-grip"></i> Blocos
                        </button>
                        <button
                          type="button"
                          onClick={() => setTurmasModo("lista")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            turmasModo === "lista" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-list"></i> Lista
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Cursos Cadastrados */}
                <div className="p-4 cartao space-y-3">
                  <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-100 pb-2">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                      Cursos Cadastrados ({cursosFiltrados.length})
                    </h4>
                    {turmasCursoFiltro !== null && (
                      <button
                        onClick={() => setTurmasCursoFiltro(null)}
                        className="text-xs font-bold text-[#B45309] hover:underline flex items-center gap-1"
                      >
                        <i className="fa-solid fa-filter-circle-xmark"></i> Mostrar todas as turmas
                      </button>
                    )}
                  </div>

                  {cursosFiltrados.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">Nenhum curso encontrado.</p>
                  ) : turmasModo === "blocos" ? (
                    <div className="flex flex-wrap gap-2">
                      {cursosFiltrados.map((c) => {
                        const s = c.sigla.toUpperCase();
                        const siglaBloco = s.length === 2 ? `${s[0]}.${s[1]}` : s;
                        const cor = corDoCurso(c.id);
                        const selecionado = turmasCursoFiltro === c.id;
                        return (
                          <div
                            key={c.id}
                            onClick={() => setTurmasCursoFiltro(selecionado ? null : c.id)}
                            title={`${c.nome} — clique para filtrar as turmas deste curso`}
                            className={`group cursor-pointer inline-flex items-center gap-2.5 pl-3 pr-2 py-2 rounded-xl border transition select-none ${
                              selecionado
                                ? `${cor.ativo} shadow-sm`
                                : "bg-white border-gray-200 hover:border-gray-300 hover:bg-gray-50/80"
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${selecionado ? "bg-white" : cor.ponto}`}></span>
                            <div className="flex items-baseline gap-1.5">
                              <span className={`font-extrabold text-sm tracking-tight ${selecionado ? "text-white" : "text-[#1A2332]"}`}>
                                {siglaBloco}
                              </span>
                              <span className={`text-[11px] font-medium hidden sm:inline ${selecionado ? "text-white/85" : "text-gray-500"}`}>
                                {c.nome}
                              </span>
                            </div>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                selecionado ? "bg-black/20 text-white" : cor.selo
                              }`}
                            >
                              {c.turmas}
                            </span>
                            <span
                              className="flex items-center gap-0.5 ml-0.5 opacity-60 group-hover:opacity-100 transition"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => abrirCadastro("curso", c.id)}
                                title="Editar curso"
                                className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] ${
                                  selecionado ? "hover:bg-white/20 text-white" : "hover:bg-gray-200/70 text-gray-600"
                                }`}
                              >
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button
                                onClick={() => excluir("curso", c.id)}
                                title="Excluir curso"
                                className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] ${
                                  selecionado ? "hover:bg-white/20 text-white" : "hover:bg-red-50 text-gray-600 hover:text-red-600"
                                }`}
                              >
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-sm">
                      {cursosFiltrados.map((c) => {
                        const cor = corDoCurso(c.id);
                        return (
                          <div
                            key={c.id}
                            className={`p-3 rounded-[14px] border border-gray-200 border-l-4 ${cor.borda} flex justify-between items-center bg-gray-50/50`}
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 truncate">{c.nome}</p>
                              <p className="text-xs text-gray-500">Sigla: <b>{c.sigla}</b> • {c.turmas} turma(s)</p>
                            </div>
                            <span className="flex shrink-0">
                              <button onClick={() => abrirCadastro("curso", c.id)} title="Editar curso" className="btn btn-icone">
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button onClick={() => excluir("curso", c.id)} title="Excluir curso" className="btn btn-icone hover:text-red-600">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Turmas Cadastradas */}
                <div className="p-4 cartao space-y-4">
                  <div className="flex justify-between items-center border-b border-gray-100 pb-2">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                      Turmas Cadastradas ({gruposFiltrados.length})
                    </h4>
                    {turmasModo === "blocos" && (
                      <span className="text-[11px] text-gray-400">Clique em um bloco para editar a turma</span>
                    )}
                  </div>

                  {gruposFiltrados.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2">Nenhuma turma encontrada.</p>
                  ) : turmasModo === "blocos" ? (
                    <div className="space-y-4">
                      {gruposPorCurso.map(({ curso: c, turmas: lista }) => {
                        const cor = corDoCurso(c.id);
                        return (
                          <div key={c.id} className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${cor.ponto}`}></span>
                              <span className="text-xs font-bold text-gray-700">{c.nome}</span>
                              <span className="text-[11px] text-gray-400">({lista.length})</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                              {lista.map((t) => {
                                const ehVesp = t.turno === "VESPERTINO" || /\bVESP/i.test(t.nome);
                                const temWa = t.wa && t.wa !== "—";
                                return (
                                  <div
                                    key={t.id}
                                    onClick={() => abrirCadastro("turma", t.id)}
                                    title={`${t.nome} — Clique para editar`}
                                    className={`group relative cursor-pointer px-3 py-2.5 rounded-xl border border-gray-200 border-l-4 ${cor.borda} bg-white hover:shadow-md hover:border-gray-300 transition flex items-center justify-between gap-2`}
                                  >
                                    <div className="min-w-0">
                                      <p className="font-extrabold text-sm text-[#1A2332] tracking-tight truncate">
                                        {rotuloBlocoTurma(t)}
                                      </p>
                                      <div className="flex items-center gap-1.5 mt-1 text-[10px] font-semibold text-gray-500">
                                        <span className={`px-1.5 py-0.2 rounded ${ehVesp ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                                          {ehVesp ? "Vesp" : "Not"}
                                        </span>
                                        {t.alunos != null && (
                                          <span title="Quantidade de alunos">• {t.alunos} al.</span>
                                        )}
                                        {temWa && (
                                          <i className="fa-solid fa-link text-emerald-600" title="Link de grupo configurado"></i>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        excluir("turma", t.id);
                                      }}
                                      title="Excluir turma"
                                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0"
                                    >
                                      <i className="fa-solid fa-trash text-xs"></i>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 text-sm">
                      {gruposFiltrados.map((t) => (
                        <li key={t.id} className="py-3 flex justify-between items-center">
                          <div>
                            <p className="font-bold text-gray-900">{t.nome}</p>
                            <p className="text-xs text-gray-500">Curso: {t.cursoNome} | Alunos: {t.alunos ?? "—"} | WA: {t.wa}</p>
                          </div>
                          <span className="flex">
                            <button onClick={() => abrirCadastro("turma", t.id)} title="Editar turma" className="btn btn-icone">
                              <i className="fa-solid fa-pen"></i>
                            </button>
                            <button onClick={() => excluir("turma", t.id)} title="Excluir turma" className="btn btn-icone hover:text-red-600">
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })()}

          {tab === "professores" && (() => {
            const termoProf = profBusca.trim().toLowerCase();
            const profsFiltrados = dados.professores.filter(
              (p) => !termoProf || `${p.nome} ${p.email}`.toLowerCase().includes(termoProf)
            );
            const profsComRestricao = dados.professores.filter((p) => p.dias.length > 0).length;
            const totalAulasAlocadas = dados.turmas.filter((t) => !t.consome && t.profId != null).length;

            return (
              <section className="space-y-5">
                {/* BANNER PRINCIPAL DE PROFESSORES */}
                <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
                  <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
                  <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
                  <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

                  <div className="relative space-y-2.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
                        <i className="fa-solid fa-chalkboard-user text-[#FDBA74]"></i> Cadastros Acadêmicos
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl md:text-2xl font-black tracking-tight">
                        Corpo Docente
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-user-tie text-[#FDBA74]"></i> {dados.professores.length} docente(s)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-book-open text-emerald-300"></i> {totalAulasAlocadas} aula(s) atribuída(s)
                      </span>
                      {profsComRestricao > 0 && (
                        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                          <i className="fa-solid fa-calendar-xmark text-amber-300"></i> {profsComRestricao} com restrição de dia
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => abrirCadastro("professor")}
                      className="btn btn-sm bg-white text-[#1A2332] hover:bg-orange-50 shadow-md font-extrabold"
                    >
                      <i className="fa-solid fa-plus text-[#C2410C]"></i> Novo Professor
                    </button>
                  </div>
                </div>

                {/* BARRA DE BUSCA E VISUALIZAÇÃO */}
                <div className="p-5 space-y-3.5 cartao">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                        <i className="fa-solid fa-sliders"></i>
                      </span>
                      <h3 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
                        Filtrar Corpo Docente
                      </h3>
                    </div>
                    {profBusca.trim() !== "" && (
                      <button
                        type="button"
                        onClick={() => setProfBusca("")}
                        className="text-xs font-extrabold text-[#B45309] hover:underline flex items-center gap-1"
                      >
                        <i className="fa-solid fa-rotate-left text-[10px]"></i> Limpar busca
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-9">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-magnifying-glass text-[#B45309] mr-1"></i> Buscar Docente por Nome ou E-mail
                      </label>
                      <input
                        type="text"
                        value={profBusca}
                        onChange={(e) => setProfBusca(e.target.value)}
                        data-busca
                        placeholder="Ex: Maria, @unisapiens.edu.br...  ( / )"
                        className="campo campo-sm w-full"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-table-cells-large text-[#B45309] mr-1"></i> Modo de Exibição
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-[#F1F3F6] p-1 rounded-[14px]">
                        <button
                          type="button"
                          onClick={() => setProfModo("blocos")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            profModo === "blocos" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-grip"></i> Blocos
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfModo("lista")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            profModo === "lista" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-list"></i> Lista
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 cartao space-y-4">
                  <div className="flex items-center justify-between border-b border-gray-100 pb-2.5">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                      Docentes Cadastrados ({profsFiltrados.length})
                    </span>
                  </div>

                  {profsFiltrados.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhum professor encontrado com esse filtro.</p>
                  ) : profModo === "blocos" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {profsFiltrados.map((p) => {
                        const aulasProf = dados.turmas.filter((t) => !t.consome && (t.profId === p.id || t.profGrade === p.nome));
                        const diasLeciona = [...new Set(aulasProf.map((a) => a.dia).filter(Boolean))];
                        return (
                          <div
                            key={p.id}
                            className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-4 shadow-2xs hover:shadow-md hover:border-[#F39200]/60 transition flex flex-col justify-between gap-3"
                          >
                            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1A2332] to-[#F39200]" />
                            <div className="flex items-start gap-3">
                              <div className="w-10 h-10 rounded-xl bg-[#1A2332] text-[#F39200] font-black text-xs flex items-center justify-center shrink-0">
                                {iniciais(p.nome)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-extrabold text-sm text-[#1A2332] truncate" title={p.nome}>
                                  {p.nome}
                                </div>
                                <p className="text-[11px] text-gray-500 truncate mt-0.5" title={p.email}>
                                  {p.email}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                              <span className="px-2 py-0.5 rounded-full bg-[#FFF4E5] text-[#B45309] font-extrabold tabular-nums">
                                {aulasProf.length} {aulasProf.length === 1 ? "aula" : "aulas"}
                              </span>
                              {diasLeciona.map((dia) => (
                                <span key={dia} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
                                  {dia.slice(0, 3)}
                                </span>
                              ))}
                              {p.dias.length > 0 && (
                                <span
                                  title={`Indisponível: ${p.dias.join(", ")}`}
                                  className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-bold"
                                >
                                  <i className="fa-solid fa-calendar-xmark mr-1 text-[10px]"></i>
                                  {p.dias.length} rest.
                                </span>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-gray-100">
                              <button onClick={() => abrirCadastro("professor", p.id)} title="Editar professor" className="btn btn-icone !w-7 !h-7 text-xs">
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button onClick={() => excluir("professor", p.id)} title="Excluir professor" className="btn btn-icone !w-7 !h-7 text-xs hover:text-red-600">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 text-sm">
                      {profsFiltrados.map((p) => {
                        const qtdAulas = dados.turmas.filter((t) => !t.consome && (t.profId === p.id || t.profGrade === p.nome)).length;
                        return (
                          <li key={p.id} className="py-3 flex justify-between items-center gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-xl bg-[#1A2332] text-[#F39200] font-black text-xs flex items-center justify-center shrink-0">
                                {iniciais(p.nome)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-[#1A2332]">{p.nome}</span>
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FFF4E5] text-[#B45309] font-extrabold tabular-nums">
                                    {qtdAulas} aula(s)
                                  </span>
                                  {p.dias.length > 0 && (
                                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 font-bold">
                                      Restrição: {p.dias.join(", ")}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 truncate">{p.email}</p>
                              </div>
                            </div>
                            <span className="flex shrink-0">
                              <button onClick={() => abrirCadastro("professor", p.id)} title="Editar" className="btn btn-icone">
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button onClick={() => excluir("professor", p.id)} title="Excluir" className="btn btn-icone hover:text-red-600">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            );
          })()}

          {tab === "salas" && (() => {
            const termoSala = salasBusca.trim().toLowerCase();
            const salasFiltradas = dados.salas
              .filter((s) => salasTipoFiltro === "TODOS" || s.tipo === salasTipoFiltro)
              .filter((s) => !termoSala || `${s.nome} ${s.tipo} ${s.predio}`.toLowerCase().includes(termoSala));
            const totalLabs = dados.salas.filter((s) => s.tipo === "Laboratório/Prático").length;
            const totalTeoricas = dados.salas.length - totalLabs;

            return (
              <section className="space-y-5">
                {/* BANNER PRINCIPAL DE SALAS E LABORATÓRIOS */}
                <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
                  <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
                  <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
                  <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

                  <div className="relative space-y-2.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
                        <i className="fa-solid fa-door-open text-[#FDBA74]"></i> Infraestrutura Acadêmica
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl md:text-2xl font-black tracking-tight">
                        Salas e Laboratórios
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-building text-[#FDBA74]"></i> {dados.salas.length} espaço(s)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-computer text-emerald-300"></i> {totalLabs} laboratório(s)
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-chalkboard text-[#FDBA74]"></i> {totalTeoricas} sala(s) específica(s)
                      </span>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => abrirCadastro("sala")}
                      className="btn btn-sm bg-white text-[#1A2332] hover:bg-orange-50 shadow-md font-extrabold"
                    >
                      <i className="fa-solid fa-plus text-[#C2410C]"></i> Novo Espaço
                    </button>
                  </div>
                </div>

                {/* BARRA DE BUSCA E FILTROS DE ESPAÇOS */}
                <div className="p-5 space-y-3.5 cartao">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                        <i className="fa-solid fa-sliders"></i>
                      </span>
                      <h3 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
                        Filtrar Espaços Físicos
                      </h3>
                    </div>
                    {(salasTipoFiltro !== "TODOS" || salasBusca.trim() !== "") && (
                      <button
                        type="button"
                        onClick={() => {
                          setSalasTipoFiltro("TODOS");
                          setSalasBusca("");
                        }}
                        className="text-xs font-extrabold text-[#B45309] hover:underline flex items-center gap-1"
                      >
                        <i className="fa-solid fa-rotate-left text-[10px]"></i> Limpar filtros
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-5">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-magnifying-glass text-[#B45309] mr-1"></i> Buscar por Código ou Prédio
                      </label>
                      <input
                        type="text"
                        value={salasBusca}
                        onChange={(e) => setSalasBusca(e.target.value)}
                        data-busca
                        placeholder="Ex: LAB04, SALA26, Central...  ( / )"
                        className="campo campo-sm w-full"
                      />
                    </div>
                    <div className="md:col-span-4">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-filter text-[#B45309] mr-1"></i> Categoria
                      </label>
                      <div className="grid grid-cols-3 gap-1.5 bg-[#F1F3F6] p-1 rounded-[14px]">
                        {([
                          ["TODOS", "Todos"],
                          ["Laboratório/Prático", "Labs"],
                          ["Presencial Teórico", "Salas"],
                        ] as const).map(([val, rotulo]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setSalasTipoFiltro(val)}
                            className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition text-center truncate ${
                              salasTipoFiltro === val
                                ? "bg-[#1A2332] text-white shadow-xs"
                                : "text-gray-600 hover:text-[#1A2332]"
                            }`}
                          >
                            {rotulo}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-table-cells-large text-[#B45309] mr-1"></i> Modo de Exibição
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-[#F1F3F6] p-1 rounded-[14px]">
                        <button
                          type="button"
                          onClick={() => setSalasModo("blocos")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            salasModo === "blocos" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-grip"></i> Blocos
                        </button>
                        <button
                          type="button"
                          onClick={() => setSalasModo("lista")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            salasModo === "lista" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-list"></i> Lista
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 cartao space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                      Espaços Cadastrados ({salasFiltradas.length})
                    </span>
                  </div>

                  {salasFiltradas.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhum espaço encontrado com esse filtro.</p>
                  ) : salasModo === "blocos" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                      {salasFiltradas.map((s) => {
                        const ehLab = s.tipo === "Laboratório/Prático";
                        const aulasNaSala = dados.turmas.filter((t) => !t.consome && (t.salaId === s.id || t.salaGrade === s.nome));
                        return (
                          <div
                            key={s.id}
                            className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-4 shadow-2xs hover:shadow-md hover:border-[#F39200]/60 transition flex flex-col justify-between gap-3"
                          >
                            <span
                              aria-hidden="true"
                              className={`absolute inset-x-0 top-0 h-1 ${
                                ehLab ? "bg-gradient-to-r from-[#F39200] to-[#C2410C]" : "bg-[#1A2332]"
                              }`}
                            />
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0 ${
                                    ehLab ? "bg-[#FFF4E5] text-[#B45309]" : "bg-gray-100 text-[#1A2332]"
                                  }`}
                                >
                                  <i className={`fa-solid ${ehLab ? "fa-computer" : "fa-door-open"}`}></i>
                                </div>
                                <div>
                                  <div className="font-black text-sm text-[#1A2332]">{s.nome}</div>
                                  <div className="text-[11px] text-gray-500">{s.predio}</div>
                                </div>
                              </div>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full font-extrabold shrink-0 ${
                                  ehLab ? "bg-[#FFF4E5] text-[#B45309]" : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {ehLab ? "Laboratório" : "Sala Teórica"}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                              <div className="flex items-center gap-2 text-[11px] font-bold text-gray-600 tabular-nums">
                                <span title="Capacidade máxima">
                                  <i className="fa-solid fa-chair text-gray-400 mr-1"></i>
                                  {s.cap ?? "—"} lug.
                                </span>
                                <span className="text-gray-300">•</span>
                                <span className="text-[#B45309]" title="Aulas alocadas na semana">
                                  {aulasNaSala.length} aula(s)/sem
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button onClick={() => abrirCadastro("sala", s.id)} title="Editar espaço" className="btn btn-icone !w-7 !h-7 text-xs">
                                  <i className="fa-solid fa-pen"></i>
                                </button>
                                <button onClick={() => excluir("sala", s.id)} title="Excluir espaço" className="btn btn-icone !w-7 !h-7 text-xs hover:text-red-600">
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 text-sm">
                      {salasFiltradas.map((s) => {
                        const aulasNaSala = dados.turmas.filter((t) => !t.consome && (t.salaId === s.id || t.salaGrade === s.nome)).length;
                        return (
                          <li key={s.id} className="py-3 flex justify-between items-center gap-3">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-extrabold text-[#B45309]">{s.nome}</span>
                                <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg font-semibold">{s.tipo}</span>
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#FFF4E5] text-[#B45309] font-extrabold tabular-nums">
                                  {aulasNaSala} aula(s)/semana
                                </span>
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5 tabular-nums">
                                Capacidade: <b>{s.cap ?? "—"}</b> alunos · {s.predio}
                              </p>
                            </div>
                            <span className="flex shrink-0">
                              <button onClick={() => abrirCadastro("sala", s.id)} title="Editar" className="btn btn-icone">
                                <i className="fa-solid fa-pen"></i>
                              </button>
                              <button onClick={() => excluir("sala", s.id)} title="Excluir" className="btn btn-icone hover:text-red-600">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </section>
            );
          })()}

          {tab === "disciplinas" && (() => {
            const termoOferta = ofertasBusca.trim().toLowerCase();
            const ofertasFiltradas = [...dados.turmas]
              .filter((d) => ofertasDiaFiltro === "TODOS" || (ofertasDiaFiltro === "EAD" ? !d.dia : d.dia === ofertasDiaFiltro))
              .filter((d) => {
                if (ofertasCursoFiltro === "TODOS") return true;
                const grp = dados.grupos.find((g) => g.id === d.grupoId || g.nome === d.turma);
                return grp ? grp.cursoSigla === ofertasCursoFiltro : d.turma.startsWith(ofertasCursoFiltro);
              })
              .filter((d) => !termoOferta || `${d.nome} ${d.turma} ${d.prof} ${d.sala} ${d.dia}`.toLowerCase().includes(termoOferta))
              .sort(porDiaHora);

            return (
              <section className="space-y-5">
                {/* BANNER PRINCIPAL DE OFERTAS E DISCIPLINAS */}
                <div className="print:hidden relative overflow-hidden rounded-3xl text-white px-6 md:px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)]">
                  <div aria-hidden="true" className="absolute -right-10 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none" />
                  <div aria-hidden="true" className="absolute right-16 -top-28 w-48 h-[21rem] rounded-full rotate-[-35deg] border-[12px] border-orange-100/35 pointer-events-none" />
                  <div aria-hidden="true" className="hidden md:block absolute right-56 -bottom-24 w-24 h-40 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none" />

                  <div className="relative space-y-2.5 max-w-2xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
                        <i className="fa-solid fa-book text-[#FDBA74]"></i> Matriz e Alocação
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl md:text-2xl font-black tracking-tight">
                        Ofertas e Disciplinas · {dados.oferta}
                      </h3>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-layer-group text-[#FDBA74]"></i> {dados.turmas.length} oferta(s) no semestre
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/15 text-white text-xs font-bold tabular-nums">
                        <i className="fa-solid fa-book-bookmark text-emerald-300"></i> {dados.disciplinas.length} disciplina(s) base
                      </span>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={abrirNovaOferta}
                      className="btn btn-sm bg-white text-[#1A2332] hover:bg-orange-50 shadow-md font-extrabold"
                    >
                      <i className="fa-solid fa-plus text-[#C2410C]"></i> Cadastrar Oferta
                    </button>
                  </div>
                </div>

                {/* BARRA DE BUSCA E FILTROS DE OFERTAS */}
                <div className="p-5 space-y-3.5 cartao">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                        <i className="fa-solid fa-sliders"></i>
                      </span>
                      <h3 className="text-xs font-extrabold text-[#1A2332] uppercase tracking-wider">
                        Filtrar Ofertas e Disciplinas
                      </h3>
                    </div>
                    {(ofertasDiaFiltro !== "TODOS" || ofertasCursoFiltro !== "TODOS" || ofertasBusca.trim() !== "") && (
                      <button
                        type="button"
                        onClick={() => {
                          setOfertasDiaFiltro("TODOS");
                          setOfertasCursoFiltro("TODOS");
                          setOfertasBusca("");
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
                        <i className="fa-solid fa-magnifying-glass text-[#B45309] mr-1"></i> Buscar Disciplina, Turma ou Docente
                      </label>
                      <input
                        type="text"
                        value={ofertasBusca}
                        onChange={(e) => setOfertasBusca(e.target.value)}
                        data-busca
                        placeholder="Ex: Banco de Dados, SIST. DE INFORM., LAB01...  ( / )"
                        className="campo campo-sm w-full"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-calendar-day text-[#B45309] mr-1"></i> Dia da Semana
                      </label>
                      <select
                        value={ofertasDiaFiltro}
                        onChange={(e) => setOfertasDiaFiltro(e.target.value)}
                        className="campo campo-sm w-full text-xs font-bold"
                      >
                        <option value="TODOS">Todos os dias</option>
                        {OPCOES_DIA.map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                        <option value="EAD">EAD / Sem dia</option>
                      </select>
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                        <i className="fa-solid fa-table-cells-large text-[#B45309] mr-1"></i> Modo de Exibição
                      </label>
                      <div className="grid grid-cols-2 gap-1.5 bg-[#F1F3F6] p-1 rounded-[14px]">
                        <button
                          type="button"
                          onClick={() => setOfertasModo("blocos")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            ofertasModo === "blocos" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-grip"></i> Blocos
                        </button>
                        <button
                          type="button"
                          onClick={() => setOfertasModo("lista")}
                          className={`py-1.5 px-2 rounded-[10px] text-xs font-extrabold transition flex items-center justify-center gap-1.5 ${
                            ofertasModo === "lista" ? "bg-[#1A2332] text-white shadow-xs" : "text-gray-600 hover:text-[#1A2332]"
                          }`}
                        >
                          <i className="fa-solid fa-list"></i> Lista
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 cartao space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
                      Ofertas Cadastradas ({ofertasFiltradas.length})
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setOfertasCursoFiltro("TODOS")}
                        className={`px-3 py-1 rounded-full text-xs font-extrabold transition ${
                          ofertasCursoFiltro === "TODOS"
                            ? "bg-[#1A2332] text-white shadow-xs"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        Todos os Cursos
                      </button>
                      {dados.cursos.map((c) => {
                        const s = c.sigla.length === 2 ? `${c.sigla[0]}.${c.sigla[1]}` : c.sigla;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setOfertasCursoFiltro(ofertasCursoFiltro === c.sigla ? "TODOS" : c.sigla)}
                            className={`px-3 py-1 rounded-full text-xs font-extrabold transition ${
                              ofertasCursoFiltro === c.sigla
                                ? "bg-[#1A2332] text-white shadow-xs"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {ofertasFiltradas.length === 0 ? (
                    <p className="text-sm text-gray-400 py-6 text-center">Nenhuma oferta encontrada com esses filtros.</p>
                  ) : ofertasModo === "blocos" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {ofertasFiltradas.map((d) => (
                        <div
                          key={d.id}
                          className="group relative overflow-hidden rounded-2xl border border-gray-200/90 bg-white p-4 shadow-2xs hover:shadow-md hover:border-[#F39200]/60 transition flex flex-col justify-between gap-2.5"
                        >
                          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1A2332] to-[#F39200]" />
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-extrabold text-[#B45309] uppercase tracking-wider">
                                {d.turma}
                              </span>
                              <span className="text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                                {d.dia ? `${d.dia.slice(0, 3)} · ${d.horario}` : "EAD"}
                              </span>
                            </div>
                            <div className="font-extrabold text-sm text-[#1A2332] mt-1 leading-snug" title={d.nome}>
                              {d.nome}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                              <i className="fa-solid fa-chalkboard-user text-[10px] text-gray-400"></i>
                              <span className="truncate">{d.prof}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-xs">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-2 py-0.5 rounded-lg bg-[#FFF4E5] text-[#B45309] font-extrabold text-[11px]">
                                {d.salaGrade}
                              </span>
                              {(d.cht || d.chp) && (
                                <span className="text-[11px] text-gray-500 font-semibold tabular-nums">
                                  CH {d.cht || "0h"}/{d.chp || "0h"}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {d.consome ? (
                                <span className="text-[10px] text-blue-600 font-bold px-1.5" title="Edite a aula principal">
                                  compartilhada
                                </span>
                              ) : (
                                <button onClick={() => abrirEdicaoAula(d)} title="Editar oferta" className="btn btn-icone !w-7 !h-7 text-xs">
                                  <i className="fa-solid fa-pen"></i>
                                </button>
                              )}
                              <button onClick={() => excluir("aula", d.id)} title="Excluir oferta" className="btn btn-icone !w-7 !h-7 text-xs hover:text-red-600">
                                <i className="fa-solid fa-trash"></i>
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="divide-y divide-gray-200 text-sm">
                      {ofertasFiltradas.map((d) => (
                        <li key={d.id} className="py-3 flex justify-between items-center gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[#1A2332]">{d.nome}</span>
                              <span className="text-xs font-bold text-[#B45309] bg-[#FFF4E5] px-2 py-0.5 rounded-full">{d.turma}</span>
                              <span className="text-xs font-semibold tabular-nums text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                {d.dia ? `${d.dia} · ${d.horario}` : "EAD"}
                              </span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {d.prof} · Sala: <b>{d.salaGrade}</b>
                              {d.cht || d.chp ? ` · CH: ${d.cht || "0h"}/${d.chp || "0h"}` : ""}
                            </p>
                          </div>
                          <span className="flex items-center shrink-0">
                            {d.consome ? (
                              <span className="text-xs text-blue-600 mr-1" title="Edite a aula principal (a do outro curso)">assiste outro curso</span>
                            ) : (
                              <button onClick={() => abrirEdicaoAula(d)} title="Editar" className="btn btn-icone">
                                <i className="fa-solid fa-pen"></i>
                              </button>
                            )}
                            <button onClick={() => excluir("aula", d.id)} title="Excluir" className="btn btn-icone hover:text-red-600">
                              <i className="fa-solid fa-trash"></i>
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            );
          })()}

          {tab === "usuarios" && usuario.admin && <TelaUsuarios usuarios={dados.usuarios} eu={usuario} />}

          {tab === "whatsapp" && (
            <TelaBot
              avisosPendentes={avisosPendentes}
              telegramOk={dados.telegramOk}
              avisos={dados.avisos}
              assinantes={dados.assinantesTelegram}
              grupos={dados.grupos}
              irParaHistorico={() => setTab("historico")}
            />
          )}
        </div>
      </main>

      <Avisos />
      {/* MODAIS */}
      {trocandoSenha && <ModalSenha onFechar={() => setTrocandoSenha(false)} />}
      {modal === "edit" && editando && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto janela">
            <div>
              <h3 className="text-lg font-bold text-[#1A2332]">Alteração ou Cancelamento de Aula</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                <b>{editando.turma}</b> · {editando.nome} ({nomeDiaVer}, {diaMes(dataVer)})
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setEditCancelada(false);
                  if (!editMsgTocado) {
                    setEditMsgCustom(textoPadraoEdicao(editando, editSala, editProf, false, editMotivo));
                  }
                }}
                className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                  !editCancelada ? "bg-white text-[#1A2332] shadow-xs" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <i className="fa-solid fa-pen"></i> {editando.canceladaHoje ? "Reativar / Trocar Sala" : "Trocar Sala / Docente"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditCancelada(true);
                  if (!editMsgTocado) {
                    setEditMsgCustom(textoPadraoEdicao(editando, editSala, editProf, true, editMotivo));
                  }
                }}
                className={`py-2 px-3 rounded-lg transition flex items-center justify-center gap-1.5 ${
                  editCancelada ? "bg-red-600 text-white shadow-xs" : "text-red-700 hover:bg-red-50"
                }`}
              >
                <i className="fa-solid fa-ban"></i> Cancelar Aula
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {editCancelada ? (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3 text-xs leading-relaxed">
                    <i className="fa-solid fa-circle-exclamation mr-1"></i>
                    A aula ficará marcada como <b>SEM AULA (Cancelada)</b> em <b>{diaMes(dataVer)}</b> e a sala ficará livre.
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Motivo do cancelamento (opcional)</label>
                    <input
                      type="text"
                      value={editMotivo}
                      onChange={(e) => {
                        const novoMotivo = e.target.value;
                        setEditMotivo(novoMotivo);
                        if (!editMsgTocado) {
                          setEditMsgCustom(textoPadraoEdicao(editando, editSala, editProf, true, novoMotivo));
                        }
                      }}
                      placeholder="Ex: Atestado médico, evento acadêmico, viagem..."
                      maxLength={240}
                      className={inp}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {editando.canceladaHoje && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl p-3 text-xs">
                      <i className="fa-solid fa-rotate-left mr-1"></i>
                      Esta aula está cancelada neste dia. Ao salvar, ela será <b>reativada</b>.
                    </div>
                  )}
                  <div>
                    <label className="block font-semibold mb-1">Novo Local</label>
                    <select
                      value={editSala}
                      onChange={(e) => {
                        const novaSala = e.target.value;
                        setEditSala(novaSala);
                        if (!editMsgTocado) {
                          setEditMsgCustom(textoPadraoEdicao(editando, novaSala, editProf, false, editMotivo));
                        }
                      }}
                      className={inp}
                    >
                      {!editSala && <option value="">Sala comum</option>}
                      {dados.salas.map((s) => {
                        const ocupante = dashboard.find((a) => a.id !== editando.id && !a.canceladaHoje && a.sala === s.nome);
                        return (
                          <option key={s.id} value={s.id}>
                            {s.nome} ({s.tipo}){ocupante ? ` — Ocupado: ${ocupante.turma}` : " — Livre"}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">Novo Docente</label>
                    <select
                      value={editProf}
                      onChange={(e) => {
                        const novoProf = e.target.value;
                        setEditProf(novoProf);
                        if (!editMsgTocado) {
                          setEditMsgCustom(textoPadraoEdicao(editando, editSala, novoProf, false, editMotivo));
                        }
                      }}
                      className={inp}
                    >
                      {!editProf && <option value="">A definir</option>}
                      {dados.professores.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-gray-100 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editGerarAviso}
                      onChange={(e) => setEditGerarAviso(e.target.checked)}
                    />
                    Gerar aviso para a turma
                  </label>
                  {editGerarAviso && editMsgTocado && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditMsgTocado(false);
                        setEditMsgCustom(textoPadraoEdicao(editando, editSala, editProf, editCancelada, editMotivo));
                      }}
                      className="text-[11px] font-bold text-[#B45309] hover:underline"
                    >
                      Restaurar texto padrão
                    </button>
                  )}
                </div>
                {editGerarAviso && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Mensagem do aviso (você pode editar antes de salvar):
                    </label>
                    <textarea
                      value={editMsgTocado ? editMsgCustom : textoPadraoEdicao(editando, editSala, editProf, editCancelada, editMotivo)}
                      onChange={(e) => {
                        setEditMsgTocado(true);
                        setEditMsgCustom(e.target.value);
                      }}
                      rows={3}
                      className="campo text-xs w-full leading-relaxed"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              <button
                onClick={salvarEdicao}
                disabled={pendente}
                className={editCancelada ? "btn btn-vermelho" : salvar}
              >
                {editCancelada ? "Confirmar Cancelamento" : editando.canceladaHoje ? "Reativar e Salvar" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "sala" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="p-6 w-full max-w-md space-y-4 janela">
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
              {editId && <button onClick={() => excluir("sala", editId)} disabled={pendente} className="btn btn-perigo mr-auto"><i className="fa-solid fa-trash mr-1"></i>Excluir</button>}
              <button onClick={salvarSala} disabled={pendente} className={salvar}>Salvar Espaço</button>
            </div>
          </div>
        </div>
      )}

      {modal === "professor" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="p-6 w-full max-w-md space-y-4 janela">
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
                      <label key={tela} className={`px-2.5 py-1 rounded-[14px] border text-xs cursor-pointer ${marcado ? "bg-red-50 border-red-300 text-red-700 font-semibold" : "border-gray-200 text-gray-600"}`}>
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
              {editId && <button onClick={() => excluir("professor", editId)} disabled={pendente} className="btn btn-perigo mr-auto"><i className="fa-solid fa-trash mr-1"></i>Excluir</button>}
              <button onClick={salvarProfessor} disabled={pendente} className={salvar}>Salvar Docente</button>
            </div>
          </div>
        </div>
      )}

      {modal === "curso" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="p-6 w-full max-w-md space-y-4 janela">
            <h3 className="text-lg font-bold text-[#1A2332]">{editId ? "Editar" : "Cadastrar"} Curso</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block font-semibold mb-1">Nome do Curso</label>
                <input value={curso.nome} onChange={(e) => setCurso({ ...curso, nome: e.target.value })} type="text" placeholder="Ex: ENG. COMPUTAÇÃO" className={inp} />
              </div>
              <div>
                <label className="block font-semibold mb-1">Sigla <span className="text-xs font-normal text-gray-400">(opcional — gerada automaticamente se vazia)</span></label>
                <input value={curso.sigla} onChange={(e) => setCurso({ ...curso, sigla: e.target.value })} type="text" placeholder="Ex: ENGCOMP" className={inp} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              {editId && <button onClick={() => excluir("curso", editId)} disabled={pendente} className="btn btn-perigo mr-auto"><i className="fa-solid fa-trash mr-1"></i>Excluir</button>}
              <button onClick={salvarCurso} disabled={pendente} className={salvar}>Salvar Curso</button>
            </div>
          </div>
        </div>
      )}

      {modal === "turma" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="p-6 w-full max-w-md space-y-4 janela">
            <h3 className="text-lg font-bold text-[#1A2332]">{editId ? "Editar" : "Cadastrar"} Turma & Curso</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="block font-semibold mb-1">Curso</label>
                <select value={turma.cursoId} onChange={(e) => setTurma({ ...turma, cursoId: e.target.value })} className={inp}>
                  {dados.cursos.map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.nome} ({c.sigla})</option>
                  ))}
                  <option value="NOVO">+ Cadastrar novo curso...</option>
                </select>
              </div>
              {turma.cursoId === "NOVO" && (
                <div className="grid grid-cols-3 gap-2 p-3 rounded-[14px] bg-orange-50/60 border border-orange-200">
                  <div className="col-span-2">
                    <label className="block font-semibold mb-1 text-xs">Nome do Novo Curso</label>
                    <input value={turma.novoCurso} onChange={(e) => setTurma({ ...turma, novoCurso: e.target.value })} type="text" placeholder="Ex: ARQUITETURA" className={inp} />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1 text-xs">Sigla (opc.)</label>
                    <input value={turma.siglaCurso} onChange={(e) => setTurma({ ...turma, siglaCurso: e.target.value })} type="text" placeholder="Ex: ARQ" className={inp} />
                  </div>
                </div>
              )}
              <div>
                <label className="block font-semibold mb-1">Turma / Período</label>
                <input value={turma.nome} onChange={(e) => setTurma({ ...turma, nome: e.target.value })} type="text" placeholder="Ex: 4º A ou ENG. CIVIL 4º A" className={inp} />
              </div>
              <div>
                <label className="block font-semibold mb-1">Qtd Alunos</label>
                <input value={turma.alunos} onChange={(e) => setTurma({ ...turma, alunos: e.target.value })} type="number" placeholder="Ex: 38" className={inp} />
              </div>
              <div>
                <label className="block font-semibold mb-1">Link WhatsApp</label>
                <input value={turma.wa} onChange={(e) => setTurma({ ...turma, wa: e.target.value })} type="text" placeholder="Ex: chat.whatsapp.com/..." className={inp} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              {editId && <button onClick={() => excluir("turma", editId)} disabled={pendente} className="btn btn-perigo mr-auto"><i className="fa-solid fa-trash mr-1"></i>Excluir</button>}
              <button onClick={salvarTurma} disabled={pendente} className={salvar}>Salvar Turma</button>
            </div>
          </div>
        </div>
      )}

      {modal === "disciplina" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50">
          <div className="p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto janela">
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
              {form.formato !== "Assíncrona" && (() => {
                const aulasNoDia = dados.turmas.filter(
                  (t) => String(t.grupoId) === form.grupoId && t.dia === form.dia && t.id !== editAulaId && t.formato !== "Assíncrona"
                );
                return (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block font-semibold mb-1">Horário de Início</label>
                        <input type="time" value={form.inicio} onChange={f("inicio")} className={inp} />
                      </div>
                      <div>
                        <label className="block font-semibold mb-1">Horário de Fim</label>
                        <input type="time" value={form.fim} onChange={f("fim")} className={inp} />
                      </div>
                    </div>
                    {aulasNoDia.length > 0 && (
                      <div className="text-xs bg-[#FFF4E5] border border-orange-200 text-[#9A3412] rounded-[14px] p-2.5">
                        <b>Já cadastrada(s) neste dia para a turma:</b>{" "}
                        {aulasNoDia.map((a) => `${a.nome} (${a.horario})`).join(" · ")}.{" "}
                        <span className="text-gray-600">Escolha um horário sem sobreposição para cadastrar outra matéria no mesmo dia.</span>
                      </div>
                    )}
                  </div>
                );
              })()}
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
                    {dados.salas.map((s) => {
                      const ocupante = dados.turmas.find(
                        (t) =>
                          t.id !== editAulaId &&
                          !t.consome &&
                          t.dia === form.dia &&
                          t.salaGrade === s.nome &&
                          t.formato !== "Assíncrona" &&
                          (!form.inicio || !form.fim || !t.inicio || !t.fim || (form.inicio < t.fim && t.inicio < form.fim))
                      );
                      return (
                        <option key={s.id} value={s.nome}>
                          {s.nome} ({s.tipo}){ocupante ? ` — Ocupado: ${ocupante.turma}` : " — Livre"}
                        </option>
                      );
                    })}
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
              {conf?.erro && <p className="text-xs bg-red-50 border border-red-200 text-red-800 rounded-[14px] p-2.5">{conf.erro}</p>}

              {/* Conferência de choques: só aparece depois que turma e disciplina foram preenchidas */}
              {conf && (
                <div className="space-y-1.5">
                  {conf.conflitos.length === 0 && conf.ok && (
                    <p className="text-xs bg-green-50 border border-green-200 text-green-800 rounded-[14px] p-2.5">✓ Sem choques. Ficará: {conf.resumo}</p>
                  )}
                  {conf.conflitos.map((c, i) => (
                    <p key={i} className={`text-xs rounded-[14px] p-2.5 border ${c.gravidade === "ERRO" ? "bg-red-50 border-red-200 text-red-800" : "bg-yellow-50 border-yellow-200 text-yellow-800"}`}>
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
                <button onClick={() => excluir("aula", editAulaId)} disabled={pendente} className="btn btn-perigo mr-auto">
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="p-6 w-full max-w-lg space-y-4 janela">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-[#1A2332]">
                <i className="fa-solid fa-bell text-[#B45309]"></i> Enviar Notificação
              </h3>
              {waTexto !== textoAviso(waTurma) && (
                <button
                  type="button"
                  onClick={() => setWaTexto(textoAviso(waTurma))}
                  className="text-xs font-bold text-[#B45309] hover:underline"
                >
                  Restaurar padrão
                </button>
              )}
            </div>
            <div className="bg-orange-50/60 border border-orange-200 rounded-xl p-3.5 text-xs space-y-2">
              <p className="font-bold text-[#9A3412] font-mono">📲 [AVISO ACADÊMICO - UNISAPIENS]</p>
              <label className="block text-[11px] font-semibold text-gray-700">
                Edite a mensagem abaixo antes de registrar:
              </label>
              <textarea
                value={waTexto}
                onChange={(e) => setWaTexto(e.target.value)}
                rows={4}
                className="campo text-sm w-full leading-relaxed bg-white"
                placeholder="Digite o texto do aviso..."
              />
            </div>
            <div className="flex flex-wrap gap-2 justify-end pt-2">
              <button onClick={fechar} className={cancelar}>Cancelar</button>
              <button onClick={() => enviarDisparo(false)} disabled={pendente} className="btn btn-principal">
                Registrar aviso
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "gerar" && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto text-sm janela">
            <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-solid fa-forward text-[#B45309]"></i> Gerar {dados.oferta !== "—" ? proximoCodigo(dados.oferta) : ""}</h3>
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
                {geracao?.erro && <div className="bg-red-50 border border-red-200 text-red-800 rounded-[14px] p-3">{geracao.erro}</div>}
              </>
            )}
            {geracao?.ok && (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 text-green-800 rounded-[14px] p-3 font-semibold">
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
          <div className="p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto janela">
            <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-solid fa-right-left text-[#B45309]"></i> Realocar Aula</h3>
            {!sugestao && <p className="text-sm text-gray-500">Procurando horários e salas livres...</p>}
            {sugestao && !sugestao.ok && <div className="bg-red-50 border border-red-200 text-red-800 rounded-[14px] p-3 text-sm">{sugestao.erro}</div>}
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
                      <label key={i} className={`flex items-start gap-3 border rounded-[14px] p-3 cursor-pointer text-sm ${opcaoEscolhida === i ? "border-[#F39200] bg-orange-50" : "border-gray-200"}`}>
                        <input type="radio" checked={opcaoEscolhida === i} onChange={() => setOpcaoEscolhida(i)} className="mt-1" />
                        <span>
                          <b>{o.descricao}</b> <span className="text-xs text-gray-500">({o.muda})</span>
                          {o.avisos.map((a, j) => <span key={j} className="block text-xs text-yellow-700">⚠️ {a}</span>)}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-[14px] p-3 text-sm">
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
          <div className="p-6 w-full max-w-2xl space-y-4 max-h-[90vh] overflow-y-auto janela">
            <h3 className="text-lg font-bold text-[#1A2332]"><i className="fa-solid fa-wand-magic-sparkles text-[#B45309]"></i> Resolver Conflitos</h3>
            {!plano && <p className="text-sm text-gray-500">Montando sugestões...</p>}
            {plano && !plano.ok && <div className="bg-red-50 border border-red-200 text-red-800 rounded-[14px] p-3 text-sm">{plano.erro}</div>}
            {plano?.ok && (
              <>
                <p className="text-sm text-gray-500">Uma mudança por aula, conferida em sequência (mover uma aula costuma resolver o choque da outra). Desmarque o que não quiser.</p>
                {plano.movimentos.length === 0 && <p className="text-sm">Nenhuma mudança possível sem mexer em mais de uma aula.</p>}
                <div className="space-y-2">
                  {plano.movimentos.map((m) => (
                    <label key={m.turmaId} className="campo campo-sm">
                      <input
                        type="checkbox" className="mt-1" checked={marcados.has(m.turmaId)}
                        onChange={(e) => setMarcados((s) => { const n = new Set(s); if (e.target.checked) n.add(m.turmaId); else n.delete(m.turmaId); return n; })}
                      />
                      <span>
                        <b>{m.turma}</b>
                        <span className="block text-xs text-red-700">{m.motivo}</span>
                        <span className="block">{m.de} → <b className="text-[#B45309]">{m.opcao.descricao}</b> <span className="text-xs text-gray-500">({m.opcao.muda})</span></span>
                        {m.opcao.avisos.map((a, j) => <span key={j} className="block text-xs text-yellow-700">⚠️ {a}</span>)}
                      </span>
                    </label>
                  ))}
                </div>
                {plano.semSolucao.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-[14px] p-3 text-sm space-y-1">
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
