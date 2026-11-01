// Formato dos dados que o servidor entrega para a tela (tudo simples e serializável).

export type ConflitoVM = { gravidade: "ERRO" | "AVISO"; mensagem: string };

export type TurmaVM = {
  id: number;
  grupoId: number | null;
  turma: string; // "SIST. DE INFORM. 4º A"
  nome: string; // disciplina, como está na planilha
  formato: string; // Presencial | Híbrida | Síncrona | Assíncrona
  prof: string;
  sala: string; // já considera a alteração de hoje
  profGrade: string; // sem a alteração de hoje (para ver outros dias)
  salaGrade: string;
  alteradaHoje: boolean;
  profId: number | null; // para a edição em Ofertas & Disciplinas
  salaId: number | null;
  inicio: string; // "19:00" ou ""
  fim: string;
  vagas: number | null;
  reqespaco: "Laboratório/Prático" | "Presencial Teórico";
  dia: string; // SEGUNDA | TERÇA | ... | "" (sem dia)
  horario: string;
  cht: string;
  chp: string;
  alunos: number | null;
  rodizio: string; // Não | Sim (1x1) | Sim (2x2)
  predio: string;
  tambemAtende: string[];
  consome: boolean;
  conflitos: ConflitoVM[];
};

export type SalaVM = { id: number; nome: string; tipo: string; cap: number | null; predio: string };
export type ProfVM = { id: number; nome: string; email: string; dias: string[] }; // dias: em que NÃO pode dar aula (formato do banco)
export type GrupoVM = { id: number; nome: string; alunos: number | null; wa: string };
export type UsuarioVM = { id: number; nome: string; email: string; ativo: boolean; admin: boolean; desde: string };
export type CalendarioVM = { inicio: string; fim: string; semAula: Array<{ id: number; data: string; descricao: string }> };
export type AvisoVM = { id: number; quando: string; turma: string; mensagem: string; status: string };

export type DadosSaga = {
  oferta: string;
  ofertaStatus: string; // RASCUNHO | PUBLICADA | ARQUIVADA
  ofertaPublicada: string | null; // a que vale para todos (pode ser outra)
  ofertas: Array<{ codigo: string; status: string }>;
  diaHoje: string | null; // chave do dia de hoje, no formato da tela ("SEXTA")
  dataHoje: string; // "2026-10-31" (Porto Velho)
  turmas: TurmaVM[];
  salas: SalaVM[];
  professores: ProfVM[];
  grupos: GrupoVM[];
  avisos: AvisoVM[];
  usuarios: UsuarioVM[];
  calendario: CalendarioVM;
  disciplinas: string[];
  totalConflitos: number;
  totalConfirmar: number;
};

export type OfertaInput = {
  grupoId: number | null;
  nome: string;
  formato: string; // "Presencial" | "Híbrida" | "Síncrona" | "Assíncrona"
  cht: string;
  chp: string;
  profId: number | null;
  dia: string; // "SEGUNDA" | "TERÇA" ...
  alunos: number | null;
  reqespaco: string; // "Laboratório/Prático" | "Presencial Teórico"
  lockSala: string; // código do ambiente ou ""
  rodizio: string; // "Não" | "Sim (1x1)" | "Sim (2x2)"
  // Só na edição de uma aula que já existe:
  turmaId?: number | null;
  inicio?: string; // "19:00"
  fim?: string;
};

export type ResultadoOferta = {
  ok: boolean;
  conflitos: ConflitoVM[];
  resumo: string; // "SEXTA 19:00-21:45 em LAB01"
  erro?: string;
};

/** Resultado da tela "Importar Planilha" (pré-visualização e gravação). */
export type PreviaImportacao = {
  ok: boolean;
  erro?: string;
  gravado?: boolean;
  aba?: string;
  codigo?: string;
  ofertaExistente?: { turmas: number; alteracoes: number; status: string } | null;
  turmas?: number;
  comunalidade?: number;
  professoresNovos?: string[];
  disciplinasNovas?: string[];
  salasNovas?: string[];
  gruposNovos?: string[];
  problemas?: Array<{ linha: number; mensagem: string }>;
  choques?: Array<{ linha: number; gravidade: "ERRO" | "AVISO"; mensagem: string }>;
};

/** Uma posição livre sugerida para uma aula com conflito. */
export type OpcaoRealocacaoVM = {
  dia: string; // formato do banco: TERCA
  inicio: number;
  fim: number;
  ambienteId: number | null;
  descricao: string; // "QUINTA 19:00 - 21:45 em LAB04"
  muda: string; // "Só a sala"
  avisos: string[];
};

export type SugestaoRealocacaoVM = {
  ok: boolean;
  erro?: string;
  turmaId?: number;
  turma?: string;
  atual?: string;
  conflitos?: ConflitoVM[];
  acompanham?: string[]; // turmas de outro curso que assistem junto
  opcoes?: OpcaoRealocacaoVM[];
  professoresLivres?: string[];
};

export type PlanoResolucaoVM = {
  ok: boolean;
  erro?: string;
  movimentos: Array<{ turmaId: number; turma: string; de: string; motivo: string; opcao: OpcaoRealocacaoVM }>;
  semSolucao: Array<{ turmaId: number; turma: string; motivo: string }>;
};

/** Resultado do botão "Gerar próximo semestre". */
export type ResultadoGeracao = {
  ok: boolean;
  erro?: string;
  existe?: boolean; // já há um rascunho com esse código
  codigo?: string;
  origem?: string;
  turmas?: number;
  alocadas?: number; // aulas com dia e horário
  comHorario?: number; // aulas que precisam de dia e horário (sem EAD e sem comunalidade)
  semProfessor?: string[];
  semHorario?: string[];
  formados?: string[];
  semMatriz?: string[];
  gruposNovos?: string[];
};
