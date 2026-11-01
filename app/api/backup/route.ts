// Download de uma cópia do banco (só administradores). VACUUM INTO gera uma cópia consistente
// mesmo com o sistema em uso.

import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { usuarioAtual } from "@/lib/auth";
import { registrar } from "@/lib/atividade";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario?.admin) return new Response("Apenas administradores podem baixar o backup.", { status: 403 });

  const carimbo = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const arquivo = join(tmpdir(), `saga-backup-${carimbo}-${process.pid}.db`);
  await prisma.$executeRawUnsafe(`VACUUM INTO '${arquivo.replaceAll(sep, "/").replaceAll("'", "''")}'`);
  const conteudo = await readFile(arquivo);
  await rm(arquivo, { force: true });
  await registrar(usuario, "Backup", "Baixou uma cópia do banco de dados");

  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="saga-backup-${carimbo}.db"`,
      "Cache-Control": "no-store",
    },
  });
}
