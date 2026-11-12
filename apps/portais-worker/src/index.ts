import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.on("unhandledRejection", (err) => {
  console.error("[portais] unhandled rejection (processo continua no ar)", err instanceof Error ? err.message : err);
});
process.on("uncaughtException", (err) => {
  console.error("[portais] uncaught exception (processo continua no ar)", err instanceof Error ? err.message : err);
});

/**
 * Worker dos portais de anúncio. Processo próprio, como o do SDR e o do
 * Vendedor IA: lê o estoque no Postgres e conversa com a API da OLX. Se ele
 * cair ou a OLX ficar fora, o resto do Zap (WhatsApp, CRM, vitrine) segue
 * normal; só a sincronização dos anúncios atrasa até ele voltar.
 *
 * A cada rodada: confere os lotes enviados antes (no ar, recusado, motivo),
 * depois manda o que mudou (carro novo, preço novo, vendido sai do ar).
 */

const numero = (nome: string, padrao: number) => {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
};

async function main() {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
  const { cicloPortais, chaveDoAmbiente } = await import("@dilon-zap/portais");
  const intervaloMs = numero("PORTAIS_INTERVALO_MS", 60_000);

  let parando = false;
  let acordar: (() => void) | null = null;
  const parar = (sinal: string) => {
    if (parando) return;
    parando = true;
    console.log(`[portais] ${sinal}: termina a rodada em andamento e encerra`);
    acordar?.();
  };
  process.on("SIGINT", () => parar("SIGINT"));
  process.on("SIGTERM", () => parar("SIGTERM"));
  console.log(`[portais] no ar, ciclo a cada ${intervaloMs} ms`);

  let avisou = false;
  while (!parando) {
    const segredo = process.env.PORTAIS_CHAVE;
    const urlBase = process.env.NEXTAUTH_URL;
    if (!segredo || !urlBase) {
      if (!avisou) console.error("[portais] PORTAIS_CHAVE ou NEXTAUTH_URL não configurados: o worker fica parado até configurar.");
      avisou = true;
    } else {
      try {
        const r = await cicloPortais({ chave: chaveDoAmbiente(segredo), segredoFotos: segredo, urlBase });
        if (r.enviados || r.removidos || r.conferidos || r.erros) {
          console.log(`[portais] lojas ${r.lojas}, enviados ${r.enviados}, removidos ${r.removidos}, conferidos ${r.conferidos}, erros ${r.erros}`);
        }
      } catch (e) {
        console.error("[portais] ciclo falhou:", e instanceof Error ? e.message : e);
      }
    }
    await new Promise<void>((r) => {
      acordar = r;
      setTimeout(r, intervaloMs);
    });
  }
  const { prisma } = await import("@dilon-zap/db");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("[portais] falha ao iniciar:", e);
  process.exit(1);
});
