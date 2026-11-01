// Constantes e utilitários usados por mais de uma tela.

import type { TurmaVM } from "@/lib/tipos";

export const ORDEM_DIA = ["SEGUNDA", "TERÇA", "QUARTA", "QUINTA", "SEXTA", "SÁBADO"];
export const ordemDia = (d: string) => (ORDEM_DIA.includes(d) ? ORDEM_DIA.indexOf(d) : 99);
export const porDiaHora = (a: TurmaVM, b: TurmaVM) =>
  ordemDia(a.dia) - ordemDia(b.dia) || a.horario.localeCompare(b.horario) || a.id - b.id;
export const semTraco = (v: string) => (v === "—" ? "" : v);

export const OPCOES_DIA = [
  ["SEGUNDA", "Segunda-Feira"], ["TERÇA", "Terça-Feira"], ["QUARTA", "Quarta-Feira"],
  ["QUINTA", "Quinta-Feira"], ["SEXTA", "Sexta-Feira"], ["SÁBADO", "Sábado"],
];

