// Copia todos os dados do banco local antigo (prisma/dev.db, SQLite) para o PostgreSQL do .env (Neon).
//
// Uso:  npm run migrar                 (só grava se o PostgreSQL estiver vazio)
//       npm run migrar -- --substituir (apaga o que houver no PostgreSQL antes)
//
// As tabelas precisam existir antes: o `npm run migrar` roda `prisma db push` primeiro.

import { DatabaseSync } from "node:sqlite";
import { Prisma, PrismaClient } from "@prisma/client";

const ARQUIVO_SQLITE = process.env.SQLITE ?? "prisma/dev.db";
const substituir = process.argv.includes("--substituir");

// Ordem que respeita as chaves estrangeiras (quem é referenciado vem antes)
const ORDEM = [
  "Curso", "Ambiente", "Professor", "Disciplina", "MatrizItem", "ProfessorDisciplina", "Rodizio",
  "GrupoAlunos", "Oferta", "Turma", "Alteracao", "Aviso", "Usuario", "DiaSemAula", "Atividade",
];
// Sessões de login não são copiadas: todo mundo entra de novo no site novo.

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(ARQUIVO_SQLITE, { readOnly: true });
const modelos = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
const delegado = (modelo: string) => (prisma as unknown as Record<string, { createMany: (a: { data: unknown[] }) => Promise<{ count: number }> }>)[modelo.charAt(0).toLowerCase() + modelo.slice(1)];

/** SQLite guarda booleano como 0/1 e data como número (ms) ou texto: converte para o tipo do Prisma. */
function converter(modelo: string, linha: Record<string, unknown>) {
  const saida: Record<string, unknown> = {};
  for (const campo of modelos.get(modelo)!.fields) {
    if (campo.kind !== "scalar" || !(campo.name in linha)) continue;
    const v = linha[campo.name];
    if (v == null) saida[campo.name] = null;
    else if (campo.type === "Boolean") saida[campo.name] = Boolean(Number(v));
    else if (campo.type === "DateTime") saida[campo.name] = typeof v === "number" || /^\d+$/.test(String(v)) ? new Date(Number(v)) : new Date(String(v).replace(" ", "T") + (String(v).endsWith("Z") ? "" : "Z"));
    else if (campo.type === "Int") saida[campo.name] = Number(v);
    else saida[campo.name] = v;
  }
  return saida;
}

async function main() {
  const tabela = (modelo: string) => modelos.get(modelo)!.dbName ?? modelo;
  const jaTem = await prisma.turma.count() + (await prisma.usuario.count());
  if (jaTem > 0 && !substituir) {
    console.error("O PostgreSQL já tem dados. Para apagar e copiar de novo: npm run migrar -- --substituir");
    process.exit(1);
  }
  if (substituir) {
    const todas = [...ORDEM, "Sessao"].map((m) => `"${tabela(m)}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE ${todas} RESTART IDENTITY CASCADE`);
  }

  for (const modelo of ORDEM) {
    const linhas = sqlite.prepare(`SELECT * FROM "${tabela(modelo)}"`).all() as Record<string, unknown>[];
    let dados = linhas.map((l) => converter(modelo, l));
    // Comunalidade aponta para outra turma: grava sem o vínculo e liga depois
    const vinculos = modelo === "Turma" ? dados.filter((d) => d.consomeDeId != null).map((d) => [d.id as number, d.consomeDeId as number]) : [];
    if (modelo === "Turma") dados = dados.map((d) => ({ ...d, consomeDeId: null }));
    const { count } = dados.length ? await delegado(modelo).createMany({ data: dados }) : { count: 0 };
    for (const [id, consomeDeId] of vinculos) await prisma.turma.update({ where: { id }, data: { consomeDeId } });
    console.log(`${tabela(modelo).padEnd(22)} ${String(count).padStart(5)} de ${linhas.length}`);
  }

  // Ids foram copiados como estavam: o contador de cada tabela continua do maior id
  for (const modelo of ORDEM) {
    const temId = modelos.get(modelo)!.fields.some((f) => f.name === "id" && f.type === "Int" && f.hasDefaultValue);
    if (!temId) continue;
    const t = tabela(modelo);
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1), (SELECT MAX(id) FROM "${t}") IS NOT NULL)`
    );
  }
  console.log("\nPronto: dados copiados para o PostgreSQL.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
