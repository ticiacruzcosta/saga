"use client";

import { useState } from "react";
import Link from "next/link";

type AbaVitrine = {
  id: string;
  titulo: string;
  subtitulo: string;
  icone: string;
  imagem: string;
  descricao: string;
  destaques: string[];
};

const TELAS: AbaVitrine[] = [
  {
    id: "dashboard",
    titulo: "1. Dashboard Operacional (Hoje)",
    subtitulo: "Controle diário de aulas, laboratórios e trocas rápidas",
    icone: "fa-bolt",
    imagem: "/vitrine/dashboard.png",
    descricao:
      "Exibe automaticamente as aulas do dia corrente, ocupação dos laboratórios e status de conflitos. Permite trocar sala ou professor pontualmente no dia (indicando em tempo real quais salas estão Livres ou Ocupadas), travar ambientes com cadeado (Lock) e disparar avisos.",
    destaques: [
      "Indicador Livre / Ocupado em tempo real ao trocar de sala",
      "Trava de sala (Lock) para impedir remanejamento automático",
      "Calendário interativo de ocupação diária e cancelamento pontual",
    ],
  },
  {
    id: "grade",
    titulo: "2. Grade do Semestre",
    subtitulo: "Matriz consolidada da oferta semestral e Motor de Integridade",
    icone: "fa-table-list",
    imagem: "/vitrine/grade.png",
    descricao:
      "Consolida todas as turmas ofertadas no semestre (2026.2) com auditoria automática de conflitos em tempo real: bloqueia choque de horário do mesmo docente, alerta superlotação física do laboratório e respeita rodízios 1x1 e 2x2.",
    destaques: [
      "Filtros combinados por Curso, Dia da Semana, Docente e Ambiente",
      "Algoritmo de otimização e realocação automática de salas",
      "Geração inteligente do próximo semestre e exportação em Excel (.xlsx)",
    ],
  },
  {
    id: "semana",
    titulo: "3. Horário da Semana",
    subtitulo: "Quadro geral panorâmico de segunda a sábado",
    icone: "fa-calendar-week",
    imagem: "/vitrine/semana.png",
    descricao:
      "Visão panorâmica de toda a distribuição semanal de aulas do Centro Universitário Unisapiens, permitindo alternar o agrupamento por Turma, por Professor ou por Sala/Laboratório, com layout pronto para impressão.",
    destaques: [
      "Busca instantânea por disciplina, professor, turma ou laboratório",
      "Destaque automático para a coluna do dia atual",
      "Versão otimizada para impressão direta da coordenação",
    ],
  },
  {
    id: "cadastros",
    titulo: "4. Cadastros Base (Cursos, Turmas e Salas)",
    subtitulo: "Gestão acadêmica em blocos compactos ou lista",
    icone: "fa-graduation-cap",
    imagem: "/vitrine/cursos.png",
    descricao:
      "Centraliza os cadastros de Cursos, Turmas, Corpo Docente (com dias de indisponibilidade), Salas/Laboratórios (com capacidade máxima e prédio) e Ofertas de Disciplinas, com alternância entre visão em blocos ou lista.",
    destaques: [
      "Filtro rápido de turmas clicando nos blocos de sigla do curso",
      "Controle de capacidade física (35, 40, 50 lugares) por laboratório",
      "Registro de restrição de dias da semana por professor",
    ],
  },
  {
    id: "salas",
    titulo: "5. Infraestrutura: Salas e Laboratórios",
    subtitulo: "Mapeamento físico por capacidade, prédio e ocupação semanal",
    icone: "fa-computer",
    imagem: "/vitrine/salas.png",
    descricao:
      "Monitora todos os espaços físicos controlados pelo sistema, diferenciando Laboratórios Práticos e Salas Teóricas, exibindo a lotação máxima de cadeiras e quantas aulas estão alocadas em cada espaço na semana.",
    destaques: [
      "Validação automática de lotação (RN02) contra o tamanho da turma",
      "Vinculação obrigatória de disciplinas práticas a laboratórios (RN03)",
      "Filtro instantâneo entre Laboratórios e Salas Teóricas",
    ],
  },
  {
    id: "importar",
    titulo: "6. Importação de Planilha (.XLSX)",
    subtitulo: "Leitura automatizada com raio-X e pré-conferência",
    icone: "fa-file-excel",
    imagem: "/vitrine/importar.png",
    descricao:
      "Substitui o cadastro manual: ao enviar a planilha Excel da oferta, o sistema realiza primeiro uma conferência completa — identificando cursos novos, comunalidades e possíveis choques — antes de gravar no banco de dados.",
    destaques: [
      "Etapa 1 (Conferir Arquivo) valida toda a planilha sem alterar o banco",
      "Detecção automática de cursos novos e sugestão de siglas",
      "Relatório imediato de turmas lidas, comunalidades e choques",
    ],
  },
  {
    id: "historico",
    titulo: "7. Histórico de Avisos & Bot Telegram",
    subtitulo: "Comunicação em tempo real com os grupos de alunos",
    icone: "fa-bell",
    imagem: "/vitrine/historico.png",
    descricao:
      "Toda alteração de sala, troca de docente ou cancelamento no Dashboard gera automaticamente um comunicado padronizado. A coordenação pode revisar o texto e disparar diretamente via API para os estudantes inscritos no Bot.",
    destaques: [
      "Disparo integrado via Bot do Telegram (@saga_avisos_academicos_bot)",
      "Edição rápida do texto do aviso antes do envio",
      "Consulta de horários e salas pelos próprios alunos via comando no Bot",
    ],
  },
];

const REGRAS = [
  {
    codigo: "RN01",
    titulo: "Prevenção de Choque Docente",
    icone: "fa-user-check",
    texto: "Bloqueia rigorosamente a alocação do mesmo professor em duas turmas ou salas distintas no mesmo dia e horário (respeitando casos de comunalidade).",
  },
  {
    codigo: "RN02",
    titulo: "Lotação × Capacidade Física",
    icone: "fa-chair",
    texto: "Audita em tempo real se a quantidade de alunos da turma respeita o teto físico cadastrado para o laboratório ou sala.",
  },
  {
    codigo: "RN03",
    titulo: "Adequação de Ambiente & Rodízio",
    icone: "fa-rotate",
    texto: "Garante que disciplinas práticas utilizem laboratórios, respeita salas travadas (Lock) e gerencia rodízios 1x1 e 2x2.",
  },
  {
    codigo: "RF07",
    titulo: "Notificação Instantânea via Bot",
    icone: "fa-paper-plane",
    texto: "Conecta as alterações operacionais da coordenação diretamente aos estudantes por meio de alertas automatizados.",
  },
];

export default function TelaVitrine() {
  const [abaAtiva, setAbaAtiva] = useState<string>(TELAS[0].id);
  const [zoomImagem, setZoomImagem] = useState<AbaVitrine | null>(null);
  const atual = TELAS.find((t) => t.id === abaAtiva) ?? TELAS[0];

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-[#1A2332] flex flex-col">
      {/* CABEÇALHO FIXO */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1A2332] text-[#F39200] flex items-center justify-center font-black text-base shadow-sm">
              US
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-black text-base tracking-tight text-[#1A2332]">SAGA</span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#FFF4E5] text-[#B45309] border border-orange-200/70">
                  Vitrine do Projeto
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-semibold">
                CENTRO UNIVERSITÁRIO UNISAPIENS · Engenharia da Computação
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="#telas"
              className="hidden sm:inline-flex btn btn-sm btn-secundario"
            >
              <i className="fa-solid fa-display text-[#B45309]"></i> Ver Telas do Sistema
            </a>
            <Link
              href="/login"
              className="btn btn-sm btn-escuro"
              title="Acesso restrito à coordenação e administradores"
            >
              <i className="fa-solid fa-lock text-[#F39200]"></i> Acesso Restrito (Coordenação)
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 md:py-10 space-y-10">
        {/* HERO BANNER INSTITUCIONAL */}
        <section className="relative overflow-hidden rounded-3xl text-white px-6 md:px-12 py-8 md:py-12 bg-[linear-gradient(110deg,#1A2332_0%,#1A2332_45%,#7C2D12_78%,#C2410C_100%)] shadow-xl">
          <div
            aria-hidden="true"
            className="absolute -right-10 -top-28 w-56 h-[26rem] rounded-full rotate-[-35deg] bg-gradient-to-b from-[#F39200] to-[#C2410C] opacity-90 pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="absolute right-20 -top-28 w-56 h-[26rem] rounded-full rotate-[-35deg] border-[14px] border-orange-100/30 pointer-events-none"
          />
          <div
            aria-hidden="true"
            className="hidden md:block absolute right-64 -bottom-24 w-28 h-48 rounded-full rotate-[-35deg] bg-gradient-to-b from-[#FDBA74] to-[#F39200] opacity-85 pointer-events-none"
          />

          <div className="relative max-w-3xl space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/15 text-xs font-extrabold tracking-wide uppercase">
                <i className="fa-solid fa-shield-halved text-[#FDBA74]"></i> Projeto de Extensão IV · ENGETEC
              </span>
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#1A2332]/80 border border-white/15 text-xs font-extrabold">
                <span className="w-2 h-2 rounded-full bg-[#F39200]"></span> Semestre 2026.2
              </span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
              SAGA — Sistema de Avisos e Gestão Acadêmica
            </h1>

            <p className="text-sm sm:text-base text-orange-50/95 leading-relaxed">
              Plataforma web desenvolvida para a Coordenação Acadêmica do{" "}
              <strong className="text-white">CENTRO UNIVERSITÁRIO UNISAPIENS</strong> para automatizar a alocação de
              salas e laboratórios, eliminar choques de horários na matriz semestral e notificar os estudantes em tempo
              real.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-2">
              <a
                href="#telas"
                className="btn bg-white text-[#1A2332] hover:bg-orange-50 shadow-lg font-extrabold"
              >
                <i className="fa-solid fa-eye text-[#C2410C]"></i> Explorar Telas do Sistema
              </a>
              <a
                href="https://github.com/ticiacruzcosta/saga"
                target="_blank"
                rel="noopener noreferrer"
                className="btn bg-white/15 hover:bg-white/25 text-white border border-white/25 backdrop-blur-xs"
              >
                <i className="fa-brands fa-github"></i> Repositório GitHub
              </a>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-orange-100/90">
              <i className="fa-solid fa-circle-info text-[#FDBA74]"></i>
              <span>
                <strong>Modo Vitrine Pública:</strong> Você está visualizando a apresentação interativa do sistema. O
                painel operacional de banco de dados é restrito à coordenação autenticada.
              </span>
            </div>
          </div>
        </section>

        {/* TOUR INTERATIVO PELAS TELAS DO SISTEMA */}
        <section id="telas" className="space-y-5 scroll-mt-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#B45309]">
                Demonstração Visual Interativa
              </span>
              <h2 className="text-xl md:text-2xl font-black text-[#1A2332]">
                Conheça todas as Telas e Módulos do SAGA
              </h2>
            </div>
            <p className="text-xs text-gray-500">
              Clique nas abas abaixo para alternar entre os módulos ou clique na imagem para ampliar em tela cheia.
            </p>
          </div>

          {/* SELETOR DE MÓDULOS */}
          <div className="flex flex-wrap gap-2">
            {TELAS.map((t) => {
              const ativa = t.id === atual.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAbaAtiva(t.id)}
                  className={`px-4 py-2.5 rounded-full text-xs font-extrabold transition flex items-center gap-2 cursor-pointer ${
                    ativa
                      ? "bg-[#1A2332] text-white shadow-md"
                      : "bg-white text-gray-700 hover:bg-orange-50 border border-gray-200/80"
                  }`}
                >
                  <i className={`fa-solid ${t.icone} ${ativa ? "text-[#F39200]" : "text-[#B45309]"}`}></i>
                  <span>{t.titulo}</span>
                </button>
              );
            })}
          </div>

          {/* PAINEL DA TELA SELECIONADA */}
          <div className="cartao p-5 md:p-7 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* MOLDURA DE NAVEGADOR COM A CAPTURA REAL */}
            <div className="lg:col-span-8">
              <div
                onClick={() => setZoomImagem(atual)}
                title="Clique para ampliar a imagem em tela cheia"
                className="group rounded-2xl overflow-hidden border border-gray-200 shadow-lg bg-[#1A2332] cursor-zoom-in"
              >
                <div className="px-4 py-2.5 bg-[#1A2332] text-white flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                    <span className="ml-2 font-bold text-slate-300 truncate">{atual.titulo}</span>
                  </div>
                  <span className="text-[11px] font-extrabold text-[#FDBA74] flex items-center gap-1">
                    <i className="fa-solid fa-magnifying-glass-plus"></i> Ampliar tela
                  </span>
                </div>
                <div className="bg-[#F4F6F9] overflow-hidden">
                  <img
                    src={atual.imagem}
                    alt={atual.titulo}
                    className="w-full h-auto block group-hover:scale-[1.01] transition duration-300"
                  />
                </div>
              </div>
            </div>

            {/* EXPLICAÇÃO DO MÓDULO */}
            <div className="lg:col-span-4 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FFF4E5] text-[#B45309] text-xs font-extrabold">
                <i className={`fa-solid ${atual.icone}`}></i>
                <span>Módulo do Sistema</span>
              </div>

              <div>
                <h3 className="text-lg md:text-xl font-black text-[#1A2332] leading-snug">{atual.titulo}</h3>
                <p className="text-xs font-bold text-[#B45309] mt-0.5">{atual.subtitulo}</p>
              </div>

              <p className="text-sm text-gray-600 leading-relaxed">{atual.descricao}</p>

              <div className="space-y-2 pt-1">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#1A2332]">
                  Principais Recursos desta Tela:
                </div>
                <ul className="space-y-2">
                  {atual.destaques.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-gray-700">
                      <i className="fa-solid fa-circle-check text-emerald-600 mt-0.5 shrink-0"></i>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    const idx = TELAS.findIndex((t) => t.id === atual.id);
                    const ant = TELAS[(idx - 1 + TELAS.length) % TELAS.length];
                    setAbaAtiva(ant.id);
                  }}
                  className="btn btn-sm btn-secundario cursor-pointer"
                >
                  <i className="fa-solid fa-arrow-left"></i> Anterior
                </button>
                <span className="text-xs font-extrabold text-gray-400 tabular-nums">
                  {TELAS.findIndex((t) => t.id === atual.id) + 1} / {TELAS.length}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const idx = TELAS.findIndex((t) => t.id === atual.id);
                    const prox = TELAS[(idx + 1) % TELAS.length];
                    setAbaAtiva(prox.id);
                  }}
                  className="btn btn-sm btn-principal cursor-pointer"
                >
                  Próxima <i className="fa-solid fa-arrow-right"></i>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* MOTOR DE INTEGRIDADE & REGRAS DE NEGÓCIO */}
        <section className="space-y-4">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#B45309]">
              Regras de Negócio & Validações
            </span>
            <h2 className="text-xl md:text-2xl font-black text-[#1A2332]">
              Motor de Integridade Acadêmica
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {REGRAS.map((r) => (
              <div key={r.codigo} className="cartao p-5 space-y-2.5 relative overflow-hidden">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#1A2332] to-[#F39200]"
                />
                <div className="flex items-center justify-between">
                  <span className="w-9 h-9 rounded-xl bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-sm">
                    <i className={`fa-solid ${r.icone}`}></i>
                  </span>
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-full bg-[#1A2332] text-[#F39200]">
                    {r.codigo}
                  </span>
                </div>
                <h3 className="font-extrabold text-sm text-[#1A2332]">{r.titulo}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{r.texto}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FICHA TÉCNICA E EQUIPE */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 cartao p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-xl bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                <i className="fa-solid fa-users"></i>
              </span>
              <div>
                <h3 className="font-black text-base text-[#1A2332]">Equipe de Desenvolvimento</h3>
                <p className="text-xs text-gray-500">
                  Engenharia da Computação · Projeto de Extensão IV (Prof. Allan Kardec Gurgel do Amaral)
                </p>
              </div>
            </div>

            <div className="divide-y divide-gray-100 text-xs">
              {[
                ["Leticia Cruz Costa", "Backend, Banco de Dados PostgreSQL (Neon), Prisma ORM e Deploy na Vercel"],
                ["Leticia Farias Ribeiro", "Motor de Integridade, Regras de Negócio, Detecção de Choques e Rodízios"],
                ["Vitor Pelicer Martins", "Arquitetura Frontend, UX/UI, Design System, Responsividade e Modais"],
                ["Victor Matheus F. de Salas", "Integração de Mensageria via Bot/API, Avisos Dinâmicos e Testes"],
                ["João Pedro Secundo de Sena", "Levantamento de Requisitos, Documentação Técnica, QA e Custos"],
              ].map(([nome, papel]) => (
                <div key={nome} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span className="font-extrabold text-[#1A2332]">{nome}</span>
                  <span className="text-gray-500">{papel}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 cartao p-6 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-[#FFF4E5] text-[#B45309] flex items-center justify-center text-xs">
                  <i className="fa-solid fa-layer-group"></i>
                </span>
                <div>
                  <h3 className="font-black text-base text-[#1A2332]">Arquitetura Tecnológica</h3>
                  <p className="text-xs text-gray-500">Stack Full-Stack em Nuvem</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {[
                  "Next.js 16 (App Router)",
                  "React 19",
                  "TypeScript",
                  "Tailwind CSS 4",
                  "Prisma ORM 6",
                  "PostgreSQL (Neon)",
                  "ExcelJS (.xlsx)",
                  "Telegram Bot API",
                  "Vercel Cloud",
                ].map((tech) => (
                  <span
                    key={tech}
                    className="px-3 py-1.5 rounded-xl bg-[#F4F6F9] text-[#1A2332] text-xs font-extrabold border border-gray-200/80"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#1A2332] text-white flex items-center justify-between gap-3">
              <div className="text-xs">
                <div className="font-extrabold text-[#F39200]">Acesso da Coordenação</div>
                <div className="text-slate-300">Painel operacional protegido por autenticação</div>
              </div>
              <Link href="/login" className="btn btn-sm bg-white text-[#1A2332] hover:bg-orange-50 shrink-0">
                <i className="fa-solid fa-right-to-bracket text-[#C2410C]"></i> Entrar
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* MODAL DE ZOOM DA TELA */}
      {zoomImagem && (
        <div
          onClick={() => setZoomImagem(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-6xl w-full bg-[#1A2332] rounded-2xl overflow-hidden shadow-2xl border border-white/15"
          >
            <div className="px-5 py-3 flex items-center justify-between text-white">
              <span className="font-extrabold text-sm">{zoomImagem.titulo}</span>
              <button
                type="button"
                onClick={() => setZoomImagem(null)}
                className="btn btn-sm bg-white/15 hover:bg-white/25 text-white cursor-pointer"
              >
                <i className="fa-solid fa-xmark"></i> Fechar
              </button>
            </div>
            <div className="bg-[#F4F6F9] max-h-[82vh] overflow-auto">
              <img src={zoomImagem.imagem} alt={zoomImagem.titulo} className="w-full h-auto block" />
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-gray-200/80 bg-white py-4 px-4 md:px-8 text-center text-xs text-gray-500">
        SAGA — Sistema de Avisos e Gestão Acadêmica · <strong>CENTRO UNIVERSITÁRIO UNISAPIENS</strong> · Porto Velho/RO
      </footer>
    </div>
  );
}
