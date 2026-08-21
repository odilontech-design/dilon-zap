import { PrismaClient } from "@prisma-erp/client";

/**
 * Falha cedo e com nome, quando a variável certa não está definida.
 *
 * O snippet que Neon e Supabase entregam pronto usa `DATABASE_URL` — que
 * neste monorepo é a variável do Dilon Zap. Quem copia e cola acaba com o
 * banco de esquadrias sem configuração e, pior, com o Zap apontando pro banco
 * errado. Sem esta checagem o sintoma seria um erro do Prisma sobre string de
 * conexão vazia, que não diz qual variável faltou nem que existem duas.
 */
if (!process.env.ESQUADRIAS_DATABASE_URL) {
  throw new Error(
    "ESQUADRIAS_DATABASE_URL não está definida. Este é o banco do SaaS de esquadrias, " +
      "separado do DATABASE_URL do Dilon Zap — se você copiou a string do Neon/Supabase, " +
      "renomeie a variável. Ver docs/deploy-vercel-neon.md.",
  );
}
// Nota: com um `.env` no disco esta checagem quase nunca dispara — o runtime
// do Prisma carrega o `.env` ao ser importado, antes daqui. Ela existe para o
// deploy sem arquivo `.env` (Vercel, container), que é onde o esquecimento
// realmente acontece.

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
