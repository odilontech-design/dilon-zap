import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  WAMessageStatus,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import { prisma } from "@dilon-zap/db";
import { usePostgresAuthState } from "./postgres-auth-state";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

// Uma entrada por sessão ativa nesta instância do worker. Evita abrir duas
// conexões Baileys pro mesmo número se o loop de polling rodar de novo antes
// da conexão anterior terminar de subir.
const activeSessions = new Map<string, { stop: () => void }>();

const OUTBOX_POLL_INTERVAL_MS = 2_000;
const NEW_SESSION_POLL_INTERVAL_MS = 5_000;

export function isSessionActive(sessionId: string) {
  return activeSessions.has(sessionId);
}

export async function startSession(sessionId: string) {
  if (activeSessions.has(sessionId)) return;

  let stopped = false;
  activeSessions.set(sessionId, { stop: () => (stopped = true) });

  const { state, saveCreds } = await usePostgresAuthState(sessionId);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    // Fase 0: um número por tenant, throttling de disparo em massa entra na
    // fase de Campanhas — aqui só garantimos que a conexão em si é estável.
  });

  socket.ev.on("creds.update", saveCreds);

  socket.ev.on("connection.update", async (update) => {
    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      const qrDataUrl = await QRCode.toDataURL(qr);
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { status: "PENDING_QR", qrCode: qrDataUrl, lastError: null },
      });
    }

    if (connection === "open") {
      const phoneNumber = socket.user?.id?.split(":")[0] ?? null;
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: {
          status: "CONNECTED",
          qrCode: null,
          phoneNumber,
          lastConnectedAt: new Date(),
          lastError: null,
        },
      });
    }

    if (connection === "close") {
      activeSessions.delete(sessionId);

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: {
          status: loggedOut ? "LOGGED_OUT" : "DISCONNECTED",
          lastError: lastDisconnect?.error?.message ?? null,
        },
      });

      // Reconecta sozinho a menos que o usuário tenha deslogado pelo celular
      // — nesse caso precisa de um QR novo, então não adianta insistir.
      if (!loggedOut && !stopped) {
        setTimeout(() => startSession(sessionId), 3_000);
      }
    }
  });

  socket.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const waJid = msg.key.remoteJid;
      const text =
        msg.message?.conversation ?? msg.message?.extendedTextMessage?.text ?? null;

      if (!waJid || !text) continue; // Fase 0: só texto. Mídia entra depois.

      await recordInboundMessage({ sessionId, waJid, text, waMessageId: msg.key.id ?? undefined });
    }
  });

  socket.ev.on("messages.update", async (updates) => {
    for (const { key, update } of updates) {
      if (!key.fromMe || !key.id || update.status == null) continue;

      const status = mapReceiptStatus(update.status);
      if (!status) continue;

      // Best-effort: se a mensagem não é nossa (ex: veio de outro worker/sessão
      // antiga) o updateMany simplesmente não acha nada pra atualizar.
      await prisma.message.updateMany({
        where: { sessionId, waMessageId: key.id, direction: "OUTBOUND" },
        data: { status },
      });
    }
  });

  pollOutbox(sessionId, socket, () => stopped);
}

// WAMessageStatus do Baileys: ERROR/PENDING/SERVER_ACK (enviou pro WhatsApp) /
// DELIVERY_ACK (chegou no aparelho) / READ / PLAYED (áudio ouvido, conta como lido).
function mapReceiptStatus(waStatus: number): "SENT" | "DELIVERED" | "READ" | "FAILED" | null {
  switch (waStatus) {
    case WAMessageStatus.ERROR:
      return "FAILED";
    case WAMessageStatus.SERVER_ACK:
      return "SENT";
    case WAMessageStatus.DELIVERY_ACK:
      return "DELIVERED";
    case WAMessageStatus.READ:
    case WAMessageStatus.PLAYED:
      return "READ";
    default:
      return null;
  }
}

async function recordInboundMessage(params: {
  sessionId: string;
  waJid: string;
  text: string;
  waMessageId?: string;
}) {
  const session = await prisma.whatsAppSession.findUniqueOrThrow({
    where: { id: params.sessionId },
    select: { tenantId: true },
  });

  const contact = await prisma.contact.upsert({
    where: { tenantId_waJid: { tenantId: session.tenantId, waJid: params.waJid } },
    create: { tenantId: session.tenantId, waJid: params.waJid },
    update: {},
  });

  const existingConversation = await prisma.conversation.findFirst({
    where: { tenantId: session.tenantId, contactId: contact.id, sessionId: params.sessionId },
    select: { id: true },
  });

  const conversation = existingConversation
    ? await prisma.conversation.update({
        where: { id: existingConversation.id },
        data: { lastMessageAt: new Date(), status: "OPEN" },
      })
    : await prisma.conversation.create({
        data: {
          tenantId: session.tenantId,
          sessionId: params.sessionId,
          contactId: contact.id,
          lastMessageAt: new Date(),
        },
      });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sessionId: params.sessionId,
      direction: "INBOUND",
      status: "DELIVERED",
      body: params.text,
      waMessageId: params.waMessageId,
    },
  });

  if (!conversation.assignedToId) {
    await maybeAutoReply({
      tenantId: session.tenantId,
      sessionId: params.sessionId,
      conversationId: conversation.id,
      inboundText: params.text,
    });
  }
}

// v1 do construtor de fluxos: casamento simples por palavra-chave. Só dispara
// pra conversa sem atendente atribuído — assim que um humano assume, a
// automação para de responder no lugar dele.
async function maybeAutoReply(params: {
  tenantId: string;
  sessionId: string;
  conversationId: string;
  inboundText: string;
}) {
  const rules = await prisma.autoReply.findMany({ where: { tenantId: params.tenantId } });
  if (rules.length === 0) return;

  const lowerText = params.inboundText.toLowerCase();
  const match =
    rules.find((r) => !r.isDefault && r.keyword && lowerText.includes(r.keyword.toLowerCase())) ??
    rules.find((r) => r.isDefault);

  if (!match) return;

  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      sessionId: params.sessionId,
      direction: "OUTBOUND",
      status: "PENDING",
      body: match.response,
    },
  });
}

// Fase 0 mantém a fila simples de propósito: sem Redis/BullMQ ainda, o
// worker só varre mensagens PENDING da própria sessão a cada 2s. Isso já
// resolve o caso de uso (1 atendente respondendo), e a fila de verdade com
// throttling anti-ban entra na fase de Campanhas.
function pollOutbox(sessionId: string, socket: ReturnType<typeof makeWASocket>, isStopped: () => boolean) {
  const tick = async () => {
    if (isStopped()) return;

    const pending = await prisma.message.findMany({
      where: { sessionId, direction: "OUTBOUND", status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 5,
      include: { conversation: { include: { contact: true } } },
    });

    for (const message of pending) {
      const blocked = await prisma.contactBlock.findUnique({
        where: {
          tenantId_waJid: {
            tenantId: message.conversation.tenantId,
            waJid: message.conversation.contact.waJid,
          },
        },
      });

      if (blocked) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "FAILED", errorMessage: "Contato está na lista de bloqueios" },
        });
        continue;
      }

      try {
        const sent = await socket.sendMessage(message.conversation.contact.waJid, {
          text: message.body,
        });
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "SENT", waMessageId: sent?.key.id ?? undefined },
        });
      } catch (error) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "FAILED", errorMessage: (error as Error).message },
        });
      }
    }

    setTimeout(tick, OUTBOX_POLL_INTERVAL_MS);
  };

  tick();
}

/** Sobe conexões para sessões que ainda não estão ativas nesta instância. */
export async function syncSessions() {
  const sessions = await prisma.whatsAppSession.findMany({
    where: { status: { in: ["PENDING_QR", "CONNECTED", "DISCONNECTED"] } },
    select: { id: true },
  });

  for (const session of sessions) {
    if (!isSessionActive(session.id)) {
      startSession(session.id).catch((err) =>
        logger.error({ err, sessionId: session.id }, "falha ao iniciar sessão")
      );
    }
  }
}

export function watchForNewSessions() {
  setInterval(syncSessions, NEW_SESSION_POLL_INTERVAL_MS);
}
