/**
 * Identificação de cursos durante a importação de ofertas.
 *
 * Os aliases abaixo existem apenas para reconhecer abreviações já usadas no SAGA.
 * Qualquer outro curso da planilha é aceito sem alterar código (Direito, Medicina etc.).
 * Não usamos busca por substring: ela poderia confundir cursos com nomes parecidos.
 */
import { norm } from "./texto";

export type CursoExistente = { id: number; nome: string; sigla: string };
export type CursoPlanejado = { chave: string; nome: string; sigla: string; id: number | null };

const ALIASES: ReadonlyArray<{ chave: string; sigla: string; nomes: string[] }> = [
  { chave: "SISTEMAS DE INFORMACAO", sigla: "SI", nomes: ["SIST. DE INFORM.", "SIST DE INFORM", "SISTEMAS DE INFORMACAO", "SISTEMA DE INFORMACAO"] },
  { chave: "ENGENHARIA DE COMPUTACAO", sigla: "EC", nomes: ["ENG. COMPUTACAO", "ENG COMPUTACAO", "ENGENHARIA DE COMPUTACAO", "ENGENHARIA COMPUTACAO"] },
  { chave: "ENGENHARIA CIVIL", sigla: "ECIV", nomes: ["ENG. CIVIL", "ENG CIVIL", "ENGENHARIA CIVIL", "ENGENHARIA DE CIVIL"] },
  { chave: "ENGENHARIA ELETRICA", sigla: "EELE", nomes: ["ENG. ELETRICA", "ENG ELETRICA", "ENGENHARIA ELETRICA", "ENGENHARIA DE ELETRICA"] },
  { chave: "ENGENHARIA DE SOFTWARE", sigla: "ESW", nomes: ["ENG. SOFTWARE", "ENG SOFTWARE", "ENGENHARIA DE SOFTWARE", "ENGENHARIA SOFTWARE"] },
  { chave: "BIG DATA E INTELIGENCIA ARTIFICIAL", sigla: "BDIA", nomes: ["BIG DATA E I.A.", "BIG DATA E IA", "BIG DATA E INTELIGENCIA ARTIFICIAL"] },
  { chave: "JOGOS DIGITAIS", sigla: "JD", nomes: ["JOGOS DIGITAIS"] },
];

const ALIAS_PARA_CHAVE = new Map(ALIASES.flatMap((a) => a.nomes.map((n) => [norm(n), a.chave] as const)));
const SIGLA_CONHECIDA = new Map(ALIASES.map((a) => [a.chave, a.sigla]));

/** Comparação exata após tirar pontuação/acentos e expandir abreviações conhecidas. */
export function chaveCurso(nome: string): string {
  const n = norm(nome);
  return ALIAS_PARA_CHAVE.get(n) ?? n;
}

function nomeExibicao(nome: string): string {
  return nome.replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

/** Sigla sugerida para curso novo, sem lista fechada de cursos. */
export function sugerirSigla(nome: string): string {
  const chave = chaveCurso(nome);
  const conhecida = SIGLA_CONHECIDA.get(chave);
  if (conhecida) return conhecida;
  const palavras = norm(nome).split(" ").filter((p) => p && !["DE", "DA", "DO", "DAS", "DOS", "E", "EM"].includes(p));
  if (palavras.length <= 1) return (palavras[0] ?? "CUR").slice(0, 3);
  return palavras.map((p) => p[0]).join("").slice(0, 8);
}

/**
 * Planeja a importação sem gravar no banco. O plano também contém o nome e a sigla
 * que aparecerão na prévia e serão confirmados pelo administrador.
 */
export function planejarCursos(cadastrados: CursoExistente[], nomesDaPlanilha: string[]) {
  const porChave = new Map<string, CursoPlanejado>();
  const siglasUsadas = new Set(cadastrados.map((c) => c.sigla.toUpperCase()));
  const novos: CursoPlanejado[] = [];

  for (const curso of cadastrados) {
    const chave = chaveCurso(curso.nome);
    const anterior = porChave.get(chave);
    if (anterior && anterior.id !== curso.id) {
      throw new Error(`Os cursos "${anterior.nome}" e "${curso.nome}" parecem equivalentes. Corrija o cadastro duplicado antes de importar.`);
    }
    porChave.set(chave, { chave, nome: curso.nome, sigla: curso.sigla, id: curso.id });
  }

  for (const nome of nomesDaPlanilha) {
    const chave = chaveCurso(nome);
    if (!chave || porChave.has(chave)) continue;
    const base = sugerirSigla(nome);
    let sigla = base;
    let indice = 2;
    while (siglasUsadas.has(sigla)) sigla = `${base}${indice++}`;
    siglasUsadas.add(sigla);
    const curso: CursoPlanejado = { chave, nome: nomeExibicao(nome), sigla, id: null };
    porChave.set(chave, curso);
    novos.push(curso);
  }
  return { porChave, novos };
}
