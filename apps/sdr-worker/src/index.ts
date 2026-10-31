import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

// __dirname não existe em ESM; mesmo motivo do worker do WhatsApp.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rede de segurança: uma promise rejeitada sem .catch() não derruba o processo.
process.on("unhandledRejection", (err) => {
  console.error("[dilon-zap sdr-worker] unhandled rejection (processo continua no ar)", err instanceof Error ? err.name : err);
});
process.on("uncaughtException", (err) => {
  console.error("[dilon-zap sdr-worker] uncaught exception (processo continua no ar)", err instanceof Error ? err.name : err);
});

/**
 * Worker do SDR. Processo próprio, sem WhatsApp: só lê a fila no Postgres e
 * processa importações e qualificações. Não importa nada do worker do WhatsApp,
 * não abre porta e não fala com o worker de lá.
 */

const numero = (nome: string, padrao: number) => {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
};

async function main() {
  // Sem .env no container: as variáveis vêm do compose. Localmente carrega o da raiz, se existir.
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

  // O Prisma lê DATABASE_URL ao carregar; por isso o import vem depois do dotenv.
  const { processarProximoTrabalho, LIMITES } = await import("@dilon-zap/sdr-core");
  const { prisma } = await import("@dilon-zap/db");

  const workerId = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const intervaloMs = numero("SDR_INTERVALO_MS", 5_000);
  const lote = numero("SDR_LOTE", LIMITES.loteDeLinhas);
  const linhasPorExecucao = numero("SDR_LINHAS_POR_EXECUCAO", LIMITES.linhasPorExecucao);

  let parando = false;
  let acordar: (() => void) | null = null;
  const parar = (sinal: string) => {
    if (parando) return;
    parando = true;
    console.log(`[dilon-zap sdr-worker] ${sinal} recebido: termina o trabalho em andamento e encerra`);
    acordar?.();
  };
  process.on("SIGINT", () => parar("SIGINT"));
  process.on("SIGTERM", () => parar("SIGTERM"));

  console.log(`[dilon-zap sdr-worker] no ar (${workerId}), fila a cada ${intervaloMs} ms, lote de ${lote}`);

  while (!parando) {
    let ciclo = null;
    try {
      ciclo = await processarProximoTrabalho({ workerId, lote, linhasPorExecucao });
    } catch (e) {
      // Falha fora de um trabalho (por exemplo, banco fora do ar): espera e tenta de novo.
      console.error("[dilon-zap sdr-worker] falha no ciclo:", e instanceof Error ? e.name : e);
    }
    if (ciclo) {
      // Sem dados de empresa nos logs: só ids e contagens.
      console.log(`[dilon-zap sdr-worker] trabalho ${ciclo.trabalhoId} (${ciclo.tipo}, tentativa ${ciclo.tentativas}): ${ciclo.resultado}, ${ciclo.processadas} linhas${ciclo.erro ? `, ${ciclo.erro}` : ""}`);
      continue; // há mais para fazer: não dorme
    }
    await new Promise<void>((resolve) => {
      acordar = resolve;
      setTimeout(resolve, intervaloMs);
    });
    acordar = null;
  }

  await prisma.$disconnect();
  console.log("[dilon-zap sdr-worker] encerrado");
}

main().catch((err) => {
  console.error("[dilon-zap sdr-worker] erro fatal", err instanceof Error ? err.name : err);
  process.exit(1);
});
