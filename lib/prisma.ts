import { PrismaClient } from "@prisma/client";

// Uma única conexão com o banco, reaproveitada enquanto o servidor de
// desenvolvimento recarrega (senão o Next abre dezenas de conexões).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
