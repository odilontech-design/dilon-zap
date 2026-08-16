import pino from "pino";
import { prisma } from "@dilon-zap/db";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

/**
 * Varredura das mensagens agendadas.
 *
 * A cada ciclo, pega o que já venceu e coloca na fila de saída — não envia
 * direto. O outbox já sabe respeitar bloqueio, vestir o nome do atendente,
 * gravar no histórico e reenviar quando o cliente não consegue decifrar;
 * duplicar isso aqui seria criar um segundo lugar pra esquecer regra.
 */

// 30s: a granularidade que a atendente enxerga ao marcar é o minuto, então
// meio minuto de atraso é invisível. Mais curto seria consulta à toa.
const INTERVALO_MS = 30_000;

export function startScheduledMessagesLoop() {
  const rodar = async () => {
    try {
      await processarAgendamentosVencidos();
    } catch (err) {
      logger.error({ err }, "falha no ciclo de mensagens agendadas");
    }
  };

  void rodar();
  const timer = setInterval(() => void rodar(), INTERVALO_MS);
  return () => clearInterval(timer);
}

export async function processarAgendamentosVencidos() {
  const agora = new Date();

  const vencidos = await prisma.scheduledMessage.findMany({
    where: { status: "PENDING", scheduledFor: { lte: agora } },
    include: {
      conversation: {
        select: { id: true, sessionId: true, tenantId: true, contactId: true },
      },
    },
    // Teto por ciclo: se algo represar (worker parado umas horas), não
    // despeja tudo de uma vez no WhatsApp — o que pareceria disparo em massa
    // e é justamente o comportamento que derruba número.
    take: 20,
    orderBy: { scheduledFor: "asc" },
  });

  for (const agendada of vencidos) {
    try {
      // O cliente escreveu depois de a mensagem ter sido marcada?
      //
      // Compara com o marco guardado na hora do agendamento, não com "existe
      // mensagem recente": o que interessa é se aconteceu algo NOVO desde
      // que a atendente programou. Um pós-venda automático chegando em cima
      // de uma reclamação em andamento é pior que não chegar.
      const ultimaEntrada = await prisma.message.findFirst({
        where: { conversationId: agendada.conversationId, direction: "INBOUND" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      const clienteEscreveuDepois =
        ultimaEntrada &&
        (!agendada.lastInboundAtOnSchedule ||
          ultimaEntrada.createdAt > agendada.lastInboundAtOnSchedule);

      if (clienteEscreveuDepois) {
        await prisma.scheduledMessage.update({
          where: { id: agendada.id },
          data: { status: "HELD", heldAt: agora },
        });
        logger.info(
          { agendadaId: agendada.id, conversationId: agendada.conversationId },
          "agendamento segurado — cliente escreveu antes da hora"
        );
        continue;
      }

      // Vira mensagem na fila de saída. O senderUserId faz o nome de quem
      // marcou aparecer pro cliente, como em qualquer resposta manual.
      const mensagem = await prisma.message.create({
        data: {
          conversation: { connect: { id: agendada.conversationId } },
          session: { connect: { id: agendada.conversation.sessionId } },
          direction: "OUTBOUND",
          status: "PENDING",
          body: agendada.body,
          ...(agendada.createdById ? { sender: { connect: { id: agendada.createdById } } } : {}),
        },
        select: { id: true },
      });

      await prisma.scheduledMessage.update({
        where: { id: agendada.id },
        data: { status: "SENT", sentAt: agora, messageId: mensagem.id },
      });

      logger.info({ agendadaId: agendada.id, messageId: mensagem.id }, "agendamento entrou na fila de saída");
    } catch (err) {
      // Um agendamento com problema não pode travar os outros do lote. Fica
      // em PENDING e o próximo ciclo tenta de novo — o que também cobre o
      // caso de o banco ou a sessão estarem indisponíveis por um instante.
      logger.error({ err, agendadaId: agendada.id }, "falha ao processar agendamento");
    }
  }

  return vencidos.length;
}
