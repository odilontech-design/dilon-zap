import { PrismaClient } from "@prisma-erp/client";

/**
 * Client do banco de esquadrias. Singleton preso no globalThis porque o
 * hot-reload do Next recarrega o módulo a cada alteração de arquivo — sem
 * isso, o pool de conexões cresce até o Postgres recusar novas em plena
 * sessão de desenvolvimento.
 */
const globalParaPrisma = globalThis as unknown as { prismaErp?: PrismaClient };

export const prisma =
  globalParaPrisma.prismaErp ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalParaPrisma.prismaErp = prisma;

export * from "@prisma-erp/client";
