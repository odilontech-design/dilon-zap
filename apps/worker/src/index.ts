import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// __dirname não existe em ESM (o worker virou "type": "module" na migração
// pro Baileys 7.x, que só publica exports ESM) — reconstrói o equivalente a
// partir da URL do próprio módulo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rede de segurança: o worker precisa ficar de pé o tempo todo (é ele que
// segura a conexão com o WhatsApp). Sem isso, uma promise rejeitada sem
// .catch() em qualquer lugar (nosso código ou uma lib) derruba o processo
// inteiro por padrão no Node — foi exatamente isso que causou instabilidade
// de conexão quando o Postgres soltava uma conexão ociosa.
process.on("unhandledRejection", (err) => {
  console.error("[dilon-zap worker] unhandled rejection (processo continua no ar)", err);
});
process.on("uncaughtException", (err) => {
  console.error("[dilon-zap worker] uncaught exception (processo continua no ar)", err);
});

// Monorepo sem .env por app: carrega o .env da raiz do projeto ANTES de
// importar qualquer coisa que leia process.env no carregamento do módulo
// (o Prisma Client faz isso). Por isso session-manager entra via import()
// dinâmico aqui dentro de main(), e não como import estático no topo —
// um import estático seria resolvido antes do dotenv.config() rodar.
async function main() {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

  const { syncSessions, watchForNewSessions } = await import("./session-manager");
  const { startInternalServer } = await import("./http-server");
  const { watchForDuplicateContacts } = await import("./reconcile-contacts");

  console.log("[dilon-zap worker] iniciando...");
  await syncSessions();
  watchForNewSessions();
  watchForDuplicateContacts();
  startInternalServer();
  console.log("[dilon-zap worker] no ar, observando sessões a cada 5s.");
}

main().catch((err) => {
  console.error("[dilon-zap worker] erro fatal", err);
  process.exit(1);
});
