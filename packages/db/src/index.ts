import { PrismaClient } from "@prisma/client";

// Reaproveita a instância entre hot-reloads do Next.js em dev, senão cada
// reload abre uma conexão nova com o Postgres até estourar o pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
