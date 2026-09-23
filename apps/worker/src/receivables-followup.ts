import pino from "pino";
import { prisma } from "@dilon-zap/db";
import { avisarNoCelular } from "@dilon-zap/push";
import { precisaLembrarHoje, mesmoDiaCalendario, faixaDeVencimento, saldoDoPedido } from "@dilon-zap/receivables";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

/**
 * Acompanhamento interno das contas a receber — avisa o FINANCEIRO, nunca o
 * cliente. A régua (2 dias antes de vencer, no dia, e a cada 7 dias vencido)
 * mora em @dilon-zap/receivables, junto com a mesma conta que a tela de "A
 * receber" usa pro selo "⏰ Hoje" — os dois têm que concordar em qual é o dia.
 *
 * Mora no worker, não no web: o web roda como app Next (request/response),
 * sem processo de fundo de verdade sem gambiarra, e o worker já é um
 * processo Node contínuo com esse padrão pronto (ver scheduled-messages.ts).
 * Nada aqui manda mensagem pro WhatsApp — só notificação (push) — então não
 * tem o risco de "disparo em massa" que faria isso precisar do outbox.
 *
 * Simplificação conhecida da v1: não confere se o tenant ainda tem o
 * recurso Contas a receber ligado (isso mora no web, em lib/plano.ts, e
 * trazer aquela dependência pra cá não valia a complexidade agora). Na
 * pior hipótese, uma empresa que desligou o recurso continua recebendo um
 * aviso ocasional de um pedido antigo — nunca alcança o cliente dela.
 */

const INTERVALO_MS = 60 * 60 * 1000; // granularidade é o dia; de hora em hora sobra
// Teto por ciclo: mesmo sem risco de banimento (não é WhatsApp), uma
// varredura que represou (processo caiu um dia) não devia disparar
// centenas de push de uma vez só.
const TETO_POR_CICLO = 200;

export function startReceivablesFollowupLoop() {
  const rodar = async () => {
    try {
      await processarAcompanhamentoFinanceiro();
    } catch (err) {
      logger.error({ err }, "falha no ciclo de acompanhamento de contas a receber");
    }
  };

  void rodar();
  const timer = setInterval(() => void rodar(), INTERVALO_MS);
  return () => clearInterval(timer);
}

export async function processarAcompanhamentoFinanceiro() {
  const agora = new Date();

  // Só pedido com prazo combinado entra na régua — "sem prazo" não tem data
  // de referência pra calcular checkpoint nenhum.
  const candidatos = await prisma.order.findMany({
    where: { status: "FECHADO", pago: false, vencimento: { not: null } },
    select: {
      id: true,
      numero: true,
      tenantId: true,
      totalCents: true,
      vencimento: true,
      ultimoLembreteInternoEm: true,
      contact: { select: { name: true, phoneNumber: true } },
      pagamentos: { select: { valorCents: true } },
    },
    take: TETO_POR_CICLO,
    orderBy: { vencimento: "asc" },
  });

  for (const pedido of candidatos) {
    if (!pedido.vencimento || !precisaLembrarHoje(pedido.vencimento, agora)) continue;
    // Já avisado hoje — não repete se o ciclo rodar de novo na mesma data.
    if (pedido.ultimoLembreteInternoEm && mesmoDiaCalendario(pedido.ultimoLembreteInternoEm, agora)) {
      continue;
    }

    try {
      const destinatarios = await prisma.user.findMany({
        where: { tenantId: pedido.tenantId, role: { in: ["OWNER", "FINANCEIRO"] }, deactivatedAt: null },
        select: { id: true },
      });
      if (destinatarios.length === 0) continue;

      const saldoCents = saldoDoPedido(pedido.totalCents, pedido.pagamentos);
      const nome = pedido.contact.name ?? pedido.contact.phoneNumber ?? "cliente sem nome";
      const faixa = faixaDeVencimento(pedido.vencimento, agora);
      const valor = (saldoCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const corpo =
        faixa === "vencido"
          ? `${nome} está devendo ${valor} — pedido #${pedido.numero}`
          : `${nome} vence hoje: ${valor} — pedido #${pedido.numero}`;

      await Promise.all(
        destinatarios.map((u) =>
          avisarNoCelular(u.id, {
            titulo: "Conta a receber",
            corpo,
            url: "/receber",
            // Agrupa avisos do MESMO pedido em notificações seguidas — sem
            // isso, o aviso de hoje some embaixo do de 7 dias atrás em vez
            // de atualizar o mesmo card.
            tag: `receber-${pedido.id}`,
          })
        )
      );

      await prisma.order.update({
        where: { id: pedido.id },
        data: { ultimoLembreteInternoEm: agora },
      });
    } catch (err) {
      // Um pedido com dado estranho não pode travar o ciclo inteiro — os
      // outros continuam sendo avisados.
      logger.error({ err, orderId: pedido.id }, "falha ao avisar pedido no acompanhamento de contas a receber");
    }
  }
}
