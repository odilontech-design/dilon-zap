import path from "node:path";
import dotenv from "dotenv";

// Monorepo sem .env por app: carrega o .env da raiz do projeto ANTES de
// importar qualquer coisa que leia process.env no carregamento do módulo
// (o Prisma Client faz isso). Por isso session-manager entra via import()
// dinâmico aqui dentro de main(), e não como import estático no topo —
// um import estático seria resolvido antes do dotenv.config() rodar.
async function main() {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

  const { syncSessions, watchForNewSessions } = await import("./session-manager");

  console.log("[dilon-zap worker] iniciando...");
  await syncSessions();
  watchForNewSessions();
  console.log("[dilon-zap worker] no ar, observando sessões a cada 5s.");
}

main().catch((err) => {
  console.error("[dilon-zap worker] erro fatal", err);
  process.exit(1);
});
