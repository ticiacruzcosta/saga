import { ImageResponse } from "next/og";
import { DIA_NOME } from "@/lib/whatsapp/texto.mjs";

export type LinhaHorario = { turma: string; disciplina: string; professor: string; sala: string; predio: string; hora: string; cancelada: boolean; alterada: boolean };
const LARANJA = "#EA7B24";
const ESCURO = "#1A2332";
const cabeca = { fontSize: 17, fontWeight: 700 as const, color: "white" };

export function imagemHorario({ linhas, dia, semestre, dataUsada, pagina, total }: {
  linhas: LinhaHorario[]; dia: string; semestre: string; dataUsada: string | null; pagina: number; total: number;
}): ImageResponse {
  const altura = 154 + Math.max(1, linhas.length) * 72 + 58;
  return new ImageResponse(
    <div style={{ background: "#FFFFFF", width: "100%", height: "100%", display: "flex", flexDirection: "column", fontFamily: "sans-serif", color: ESCURO }}>
      <div style={{ display: "flex", height: 91, alignItems: "center", padding: "0 30px", justifyContent: "space-between", background: LARANJA }}>
        <div style={{ display: "flex", flexDirection: "column", color: "white" }}>
          <div style={{ fontSize: 27, fontWeight: 800 }}>{`HORÁRIO DE ${DIA_NOME[dia]?.toUpperCase() ?? dia}`}</div>
          <div style={{ fontSize: 16 }}>{`SAGA • UNISAPIENS • Semestre ${semestre}`}</div>
        </div>
        <div style={{ fontSize: 18, color: "white" }}>{dataUsada ? dataUsada.split("-").reverse().join("/") : `Página ${pagina}/${total}`}</div>
      </div>
      <div style={{ display: "flex", background: "#1A2332", padding: "16px 22px", gap: 12 }}>
        <div style={{ ...cabeca, flex: 3 }}>TURMA / DISCIPLINA / PROFESSOR</div>
        <div style={{ ...cabeca, flex: 1 }}>HORÁRIO</div>
        <div style={{ ...cabeca, flex: 1 }}>SALA</div>
        <div style={{ ...cabeca, flex: 1 }}>PRÉDIO</div>
      </div>
      {(linhas.length ? linhas : [{ turma: "", disciplina: "Nenhuma aula cadastrada", professor: "", sala: "—", predio: "—", hora: "—", cancelada: false, alterada: false }]).map((t, i) => (
        <div key={`${i}`} style={{ display: "flex", alignItems: "center", padding: "8px 22px", height: 72,
          background: t.cancelada ? "#FFF0AA" : i % 2 === 0 ? "#F8DCD0" : "#FFF5F0", borderBottom: "1px solid white", gap: 12 }}>
          <div style={{ display: "flex", flex: 3, flexDirection: "column", overflow: "hidden" }}>
            <span style={{ fontWeight: 750, fontSize: 17, color: t.cancelada ? "#B22222" : ESCURO }}>{`${t.turma} • ${t.disciplina}`}</span>
            <span style={{ fontSize: 14 }}>{`${t.cancelada ? "NÃO HAVERÁ AULA" : t.professor}${t.alterada && !t.cancelada ? " • ALTERAÇÃO" : ""}`}</span>
          </div>
          <div style={{ display: "flex", flex: 1, fontSize: 16 }}>{t.cancelada ? "CANCELADA" : t.hora}</div>
          <div style={{ display: "flex", flex: 1, fontSize: 16, fontWeight: t.alterada ? 750 : 400 }}>{t.cancelada ? "SEM AULA" : t.sala}</div>
          <div style={{ display: "flex", flex: 1, fontSize: 16 }}>{t.cancelada ? "—" : t.predio}</div>
        </div>
      ))}
      <div style={{ display: "flex", flex: 1, alignItems: "center", padding: "14px 24px", justifyContent: "space-between", background: "#F1F3F6", fontSize: 15 }}>
        <span>Consulte as alterações e avisos no SAGA</span><span>Página {pagina} de {total}</span>
      </div>
    </div>,
    { width: 1200, height: altura, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
