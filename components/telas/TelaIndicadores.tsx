// Indicadores da oferta aberta: números principais, carga horária por professor e uso das salas.
// Barras de uma série só (uma cor, sem legenda, valor escrito ao lado); sobrecarga usa cor de status + ícone + texto.

import type { DadosSaga, TurmaVM } from "@/lib/tipos";

/** Acima disso o professor aparece como sobrecarregado (horas de aula por semana). */
const LIMITE_HORAS_SEMANA = 20;
const DIAS_LETIVOS = 6; // segunda a sábado
const COR_BARRA = "#D97706"; // validada para contraste nos temas claro e escuro
const COR_ALERTA = "#DC2626";

const minutos = (h: string) => (h ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : 0);
const duracaoH = (t: TurmaVM) => (t.dia && t.inicio && t.fim ? (minutos(t.fim) - minutos(t.inicio)) / 60 : 0);
const fmtH = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

function Numero({ valor, rotulo, alerta }: { valor: number; rotulo: string; alerta?: boolean }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className="text-3xl font-bold text-[#1A2332] flex items-center gap-2">
        {valor}
        {alerta && valor > 0 && <i className="fa-solid fa-triangle-exclamation text-lg" style={{ color: COR_ALERTA }} title="Precisa de atenção"></i>}
      </div>
      <div className="text-xs text-gray-500 mt-1">{rotulo}</div>
    </div>
  );
}

/** Uma linha de barra horizontal: nome, barra proporcional e valor por extenso. */
function Barra({ nome, fracao, valor, dica, alerta }: { nome: string; fracao: number; valor: string; dica: string; alerta?: string }) {
  return (
    <li className="grid grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-3 py-1.5 group" title={dica}>
      <span className="text-xs text-gray-700 truncate">{nome}</span>
      <span className="h-3 rounded-r bg-gray-100 overflow-hidden">
        <span
          className="block h-full rounded-r transition-[filter] group-hover:brightness-110"
          style={{ width: `${Math.max(fracao * 100, 1.5)}%`, background: alerta ? COR_ALERTA : COR_BARRA }}
        />
      </span>
      <span className="text-xs text-gray-700 tabular-nums whitespace-nowrap">
        {valor}
        {alerta && (
          <span className="ml-2 font-semibold" style={{ color: COR_ALERTA }}>
            <i className="fa-solid fa-circle-exclamation mr-1"></i>{alerta}
          </span>
        )}
      </span>
    </li>
  );
}

export default function TelaIndicadores({ dados }: { dados: DadosSaga }) {
  const aulas = dados.turmas.filter((t) => !t.consome);
  const semProfessor = aulas.filter((t) => t.profGrade === "A definir");
  const semDia = aulas.filter((t) => !t.dia && t.formato !== "Assíncrona");

  const carga = new Map<string, { aulas: number; horas: number }>();
  for (const t of aulas) {
    if (t.profGrade === "A definir") continue;
    const c = carga.get(t.profGrade) ?? { aulas: 0, horas: 0 };
    carga.set(t.profGrade, { aulas: c.aulas + 1, horas: c.horas + duracaoH(t) });
  }
  const professores = [...carga.entries()].sort((a, b) => b[1].horas - a[1].horas || a[0].localeCompare(b[0]));
  const maxHoras = Math.max(LIMITE_HORAS_SEMANA, ...professores.map(([, c]) => c.horas));
  const sobrecarregados = professores.filter(([, c]) => c.horas > LIMITE_HORAS_SEMANA).length;

  const salas = dados.salas
    .map((s) => {
      const daSala = aulas.filter((t) => t.salaGrade === s.nome && t.dia);
      return { nome: s.nome, aulas: daSala.length, noites: new Set(daSala.map((t) => t.dia)).size, horas: daSala.reduce((n, t) => n + duracaoH(t), 0) };
    })
    .sort((a, b) => b.noites - a.noites || b.horas - a.horas);
  const ociosas = salas.filter((s) => s.aulas === 0).length;

  return (
    <section className="space-y-6">
      <p className="text-xs text-gray-500">
        Semestre <b>{dados.oferta}</b>. Turmas que assistem aula de outro curso (comunalidade) não são contadas duas vezes.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Numero valor={aulas.length} rotulo="Aulas na oferta" />
        <Numero valor={dados.totalConflitos} rotulo="Aulas com conflito" alerta />
        <Numero valor={semProfessor.length} rotulo="Aulas sem professor" alerta />
        <Numero valor={semDia.length} rotulo="Aulas sem dia/horário" alerta />
        <Numero valor={sobrecarregados} rotulo={`Professores acima de ${LIMITE_HORAS_SEMANA} h/semana`} alerta />
        <Numero valor={ociosas} rotulo="Salas/labs sem nenhuma aula" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-[#1A2332]">Carga horária por professor</h3>
          <p className="text-xs text-gray-500 mb-3">Horas de aula presencial/síncrona por semana. Limite de referência: {LIMITE_HORAS_SEMANA} h.</p>
          {professores.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum professor com aula nesta oferta.</p>
          ) : (
            <ul>
              {professores.map(([nome, c]) => (
                <Barra
                  key={nome} nome={nome} fracao={c.horas / maxHoras}
                  valor={`${fmtH(c.horas)} · ${c.aulas} aula(s)`}
                  dica={`${nome}: ${fmtH(c.horas)} por semana em ${c.aulas} aula(s)`}
                  alerta={c.horas > LIMITE_HORAS_SEMANA ? "sobrecarga" : undefined}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-[#1A2332]">Uso das salas e laboratórios</h3>
          <p className="text-xs text-gray-500 mb-3">Dias da semana com pelo menos uma aula (de {DIAS_LETIVOS}). "Sala comum" e EAD não entram.</p>
          <ul>
            {salas.map((s) => (
              <Barra
                key={s.nome} nome={s.nome} fracao={s.noites / DIAS_LETIVOS}
                valor={`${s.noites} de ${DIAS_LETIVOS} dias · ${s.aulas} aula(s)`}
                dica={`${s.nome}: ${s.aulas} aula(s), ${fmtH(s.horas)} por semana, em ${s.noites} dia(s)`}
              />
            ))}
          </ul>
        </div>
      </div>

      {(semProfessor.length > 0 || semDia.length > 0) && (
        <div className="grid lg:grid-cols-2 gap-6">
          {[["Aulas sem professor", semProfessor], ["Aulas sem dia/horário", semDia]].map(([titulo, lista]) => (
            (lista as TurmaVM[]).length > 0 && (
              <details key={titulo as string} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <summary className="font-bold text-[#1A2332] cursor-pointer">{titulo as string}: {(lista as TurmaVM[]).length}</summary>
                <ul className="mt-2 text-xs text-gray-600 space-y-1">
                  {(lista as TurmaVM[]).map((t) => <li key={t.id}>• {t.nome} · {t.turma}</li>)}
                </ul>
              </details>
            )
          ))}
        </div>
      )}
    </section>
  );
}
