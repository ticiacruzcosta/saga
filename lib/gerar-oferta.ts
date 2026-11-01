// Monta o próximo semestre a partir de uma oferta: avança os períodos, puxa as disciplinas
// da matriz, escolhe professor (quem já deu, com menos carga) e encaixa dia/horário/sala sem choque.
// O que não for possível resolver fica listado em `problemas`. Função pura: quem grava é app/ofertas.ts.

import { validarTurma, type DiaSemana, type Formato, type TurmaParaValidar } from "./validacao-choque";
import type { AmbienteRealoc } from "./realocacao";

export type DisciplinaGer = {
  id: number;
  nome: string;
  codigo: string | null;
  formato: string;
  tipoAmbiente: string;
  ambienteFixoId: number | null;
  duracaoMinutos: number;
  limiteAlunos: number | null;
  permiteRodizio: boolean;
};

export type GrupoGer = {
  cursoId: number;
  cursoNome: string;
  periodo: number;
  letra: string;
  turno: string;
  qtdAlunos: number | null;
};

export type EntradaGeracao = {
  grupos: GrupoGer[]; // turmas de alunos que tinham aula na oferta de origem
  matriz: Map<number, Map<number, DisciplinaGer[]>>; // cursoId -> período -> disciplinas
  habilitacoes: Map<number, number[]>; // disciplinaId -> professores que já deram
  indisponiveis?: Map<number, string[]>; // professorId -> dias em que não pode dar aula
  ambientes: AmbienteRealoc[];
  pares: Array<[number, number]>;
  compartilhadas: Set<number>; // disciplinas que já foram dadas em comunalidade
  abrirPrimeiro: boolean; // abrir 1º período A nos cursos com matriz
};

export type TurmaGerada = {
  grupo: GrupoGer;
  disciplina: DisciplinaGer;
  formato: Formato;
  professorId: number | null;
  ambienteId: number | null;
  dia: DiaSemana | null;
  inicio: number | null;
  fim: number | null;
  consomeDe: number | null; // índice (nesta lista) da turma que ela assiste
  problemas: string[];
};

export const nomeGrupo = (g: GrupoGer) => `${g.cursoNome} ${g.periodo}º ${g.letra}${g.turno === "VESPERTINO" ? " VESP" : ""}`;

/** 2026.2 -> 2027.1 ; 2027.1 -> 2027.2 */
export function proximoCodigo(codigo: string): string {
  const [ano, sem] = codigo.split(".").map(Number);
  return sem >= 2 ? `${ano + 1}.1` : `${ano}.2`;
}

const DIAS: DiaSemana[] = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA"];

function formatoDe(d: DisciplinaGer): Formato {
  return (["PRESENCIAL", "HIBRIDA", "SINCRONA", "ASSINCRONA"].includes(d.formato) ? d.formato : "PRESENCIAL") as Formato;
}

/** Salas que a disciplina pode usar. null = sala comum (o sistema não controla sala teórica). */
function salasPara(d: DisciplinaGer, fmt: Formato, ambientes: AmbienteRealoc[]): Array<AmbienteRealoc | null> {
  if (fmt === "SINCRONA" || fmt === "ASSINCRONA") return [null];
  if (d.ambienteFixoId) return ambientes.filter((a) => a.id === d.ambienteFixoId);
  if (d.tipoAmbiente === "LABORATORIO") {
    // laboratórios com capacidade conhecida primeiro
    return ambientes
      .filter((a) => a.tipo === "LABORATORIO")
      .sort((a, b) => Number(a.capacidade == null) - Number(b.capacidade == null) || a.codigo.localeCompare(b.codigo));
  }
  return [null];
}

function iniciosPara(turno: string, duracao: number): number[] {
  const base = turno === "VESPERTINO" ? 15 * 60 : 19 * 60;
  // aula curta (extensão = 1h) pode ir em 19:00, 20:00 ou 21:00
  return duracao <= 90 ? [0, 1, 2].map((k) => base + k * duracao) : [base];
}

export function gerarOferta(e: EntradaGeracao) {
  // ---- 1. turmas de alunos do novo semestre
  const formados: string[] = [];
  const semMatriz: string[] = [];
  const novos = new Map<string, GrupoGer>();
  for (const g of e.grupos) {
    const periodos = e.matriz.get(g.cursoId);
    if (!periodos) {
      semMatriz.push(nomeGrupo(g));
      continue;
    }
    const prox = { ...g, periodo: g.periodo + 1 };
    if (!periodos.has(prox.periodo)) formados.push(nomeGrupo(g));
    else novos.set(nomeGrupo(prox), prox);
  }
  if (e.abrirPrimeiro) {
    const cursos = new Map(e.grupos.map((g) => [g.cursoId, g.cursoNome]));
    for (const [cursoId, cursoNome] of cursos) {
      if (!e.matriz.has(cursoId)) continue;
      const g: GrupoGer = { cursoId, cursoNome, periodo: 1, letra: "A", turno: "NOTURNO", qtdAlunos: null };
      if (!novos.has(nomeGrupo(g))) novos.set(nomeGrupo(g), g);
    }
  }

  // ---- 2. uma turma por disciplina da matriz; comunalidade quando a disciplina já foi compartilhada antes
  const turmas: TurmaGerada[] = [];
  const dono = new Map<string, number>(); // disciplina + turno -> índice da turma principal
  for (const g of [...novos.values()].sort((a, b) => a.cursoId - b.cursoId || a.periodo - b.periodo || a.letra.localeCompare(b.letra))) {
    for (const d of e.matriz.get(g.cursoId)!.get(g.periodo)!) {
      const k = `${d.id}|${g.turno}`;
      const consomeDe = e.compartilhadas.has(d.id) && dono.has(k) ? dono.get(k)! : null;
      if (consomeDe == null) dono.set(k, turmas.length);
      turmas.push({ grupo: g, disciplina: d, formato: formatoDe(d), professorId: null, ambienteId: null, dia: null, inicio: null, fim: null, consomeDe, problemas: [] });
    }
  }

  // ---- 3 e 4. professor + encaixe. As mais difíceis primeiro: sala fixa, aula curta (extensão:
  // precisa de um bloco de 1h numa noite que ainda não tenha aula de 2h45), laboratório, o resto.
  const carga = new Map<number, number>(); // aulas por professor nesta geração
  const colocadas: TurmaParaValidar[] = [];
  const peso = (t: TurmaGerada) =>
    t.disciplina.ambienteFixoId ? 0 : t.disciplina.duracaoMinutos <= 90 ? 1 : t.disciplina.tipoAmbiente === "LABORATORIO" ? 2 : 3;
  const ordem = turmas
    .map((_, i) => i)
    .filter((i) => turmas[i].consomeDe == null)
    .sort((a, b) => peso(turmas[a]) - peso(turmas[b]) || a - b);

  for (const i of ordem) {
    const t = turmas[i];
    const d = t.disciplina;
    const consumidoras = turmas.filter((x) => x.consomeDe === i);
    const profs = [...(e.habilitacoes.get(d.id) ?? [])].sort((a, b) => (carga.get(a) ?? 0) - (carga.get(b) ?? 0));
    if (profs.length === 0) t.problemas.push("Nenhum professor deu esta disciplina ainda: definir.");

    const base = (id: number, g: GrupoGer): TurmaParaValidar => ({
      id, disciplinaId: d.id, disciplinaNome: d.nome, disciplinaCodigo: d.codigo ?? "", cursoId: g.cursoId, periodo: g.periodo,
      letra: g.letra, formato: t.formato, professorId: null, ambienteId: null, diaSemana: null, horaInicio: null, horaFim: null,
      vagas: g.qtdAlunos, limiteAlunos: d.limiteAlunos, permiteRodizio: d.permiteRodizio,
    });

    if (t.formato === "ASSINCRONA") {
      t.professorId = profs[0] ?? null; // EAD não ocupa horário
      if (t.professorId) carga.set(t.professorId, (carga.get(t.professorId) ?? 0) + 1);
      continue;
    }

    // Noites com menos aulas da turma primeiro, para espalhar a semana
    const aulasNoDia = (dia: DiaSemana) => colocadas.filter((c) => c.diaSemana === dia && c.cursoId === t.grupo.cursoId && c.periodo === t.grupo.periodo && c.letra === t.grupo.letra).length;
    const dias = [...DIAS].sort((a, b) => aulasNoDia(a) - aulasNoDia(b) || DIAS.indexOf(a) - DIAS.indexOf(b));

    // 1ª tentativa: com um professor que já deu a disciplina. 2ª: sem professor (fica "A definir").
    let achou: TurmaParaValidar | null = null;
    const tentativas: Array<Array<number | null>> = profs.length ? [profs, [null]] : [[null]];
    procura: for (const candidatos of tentativas) for (const dia of dias) {
      for (const inicio of iniciosPara(t.grupo.turno, d.duracaoMinutos)) {
        for (const amb of salasPara(d, t.formato, e.ambientes)) {
          for (const prof of candidatos) {
            if (prof != null && e.indisponiveis?.get(prof)?.includes(dia)) continue;
            const cand: TurmaParaValidar = {
              ...base(i, t.grupo), professorId: prof, ambienteId: amb?.id ?? null, ambienteCodigo: amb?.codigo,
              ambienteCapacidade: amb?.capacidade ?? null, diaSemana: dia, horaInicio: inicio, horaFim: inicio + d.duracaoMinutos,
            };
            if (validarTurma(cand, colocadas, e.pares).some((c) => c.gravidade === "ERRO")) continue;
            // quem assiste junto também precisa estar livre
            const livres = consumidoras.every((c) => !validarTurma({ ...cand, ...base(-1, c.grupo), diaSemana: dia, horaInicio: inicio, horaFim: inicio + d.duracaoMinutos }, colocadas, e.pares).some((x) => x.gravidade === "ERRO"));
            if (!livres) continue;
            achou = cand;
            break procura;
          }
        }
      }
    }
    if (!achou) {
      t.problemas.push("Sem dia, horário ou sala livre: alocar na mão.");
      continue;
    }
    if (profs.length && achou.professorId == null) t.problemas.push("Quem já deu esta disciplina está ocupado em todos os horários livres: definir professor.");
    colocadas.push(achou);
    // as turmas que assistem junto ocupam o horário dos próprios alunos
    consumidoras.forEach((c) => colocadas.push({ ...base(turmas.indexOf(c), c.grupo), diaSemana: achou!.diaSemana, horaInicio: achou!.horaInicio, horaFim: achou!.horaFim }));
    Object.assign(t, { professorId: achou.professorId, ambienteId: achou.ambienteId, dia: achou.diaSemana, inicio: achou.horaInicio, fim: achou.horaFim });
    if (t.professorId) carga.set(t.professorId, (carga.get(t.professorId) ?? 0) + 1);
  }

  // Quem assiste junto copia dia, horário, sala e professor da turma principal
  for (const t of turmas) {
    if (t.consomeDe == null) continue;
    const p = turmas[t.consomeDe];
    Object.assign(t, { professorId: p.professorId, ambienteId: p.ambienteId, dia: p.dia, inicio: p.inicio, fim: p.fim });
  }
  return { turmas, grupos: [...novos.values()], formados, semMatriz };
}
