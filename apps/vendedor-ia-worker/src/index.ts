import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Rede de segurança: uma promise rejeitada sem .catch() não derruba o processo.
process.on("unhandledRejection", (err) => {
  console.error("[vendedor-ia] unhandled rejection (processo continua no ar)", err instanceof Error ? err.message : err);
});
process.on("uncaughtException", (err) => {
  console.error("[vendedor-ia] uncaught exception (processo continua no ar)", err instanceof Error ? err.message : err);
});

/**
 * Worker do Vendedor IA. Processo próprio, como o do SDR: lê as conversas no
 * Postgres, chama a API da Anthropic e grava as respostas na fila de saída.
 * Não importa nada do worker do WhatsApp e não abre porta. Se ele cair, a
 * API ficar lenta ou a chave vencer, o WhatsApp de todos os clientes segue
 * normal: só a IA para de responder, e a equipe atende pelo Inbox.
 */

const numero = (nome: string, padrao: number) => {
  const n = Number(process.env[nome]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : padrao;
};

async function main() {
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
  const { ciclo, cicloDoVendedor, precisaVerificar, verificarConexao } = await import("@dilon-zap/vendedor-ia");
  const { chaveAnthropicDoServidor } = await import("@dilon-zap/sdr-core");
  const { default: Anthropic } = await import("@anthropic-ai/sdk");

  const apiKey = chaveAnthropicDoServidor();
  if (!apiKey) {
    // Só o Vendedor IA de carros depende dela. O vendedor de SaaS do SDR escolhe o provedor (Claude ou Gemini) pela
    // configuração da IA do SDR e, se faltar chave, passa a conversa para uma pessoa em vez de travar.
    console.error("[vendedor-ia] ANTHROPIC_API_KEY não configurada: o Vendedor IA de carros fica parado. O vendedor de SaaS do SDR segue pela configuração dele.");
  }
  // Timeout curto e poucas tentativas: o cliente está esperando no WhatsApp,
  // e uma resposta que demora minutos já perdeu o sentido.
  const cliente = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 2 });
  const intervaloMs = numero("VENDEDOR_IA_INTERVALO_MS", 3_000);

  const acordarFila = async (tenantId: string) => {
    const base = process.env.WORKER_INTERNAL_URL;
    const segredo = process.env.WORKER_INTERNAL_SECRET;
    if (!base || !segredo) return; // sem isso o worker do WhatsApp acha a mensagem na próxima varredura
    await fetch(`${base}/internal/outbox/wake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${segredo}` },
      body: JSON.stringify({ tenantId }),
      signal: AbortSignal.timeout(2_000),
    }).catch(() => {});
  };

  let parando = false;
  let acordar: (() => void) | null = null;
  const parar = (sinal: string) => {
    if (parando) return;
    parando = true;
    console.log(`[vendedor-ia] ${sinal}: termina a rodada em andamento e encerra`);
    acordar?.();
  };
  process.on("SIGINT", () => parar("SIGINT"));
  process.on("SIGTERM", () => parar("SIGTERM"));
  console.log(`[vendedor-ia] no ar, ciclo a cada ${intervaloMs} ms`);

  while (!parando) {
    // Saúde da conexão com a Anthropic (a cada 15 min e quando o Super Admin pede): é o que a tela do Super Admin mostra.
    try {
      if (await precisaVerificar()) {
        const v = await verificarConexao(apiKey ? cliente : null);
        console.log(`[vendedor-ia] conexão com a Anthropic: ${v.ok ? "ok" : "com problema"}${apiKey ? "" : " (sem chave)"}`);
      }
    } catch (e) {
      console.error("[vendedor-ia] conferência da conexão falhou:", e instanceof Error ? e.message : e);
    }
    if (apiKey) {
      try {
        const r = await ciclo({ cliente, acordarFila, urlDoSite: process.env.NEXTAUTH_URL ?? null });
        if (r.respondidas || r.erros) console.log(`[vendedor-ia] respondidas ${r.respondidas}, erros ${r.erros}`);
      } catch (e) {
        console.error("[vendedor-ia] ciclo falhou:", e instanceof Error ? e.message : e);
      }
    }
    // Vendedor de SaaS do SDR: só age em empresa com o SDR e o vendedor ligados, e só em conversa de quem respondeu a uma
    // abordagem do SDR. Independente do de carros: uma falha de um não para o outro.
    try {
      const r = await cicloDoVendedor({ acordarFila });
      if (r.respondidas || r.sugeridas || r.transferidas || r.erros) console.log(`[vendedor-saas] respondidas ${r.respondidas}, sugeridas ${r.sugeridas}, transferidas ${r.transferidas}, erros ${r.erros}`);
    } catch (e) {
      console.error("[vendedor-saas] ciclo falhou:", e instanceof Error ? e.message : e);
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
  console.error("[vendedor-ia] falha ao iniciar", e);
  process.exit(1);
});
