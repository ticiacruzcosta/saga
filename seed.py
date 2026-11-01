# -*- coding: utf-8 -*-
"""
Cria o banco do SAGA do zero a partir das planilhas de dados-fonte/:
  1. ESTRUTURA_CADASTRO_SISTEMA.xlsx -> cursos, disciplinas, matriz, salas, rodízios
  2. OFERTA_2026_2.xlsx (aba "Página1") -> professores, turmas de alunos e aulas
  3. Confere o banco contra a planilha, linha por linha, e lista possíveis choques

Uso: python seed.py --recriar [--relatorio conferencia.xlsx]   (ver --help)
Atenção: --recriar apaga o banco inteiro. Para atualizar só a oferta, use a tela "Importar Planilha".
"""
import argparse
import os
import re
import sqlite3
import sys
import unicodedata
from collections import defaultdict

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

# ----------------------------------------------------------------- caminhos
ESTRUTURA_PADRAO = "dados-fonte/ESTRUTURA_CADASTRO_SISTEMA.xlsx"
OFERTA_PADRAO = "dados-fonte/OFERTA_2026_2.xlsx"
DB_PADRAO = "prisma/dev.db"
OFERTA_CODIGO = "2026.2"

DIAS = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"]

CURSOS = {  # nome na planilha de oferta -> sigla
    "SIST. DE INFORM.": "SI",
    "ENG. COMPUTAÇÃO": "EC",
    "ENG. CIVIL": "ECIV",
    "ENG. ELÉTRICA": "EELE",
    "ENG. SOFTWARE": "ESW",
    "BIG DATA E I.A.": "BDIA",
    "JOGOS DIGITAIS": "JD",
}
CURSO_MATRIZ = {  # nome nas matrizes -> nome na oferta
    "SISTEMAS DE INFORMAÇÃO": "SIST. DE INFORM.",
    "ENGENHARIA DE COMPUTAÇÃO": "ENG. COMPUTAÇÃO",
}
FORMATOS = {
    "PRESENCIAL": "PRESENCIAL",
    "HÍBRIDA": "HIBRIDA",
    "SÍNCRONA": "SINCRONA",
    "ASSÍNCRONA": "ASSINCRONA",
}

# ------------------------------------------------------------ tabelas (DDL)
DDL = """
CREATE TABLE "cursos" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "nome" TEXT NOT NULL, "sigla" TEXT NOT NULL);
CREATE TABLE "ambientes" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "codigo" TEXT NOT NULL, "nome" TEXT NOT NULL, "tipo" TEXT NOT NULL, "capacidade" INTEGER, "predio" TEXT, "aceitaRodizio" BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE "professores" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "nome" TEXT NOT NULL, "email" TEXT, "vinculo" TEXT, "diasIndisponiveis" TEXT, "ativo" BOOLEAN NOT NULL DEFAULT true);
CREATE TABLE "disciplinas" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "codigo" TEXT, "nome" TEXT NOT NULL, "formato" TEXT NOT NULL DEFAULT 'PRESENCIAL', "tipoAmbiente" TEXT NOT NULL DEFAULT 'SALA', "ambienteFixoId" INTEGER, "permiteRodizio" BOOLEAN NOT NULL DEFAULT false, "tipoRodizio" TEXT NOT NULL DEFAULT 'NAO', "cargaTeorica" INTEGER, "cargaPratica" INTEGER, "duracaoMinutos" INTEGER NOT NULL DEFAULT 165, "limiteAlunos" INTEGER, "qtdTurmasPadrao" INTEGER NOT NULL DEFAULT 1, "preferenciaDia" TEXT, "observacoes" TEXT, CONSTRAINT "disciplinas_ambienteFixoId_fkey" FOREIGN KEY ("ambienteFixoId") REFERENCES "ambientes" ("id") ON DELETE SET NULL ON UPDATE CASCADE);
CREATE TABLE "matriz_itens" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "cursoId" INTEGER NOT NULL, "disciplinaId" INTEGER NOT NULL, "periodo" INTEGER NOT NULL, CONSTRAINT "matriz_itens_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "cursos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "matriz_itens_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TABLE "professor_disciplina" ("professorId" INTEGER NOT NULL, "disciplinaId" INTEGER NOT NULL, PRIMARY KEY ("professorId", "disciplinaId"), CONSTRAINT "professor_disciplina_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "professores" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "professor_disciplina_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "rodizios" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "disciplinaAId" INTEGER NOT NULL, "disciplinaBId" INTEGER NOT NULL, "observacao" TEXT, CONSTRAINT "rodizios_disciplinaAId_fkey" FOREIGN KEY ("disciplinaAId") REFERENCES "disciplinas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "rodizios_disciplinaBId_fkey" FOREIGN KEY ("disciplinaBId") REFERENCES "disciplinas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TABLE "grupos_alunos" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "nome" TEXT NOT NULL, "cursoId" INTEGER NOT NULL, "periodo" INTEGER, "letra" TEXT NOT NULL DEFAULT 'A', "turno" TEXT NOT NULL DEFAULT 'NOTURNO', "qtdAlunos" INTEGER, "linkWhatsapp" TEXT, CONSTRAINT "grupos_alunos_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "cursos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TABLE "ofertas" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "codigo" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'RASCUNHO', "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "atividades" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "usuarioId" INTEGER, "usuarioNome" TEXT NOT NULL, "acao" TEXT NOT NULL, "descricao" TEXT NOT NULL, "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "atividades_criadaEm_idx" ON "atividades"("criadaEm");
CREATE TABLE "turmas" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "ofertaId" INTEGER NOT NULL, "disciplinaId" INTEGER NOT NULL, "grupoId" INTEGER, "letra" TEXT NOT NULL DEFAULT 'A', "professorId" INTEGER, "ambienteId" INTEGER, "formato" TEXT, "diaSemana" TEXT, "horaInicio" INTEGER, "horaFim" INTEGER, "turno" TEXT NOT NULL DEFAULT 'NOTURNO', "vagas" INTEGER, "consomeDeId" INTEGER, "nomeNaPlanilha" TEXT, "periodoNaPlanilha" TEXT, "origemLinha" INTEGER, "observacao" TEXT, CONSTRAINT "turmas_ofertaId_fkey" FOREIGN KEY ("ofertaId") REFERENCES "ofertas" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "turmas_disciplinaId_fkey" FOREIGN KEY ("disciplinaId") REFERENCES "disciplinas" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, CONSTRAINT "turmas_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_alunos" ("id") ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT "turmas_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "professores" ("id") ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT "turmas_ambienteId_fkey" FOREIGN KEY ("ambienteId") REFERENCES "ambientes" ("id") ON DELETE SET NULL ON UPDATE CASCADE, CONSTRAINT "turmas_consomeDeId_fkey" FOREIGN KEY ("consomeDeId") REFERENCES "turmas" ("id") ON DELETE SET NULL ON UPDATE CASCADE);
CREATE TABLE "alteracoes" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "turmaId" INTEGER NOT NULL, "data" DATETIME NOT NULL, "tipo" TEXT NOT NULL, "valorAnterior" TEXT, "valorNovo" TEXT, "motivo" TEXT, "mensagemGerada" TEXT, "enviada" BOOLEAN NOT NULL DEFAULT false, "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "alteracoes_turmaId_fkey" FOREIGN KEY ("turmaId") REFERENCES "turmas" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE TABLE "avisos" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "grupoId" INTEGER NOT NULL, "conteudo" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDENTE', "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "avisos_grupoId_fkey" FOREIGN KEY ("grupoId") REFERENCES "grupos_alunos" ("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE TABLE "usuarios" ("id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "nome" TEXT NOT NULL, "email" TEXT NOT NULL, "senhaHash" TEXT NOT NULL, "ativo" BOOLEAN NOT NULL DEFAULT true, "perfil" TEXT NOT NULL DEFAULT 'USUARIO', "tentativasFalhas" INTEGER NOT NULL DEFAULT 0, "bloqueadoAte" DATETIME, "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "sessoes" ("token" TEXT NOT NULL PRIMARY KEY, "usuarioId" INTEGER NOT NULL, "expiraEm" DATETIME NOT NULL, "criadaEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "sessoes_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios" ("id") ON DELETE CASCADE ON UPDATE CASCADE);
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");
CREATE INDEX "sessoes_usuarioId_idx" ON "sessoes"("usuarioId");
CREATE UNIQUE INDEX "cursos_nome_key" ON "cursos"("nome");
CREATE UNIQUE INDEX "cursos_sigla_key" ON "cursos"("sigla");
CREATE UNIQUE INDEX "ambientes_codigo_key" ON "ambientes"("codigo");
CREATE UNIQUE INDEX "professores_nome_key" ON "professores"("nome");
CREATE UNIQUE INDEX "disciplinas_codigo_key" ON "disciplinas"("codigo");
CREATE INDEX "matriz_itens_cursoId_periodo_idx" ON "matriz_itens"("cursoId", "periodo");
CREATE UNIQUE INDEX "matriz_itens_cursoId_disciplinaId_key" ON "matriz_itens"("cursoId", "disciplinaId");
CREATE UNIQUE INDEX "rodizios_disciplinaAId_disciplinaBId_key" ON "rodizios"("disciplinaAId", "disciplinaBId");
CREATE UNIQUE INDEX "grupos_alunos_nome_key" ON "grupos_alunos"("nome");
CREATE UNIQUE INDEX "ofertas_codigo_key" ON "ofertas"("codigo");
CREATE INDEX "turmas_ofertaId_diaSemana_idx" ON "turmas"("ofertaId", "diaSemana");
CREATE INDEX "turmas_professorId_idx" ON "turmas"("professorId");
CREATE INDEX "alteracoes_data_idx" ON "alteracoes"("data");
CREATE INDEX "avisos_criadoEm_idx" ON "avisos"("criadoEm");
"""

ORDEM_LIMPEZA = ["atividades", "sessoes", "usuarios", "avisos", "alteracoes", "turmas", "ofertas", "grupos_alunos", "rodizios",
                 "professor_disciplina", "matriz_itens", "disciplinas", "professores",
                 "ambientes", "cursos"]


# ------------------------------------------------------------ normalização
def sem_acento(s):
    return unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()


def norm(s):
    return re.sub(r"[^A-Z0-9]+", " ", sem_acento(s).upper()).strip()


SUFIXO_CURSO = re.compile(
    r"\s*[-(]\s*(?:ENG\.?\s*COMP(?:UTA(?:Ç|C)(?:Ã|A)O)?\.?|COMPUTA(?:Ç|C)(?:Ã|A)O|"
    r"COMP\.\s*CONSUMINDO)\s*\)?\s*$", re.I)
PARENTESE_PYTHON = re.compile(r"\s*\(PYTHON\)", re.I)
ALIAS = {
    "DIREITO LEGISLACAO E ETICA": "DIREITO LEGISLACAO E ETICA NA TECNOLOGIA",
    "INTRODUCAO A REDES": "INTRODUCAO A REDES DE COMPUTADORES",
    "PROGRAMACAO WEB": "PROGRAMACAO PARA WEB",
    "INTR A INFOR E TEORIA GERAL DOS SIST COMP":
        "INTRODUCAO A INFORMACAO E TEORIA GERAL DOS SISTEMAS COMPUTACIONAIS",
    "ESG ENVIRONMENT SOCIAL AND GOVERNANCE": "ENVIRONMENTAL SOCIAL GOVERNANCE ESG",
}


def chave_disciplina(nome):
    """Transforma o nome (da matriz OU da planilha) numa chave comparável."""
    s = SUFIXO_CURSO.sub("", str(nome or "").strip())
    s = PARENTESE_PYTHON.sub("", s)
    n = norm(s)
    n = n.replace("ESTRUTURAS", "ESTRUTURA").replace("BANCOS", "BANCO")
    n = re.sub(r"\bT I\b", "TI", n)
    m = re.match(r"^PROJETO DE EXTENSAO (I|II|III|IV|V)\b", n)
    if m:
        return "PE:" + m.group(1)
    m = re.match(r"^OPTATIVA (I|II|III)\b", n)
    if m:
        return "OPT:" + m.group(1)
    return ALIAS.get(n, n)


def limpar_professor(txt):
    """Devolve (nome_do_professor, observacao). A planilha mistura avisos no campo."""
    if txt is None or str(txt).strip() == "":
        return None, None
    t = re.sub(r"\s+", " ", str(txt).replace("*", "")).strip()
    if t.upper().startswith("ALUNOS ") or t.upper() == "PROFESSOR PORTUGUÊS":
        return None, f"Professor na planilha: {t}"
    return t.upper(), None


def parse_periodo(txt):
    t = str(txt or "").strip()
    m = re.search(r"\d+", t)
    periodo = int(m.group()) if m else None
    vesp = "VESP" in t.upper()
    m = re.search(r"(?:^|[\s\-–])([A-D])\s*$", t.upper())
    letra = m.group(1) if m else "A"
    return periodo, letra, ("VESPERTINO" if vesp else "NOTURNO")


def parse_horario(txt):
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$", str(txt or ""))
    if not m:
        return None, None
    a, b, c, d = map(int, m.groups())
    return a * 60 + b, c * 60 + d


def min_para_hora(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def sim(v):
    return str(v or "").strip().upper() in ("SIM", "TRUE", "1")


# --------------------------------------------------------------- leitura
def ler_estrutura(caminho):
    wb = load_workbook(caminho, data_only=True)
    disc = []
    for r in wb["DISCIPLINAS"].iter_rows(min_row=5, values_only=True):
        if r[0]:
            disc.append(r)
    salas = [r for r in wb["SALAS"].iter_rows(min_row=5, values_only=True) if r[0]]
    return disc, salas


def ler_oferta(caminho):
    """Lê a aba Página1. Devolve uma lista de dicts, um por linha de turma."""
    wb = load_workbook(caminho, data_only=True)
    ws = wb["Página1"]
    linhas = []
    for r in range(4, ws.max_row + 1):
        curso, disc = ws.cell(r, 1).value, ws.cell(r, 5).value
        if not curso or not disc:
            continue
        dia, marca = None, None
        for i, c in enumerate(range(28, 35)):
            v = ws.cell(r, c).value
            if v not in (None, ""):
                dia, marca = DIAS[i], str(v).strip()
                break
        amb = None
        if marca:
            m = re.match(r"^(LAB\d+)-(\d+)$", marca.upper())
            amb = (m.group(1), int(m.group(2))) if m else None
        prof_nome, prof_obs = limpar_professor(ws.cell(r, 16).value)
        formato_raw = ws.cell(r, 15).value
        linhas.append({
            "linha": r,
            "curso": str(curso).strip(),
            "periodo_txt": str(ws.cell(r, 4).value or "").strip(),
            "disciplina": str(disc).strip(),
            "formato_raw": str(formato_raw).strip() if formato_raw else None,
            "professor": prof_nome,
            "prof_obs": prof_obs,
            "prof_raw": ws.cell(r, 16).value,
            "horario": str(ws.cell(r, 27).value).strip() if ws.cell(r, 27).value else None,
            "dia": dia,
            "marca": marca,
            "amb": amb,
        })
    return linhas


# ------------------------------------------------------------- importação
def importar(con, estrutura, oferta_linhas, log):
    cur = con.cursor()

    # --- cursos
    curso_id = {}
    for nome, sigla in CURSOS.items():
        cur.execute("INSERT INTO cursos(nome, sigla) VALUES (?,?)", (nome, sigla))
        curso_id[nome] = cur.lastrowid

    # --- ambientes
    disc_rows, salas = estrutura
    amb_id, amb_cap = {}, {}
    for cod, nome, tipo, cap, rod, obs in [s[:6] for s in salas]:
        cur.execute(
            "INSERT INTO ambientes(codigo, nome, tipo, capacidade, aceitaRodizio) VALUES (?,?,?,?,?)",
            (cod, nome, tipo, int(cap) if cap not in (None, "") else None, 1 if sim(rod) else 0))
        amb_id[cod] = cur.lastrowid
        amb_cap[cod] = int(cap) if cap not in (None, "") else None

    # --- disciplinas (uma por CÓDIGO) + matriz (uma por curso x código)
    disc_id, chave_codigo = {}, {}
    chave_por_curso = defaultdict(dict)  # nome_curso -> {chave: codigo}
    for (cod, nome, curso_m, per, formato, tipo_amb, rod, rod_com, fixo, dur,
         lim, turmas, pref, obs) in [d[:14] for d in disc_rows]:
        cod = str(cod).strip()
        curso_nome = CURSO_MATRIZ[curso_m]
        k = chave_disciplina(nome)
        chave_por_curso[curso_nome][k] = cod
        chave_codigo.setdefault(k, cod)
        if cod not in disc_id:
            cur.execute(
                """INSERT INTO disciplinas(codigo, nome, formato, tipoAmbiente, ambienteFixoId,
                   permiteRodizio, tipoRodizio, duracaoMinutos, limiteAlunos, qtdTurmasPadrao,
                   preferenciaDia, observacoes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (cod, nome, FORMATOS.get(str(formato).upper(), "PRESENCIAL"), tipo_amb,
                 amb_id.get(fixo) if fixo else None, 1 if sim(rod) else 0,
                 "1X1" if sim(rod) else "NAO", int(dur or 165),
                 int(lim) if lim not in (None, "") else None, int(turmas or 1),
                 pref or None, obs or None))
            disc_id[cod] = cur.lastrowid
        cur.execute("INSERT INTO matriz_itens(cursoId, disciplinaId, periodo) VALUES (?,?,?)",
                    (curso_id[curso_nome], disc_id[cod], int(per)))

    # --- rodízios de laboratório definidos pela coordenação
    for a, b in [("202965", "202967"), ("202967", "202971")]:
        if a in disc_id and b in disc_id:
            cur.execute("INSERT INTO rodizios(disciplinaAId, disciplinaBId, observacao) VALUES (?,?,?)",
                        (disc_id[a], disc_id[b], "Rodízio de laboratório (reunião 08/09/2026)"))

    # --- descobrir qual DISCIPLINA cada linha da planilha é
    padrao_standalone = {}

    def resolver_disciplina(l):
        k = chave_disciplina(l["disciplina"])
        l["chave"] = k
        cod = chave_por_curso.get(l["curso"], {}).get(k)
        if cod is None and l["curso"] in chave_por_curso:
            cod = chave_codigo.get(k)  # cursos com matriz podem usar disciplina de outro
        return cod

    for l in oferta_linhas:
        l["cod"] = resolver_disciplina(l)

    # --- comunalidade: mesma disciplina + professor + dia + horário em cursos diferentes
    grupos_com = defaultdict(list)
    for l in oferta_linhas:
        if l["professor"] and l["dia"] and l["horario"]:
            grupos_com[(l["chave"], l["professor"], l["dia"], l["horario"])].append(l)
    for membros in grupos_com.values():
        if len({m["curso"] for m in membros}) < 2:
            continue
        com_matriz = [m for m in membros if m["curso"] in chave_por_curso]
        dono = min(com_matriz or membros, key=lambda m: m["linha"])
        for m in membros:
            m["dono_linha"] = None if m is dono else dono["linha"]
            m["cod"] = m["cod"] or dono["cod"]
    for l in oferta_linhas:
        l.setdefault("dono_linha", None)

    # --- disciplinas avulsas (cursos sem matriz)
    for l in oferta_linhas:
        if l["cod"]:
            continue
        k = l["chave"]
        if k not in padrao_standalone:
            fmt = FORMATOS.get(l["formato_raw"] or "", "PRESENCIAL")
            tipo = "EAD" if fmt == "ASSINCRONA" else ("LABORATORIO" if l["amb"] else "SALA")
            cur.execute(
                """INSERT INTO disciplinas(codigo, nome, formato, tipoAmbiente, observacoes)
                   VALUES (NULL,?,?,?,?)""",
                (SUFIXO_CURSO.sub("", l["disciplina"]).strip(), fmt, tipo,
                 "Sem código: o curso não tem matriz cadastrada ainda"))
            padrao_standalone[k] = cur.lastrowid
        l["disc_avulsa"] = padrao_standalone[k]

    # --- professores
    prof_id = {}
    for l in oferta_linhas:
        p = l["professor"]
        if p and p not in prof_id:
            cur.execute("INSERT INTO professores(nome) VALUES (?)", (p,))
            prof_id[p] = cur.lastrowid

    # --- oferta
    cur.execute("INSERT INTO ofertas(codigo, status) VALUES (?, 'PUBLICADA')", (OFERTA_CODIGO,))
    oferta_id = cur.lastrowid

    # --- grupos de alunos + turmas
    grupo_id, turma_por_linha, hab = {}, {}, set()
    for l in oferta_linhas:
        periodo, letra, turno = parse_periodo(l["periodo_txt"])
        gnome = f'{l["curso"]} {periodo}º {letra}' + (" VESP" if turno == "VESPERTINO" else "")
        if gnome not in grupo_id:
            cur.execute(
                "INSERT INTO grupos_alunos(nome, cursoId, periodo, letra, turno) VALUES (?,?,?,?,?)",
                (gnome, curso_id[l["curso"]], periodo, letra, turno))
            grupo_id[gnome] = cur.lastrowid
        disc = disc_id[l["cod"]] if l["cod"] else l["disc_avulsa"]
        ini, fim = parse_horario(l["horario"])
        amb = None
        obs = [l["prof_obs"]] if l["prof_obs"] else []
        if l["amb"]:
            amb = amb_id.get(l["amb"][0])
            if amb_cap.get(l["amb"][0]) and l["amb"][1] != amb_cap[l["amb"][0]]:
                obs.append(f'Planilha informa {l["amb"][0]}-{l["amb"][1]}, '
                           f'mas a capacidade cadastrada é {amb_cap[l["amb"][0]]}')
        if l["dono_linha"]:
            obs.append("Comunalidade: assiste a turma de outro curso")
        cur.execute(
            """INSERT INTO turmas(ofertaId, disciplinaId, grupoId, letra, professorId, ambienteId,
               formato, diaSemana, horaInicio, horaFim, turno, nomeNaPlanilha, periodoNaPlanilha,
               origemLinha, observacao) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (oferta_id, disc, grupo_id[gnome], letra, prof_id.get(l["professor"]), amb,
             FORMATOS.get(l["formato_raw"] or ""), l["dia"], ini, fim, turno,
             l["disciplina"], l["periodo_txt"], l["linha"], "; ".join(obs) or None))
        turma_por_linha[l["linha"]] = cur.lastrowid
        if l["professor"]:
            hab.add((prof_id[l["professor"]], disc))

    for l in oferta_linhas:
        if l["dono_linha"]:
            cur.execute("UPDATE turmas SET consomeDeId=? WHERE id=?",
                        (turma_por_linha[l["dono_linha"]], turma_por_linha[l["linha"]]))
    for p, d in sorted(hab):
        cur.execute("INSERT INTO professor_disciplina(professorId, disciplinaId) VALUES (?,?)", (p, d))
    con.commit()
    log(f"  cursos: {len(curso_id)} | ambientes: {len(amb_id)} | disciplinas: "
        f"{cur.execute('SELECT COUNT(*) FROM disciplinas').fetchone()[0]} | "
        f"itens de matriz: {cur.execute('SELECT COUNT(*) FROM matriz_itens').fetchone()[0]}")
    log(f"  professores: {len(prof_id)} | grupos de alunos: {len(grupo_id)} | "
        f"turmas: {len(turma_por_linha)}")


# ------------------------------------------------------------- conferência
def conferir(con, oferta_linhas):
    """Lê do banco e compara cada linha da planilha. Devolve lista de resultados."""
    cur = con.cursor()
    res = []
    for l in oferta_linhas:
        row = cur.execute(
            """SELECT c.nome, t.periodoNaPlanilha, t.nomeNaPlanilha, p.nome, t.formato,
                      t.diaSemana, t.horaInicio, t.horaFim, a.codigo, t.consomeDeId
               FROM turmas t JOIN grupos_alunos g ON g.id=t.grupoId JOIN cursos c ON c.id=g.cursoId
               LEFT JOIN professores p ON p.id=t.professorId LEFT JOIN ambientes a ON a.id=t.ambienteId
               WHERE t.origemLinha=?""", (l["linha"],)).fetchone()
        erros = []
        if not row:
            res.append((l, ["linha não encontrada no banco"], None))
            continue
        curso, per, nome, prof, fmt, dia, ini, fim, amb, consome = row
        if curso != l["curso"]: erros.append("curso")
        if per != l["periodo_txt"]: erros.append("período")
        if nome != l["disciplina"]: erros.append("disciplina")
        if prof != l["professor"]: erros.append("professor")
        if fmt != FORMATOS.get(l["formato_raw"] or ""): erros.append("formato")
        if dia != l["dia"]: erros.append("dia")
        horario_db = f"{min_para_hora(ini)} - {min_para_hora(fim)}" if ini is not None else None
        if horario_db != l["horario"]: erros.append("horário")
        if amb != (l["amb"][0] if l["amb"] else None): erros.append("ambiente")
        res.append((l, erros, row))
    return res


def achar_choques(con):
    """Mesmas regras RN-01/02/03 do validador TypeScript, aplicadas à oferta inteira."""
    cur = con.cursor()
    turmas = cur.execute(
        """SELECT t.id, t.origemLinha, t.nomeNaPlanilha, t.periodoNaPlanilha, t.diaSemana,
                  t.horaInicio, t.horaFim, t.formato, t.professorId, p.nome, t.ambienteId, a.codigo,
                  t.grupoId, g.nome, t.disciplinaId, d.permiteRodizio
           FROM turmas t JOIN disciplinas d ON d.id=t.disciplinaId LEFT JOIN professores p ON p.id=t.professorId
           LEFT JOIN ambientes a ON a.id=t.ambienteId JOIN grupos_alunos g ON g.id=t.grupoId
           WHERE t.consomeDeId IS NULL AND t.diaSemana IS NOT NULL
             AND t.horaInicio IS NOT NULL AND COALESCE(t.formato,'') <> 'ASSINCRONA'""").fetchall()
    rod = {(a, b) for a, b in cur.execute("SELECT disciplinaAId, disciplinaBId FROM rodizios")}
    rod |= {(b, a) for a, b in rod}
    saida = []
    for i in range(len(turmas)):
        for j in range(i + 1, len(turmas)):
            a, b = turmas[i], turmas[j]
            if a[4] != b[4] or not (a[5] < b[6] and b[5] < a[6]):
                continue
            quando = f"{a[4]} {min_para_hora(max(a[5], b[5]))}"
            # Aula híbrida pode alternar semanas: a planilha não diz, então só pede confirmação
            grav = "CONFIRMAR (híbrida)" if "HIBRIDA" in (a[7], b[7]) else "ERRO"
            if a[8] and a[8] == b[8]:
                saida.append(("PROFESSOR", grav, a[9], a, b, quando))
            if a[10] and a[10] == b[10] and a[7] != "SINCRONA" and b[7] != "SINCRONA":
                # duas disciplinas que aceitam rodízio no mesmo laboratório = aviso, não erro
                rodizio = (a[14], b[14]) in rod or (a[15] and b[15])
                tipo = "AVISO" if rodizio else "ERRO"
                saida.append(("AMBIENTE" + (" (rodízio?)" if rodizio else ""),
                              tipo, a[11], a, b, quando))
            if a[12] == b[12]:
                saida.append(("GRUPO DE ALUNOS", grav, a[13], a, b, quando))
    return saida


# ---------------------------------------------------------------- relatório
def gerar_relatorio(caminho, resultados, choques, con):
    wb = Workbook()
    ws = wb.active
    ws.title = "RESUMO"
    ok = sum(1 for _, e, _ in resultados if not e)
    cab = Font(bold=True, color="FFFFFF")
    azul = PatternFill("solid", fgColor="1F3864")
    ws.append(["CONFERÊNCIA: BANCO x PLANILHA OFERTA 2026.2"])
    ws["A1"].font = Font(bold=True, size=13)
    ws.append([])
    ws.append(["Linhas de turma na planilha (aba Página1)", len(resultados)])
    ws.append(["Linhas encontradas no banco, com todos os campos iguais", ok])
    ws.append(["Linhas com divergência", len(resultados) - ok])
    ws.append([])
    q = lambda s: con.execute(s).fetchone()[0]
    ws.append(["Turmas com aula própria", q("SELECT COUNT(*) FROM turmas WHERE consomeDeId IS NULL")])
    ws.append(["Turmas que assistem a aula de outro curso (comunalidade)",
               q("SELECT COUNT(*) FROM turmas WHERE consomeDeId IS NOT NULL")])
    ws.append(["Disciplinas cadastradas", q("SELECT COUNT(*) FROM disciplinas")])
    ws.append(["  das quais sem código (curso sem matriz)", q("SELECT COUNT(*) FROM disciplinas WHERE codigo IS NULL")])
    ws.append(["Professores", q("SELECT COUNT(*) FROM professores")])
    ws.append(["Grupos de alunos", q("SELECT COUNT(*) FROM grupos_alunos")])
    ws.append(["Possíveis choques encontrados", len(choques)])
    ws.column_dimensions["A"].width = 62
    ws.column_dimensions["B"].width = 14

    w2 = wb.create_sheet("LINHAS")
    w2.append(["LINHA", "CURSO", "PERÍODO", "DISCIPLINA", "PROFESSOR", "FORMATO", "DIA",
               "HORÁRIO", "AMBIENTE", "RESULTADO"])
    for l, e, _ in resultados:
        w2.append([l["linha"], l["curso"], l["periodo_txt"], l["disciplina"], l["professor"] or l["prof_raw"],
                   l["formato_raw"], l["dia"], l["horario"], l["marca"],
                   "OK" if not e else "DIVERGE: " + ", ".join(e)])

    w3 = wb.create_sheet("POSSIVEIS_CHOQUES")
    w3.append(["TIPO", "GRAVIDADE", "ONDE", "QUANDO", "LINHA A", "TURMA A", "LINHA B", "TURMA B"])
    for tipo, grav, onde, a, b, quando in choques:
        w3.append([tipo, grav, onde, quando, a[1], f"{a[3]} - {a[2]}", b[1], f"{b[3]} - {b[2]}"])
    for w in (w2, w3):
        for c in w[1]:
            c.font, c.fill = cab, azul
        w.freeze_panes = "A2"
        for col, larg in zip("ABCDEFGHIJ", (26, 22, 16, 56, 30, 14, 11, 16, 14, 24)):
            w.column_dimensions[col].width = larg
    for c in w3[1]:
        c.alignment = Alignment(wrap_text=True)
    wb.save(caminho)


# ----------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description="Enche o banco do SAGA com a planilha do Allan")
    ap.add_argument("--db", default=DB_PADRAO)
    ap.add_argument("--estrutura", default=ESTRUTURA_PADRAO)
    ap.add_argument("--oferta", default=OFERTA_PADRAO)
    ap.add_argument("--recriar", action="store_true",
                    help="apaga o arquivo do banco e refaz tabelas e dados do zero")
    ap.add_argument("--criar-tabelas", action="store_true",
                    help="cria as tabelas por conta própria (sem usar o Prisma)")
    ap.add_argument("--limpar", action="store_true", help="apaga os dados antes de importar")
    ap.add_argument("--relatorio", help="gera uma planilha de conferência neste caminho")
    a = ap.parse_args()
    log = print
    # No Windows (cmd) alguns acentos podem não aparecer; isso evita que o script quebre por causa disso.
    try:
        sys.stdout.reconfigure(errors="replace")
    except Exception:
        pass

    for caminho in (a.estrutura, a.oferta):
        if not os.path.exists(caminho):
            sys.exit(f"Não achei o arquivo: {caminho}")
    os.makedirs(os.path.dirname(a.db) or ".", exist_ok=True)
    if a.recriar:
        for sufixo in ("", "-journal", "-wal", "-shm"):
            if os.path.exists(a.db + sufixo):
                os.remove(a.db + sufixo)
        a.criar_tabelas = True

    con = sqlite3.connect(a.db)
    con.execute("PRAGMA foreign_keys = ON")
    existe = con.execute("SELECT name FROM sqlite_master WHERE name='cursos'").fetchone()
    if a.criar_tabelas:
        if existe:
            sys.exit("As tabelas já existem. Use --limpar para recomeçar os dados.")
        con.executescript(DDL)
    elif not existe:
        sys.exit("O banco ainda não tem tabelas. Rode: python seed.py --recriar")
    if a.limpar:
        for t in ORDEM_LIMPEZA:
            con.execute(f'DELETE FROM "{t}"')
        con.execute("DELETE FROM sqlite_sequence")
        con.commit()
    if con.execute("SELECT COUNT(*) FROM cursos").fetchone()[0]:
        sys.exit("O banco já tem dados. Rode: python seed.py --recriar")

    log("1/3 Lendo as planilhas...")
    estrutura = ler_estrutura(a.estrutura)
    oferta = ler_oferta(a.oferta)
    log(f"  {len(estrutura[0])} linhas de matriz, {len(oferta)} linhas de oferta")
    log("2/3 Gravando no banco...")
    importar(con, estrutura, oferta, log)
    log("3/3 Conferindo o banco contra a planilha...")
    resultados = conferir(con, oferta)
    ok = sum(1 for _, e, _ in resultados if not e)
    log(f"  {ok} de {len(resultados)} linhas conferem com a planilha")
    for l, e, _ in resultados:
        if e:
            log(f"  DIVERGE linha {l['linha']}: {', '.join(e)}")
    choques = achar_choques(con)
    log(f"  possíveis choques de horário na oferta: {len(choques)}")
    if a.relatorio:
        gerar_relatorio(a.relatorio, resultados, choques, con)
        log(f"  relatório salvo em {a.relatorio}")
    con.close()
    log("\nPronto! Agora rode:  npm run dev")


if __name__ == "__main__":
    main()
