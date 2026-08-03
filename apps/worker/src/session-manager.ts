import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  WAMessageStatus,
  type proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import { randomUUID } from "node:crypto";
import { prisma } from "@dilon-zap/db";
import { uploadMedia, downloadMedia, isStorageConfigured } from "@dilon-zap/storage";
import { usePostgresAuthState } from "./postgres-auth-state";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

// Uma entrada por sessão ativa nesta instância do worker. Evita abrir duas
// conexões Baileys pro mesmo número se o loop de polling rodar de novo antes
// da conexão anterior terminar de subir. Guarda o socket + tenantId também,
// pra dar pro servidor HTTP interno resolver JID (ver http-server.ts).
type ActiveSession = {
  stop: () => void;
  socket: ReturnType<typeof makeWASocket> | null;
  tenantId: string;
};
const activeSessions = new Map<string, ActiveSession>();

const OUTBOX_POLL_INTERVAL_MS = 2_000;
const NEW_SESSION_POLL_INTERVAL_MS = 5_000;

export function isSessionActive(sessionId: string) {
  return activeSessions.has(sessionId);
}

/** Usado pelo servidor HTTP interno pra achar a conexão ativa de um tenant. */
export function getSocketForTenant(tenantId: string) {
  for (const entry of activeSessions.values()) {
    if (entry.tenantId === tenantId && entry.socket) return entry.socket;
  }
  return null;
}

export async function startSession(sessionId: string) {
  if (activeSessions.has(sessionId)) return;

  const sessionRow = await prisma.whatsAppSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { tenantId: true },
  });

  let stopped = false;
  const entry: ActiveSession = { stop: () => (stopped = true), socket: null, tenantId: sessionRow.tenantId };
  activeSessions.set(sessionId, entry);

  const { state, saveCreds } = await usePostgresAuthState(sessionId);
  const { version } = await fetchLatestBaileysVersion();

  const socket = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    // Pede o histórico mais completo que o WhatsApp aceitar mandar no
    // pareamento — só faz efeito num QR novo, não numa sessão já pareada.
    syncFullHistory: true,
    // Fase 0: um número por tenant, throttling de disparo em massa entra na
    // fase de Campanhas — aqui só garantimos que a conexão em si é estável.
  });
  entry.socket = socket;

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
      if (!waJid) continue;
      // status@broadcast = atualização de Status de QUALQUER contato, não uma
      // conversa de verdade — sem esse filtro, todo Status de todo mundo caía
      // misturado num único pseudo-contato. Grupo (@g.us) também não é 1:1,
      // fica de fora até a Fase de campanhas/grupos decidir como tratar.
      if (waJid === "status@broadcast" || waJid.endsWith("@g.us")) continue;

      const content = await extractInboundContent(msg, socket).catch((err) => {
        logger.error({ err }, "falha ao baixar mídia recebida");
        return null;
      });
      if (!content) continue;

      await recordInboundMessage({
        sessionId,
        waJid,
        text: content.text,
        media: content.media,
        waMessageId: msg.key.id ?? undefined,
        pushName: msg.pushName ?? undefined,
        senderPn: msg.key.senderPn ?? undefined,
        socket,
      });
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

  // WhatsApp manda o histórico existente (em blocos) logo depois de parear
  // um número novo, e às vezes um resumo de "o que rolou enquanto eu tava
  // offline" em reconexões. Sem esse listener, o Inbox só teria conversa
  // a partir do momento em que o worker ligou.
  socket.ev.on("messaging-history.set", async ({ messages, contacts, isLatest }) => {
    try {
      await importHistoricalMessages(sessionId, messages, contacts, socket);
    } catch (err) {
      logger.error({ err }, "falha ao importar histórico do WhatsApp");
    }
    if (isLatest) {
      logger.info({ sessionId }, "sincronização de histórico do WhatsApp concluída");
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

type InboundMedia = {
  type: "AUDIO" | "IMAGE" | "DOCUMENT";
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
};

// Detecta o tipo de conteúdo da mensagem e baixa a mídia (já descriptografada
// pelo Baileys) quando aplicável. Mensagem sem texto e sem mídia reconhecida
// (figurinha, localização, enquete etc.) volta null e é ignorada por ora.
async function extractInboundContent(
  msg: proto.IWebMessageInfo,
  socket: ReturnType<typeof makeWASocket>
): Promise<{ text: string; media?: InboundMedia } | null> {
  const m = msg.message;
  if (!m) return null;

  const plainText = m.conversation ?? m.extendedTextMessage?.text ?? "";
  const downloadOpts = { logger, reuploadRequest: socket.updateMediaMessage };

  if (m.audioMessage) {
    const buffer = (await downloadMediaMessage(msg, "buffer", {}, downloadOpts)) as Buffer;
    return {
      text: plainText,
      media: {
        type: "AUDIO",
        buffer,
        mimeType: m.audioMessage.mimetype ?? "audio/ogg",
        durationSeconds: m.audioMessage.seconds ?? undefined,
      },
    };
  }

  if (m.imageMessage) {
    const buffer = (await downloadMediaMessage(msg, "buffer", {}, downloadOpts)) as Buffer;
    return {
      text: m.imageMessage.caption ?? plainText,
      media: { type: "IMAGE", buffer, mimeType: m.imageMessage.mimetype ?? "image/jpeg" },
    };
  }

  if (m.documentMessage) {
    const buffer = (await downloadMediaMessage(msg, "buffer", {}, downloadOpts)) as Buffer;
    return {
      text: m.documentMessage.caption ?? plainText,
      media: {
        type: "DOCUMENT",
        buffer,
        mimeType: m.documentMessage.mimetype ?? "application/octet-stream",
        fileName: m.documentMessage.fileName ?? undefined,
      },
    };
  }

  if (!plainText) return null;
  return { text: plainText };
}

function extensionFromMime(mimeType: string): string {
  const subtype = mimeType.split(";")[0]?.split("/")[1] ?? "bin";
  return `.${subtype.replace("+xml", "")}`;
}

// senderPn/jid do Baileys vêm como JID completo (ex: "5511999999999@s.whatsapp.net")
// — aqui só interessam os dígitos, é o que Contact.phoneNumber guarda.
function phoneDigitsFromJid(jid?: string | null): string | undefined {
  if (!jid) return undefined;
  const digits = jid.split("@")[0]?.replace(/\D/g, "");
  return digits || undefined;
}

async function recordInboundMessage(params: {
  sessionId: string;
  waJid: string;
  text: string;
  media?: InboundMedia;
  waMessageId?: string;
  pushName?: string;
  senderPn?: string;
  socket: ReturnType<typeof makeWASocket>;
}) {
  const session = await prisma.whatsAppSession.findUniqueOrThrow({
    where: { id: params.sessionId },
    select: { tenantId: true },
  });

  const resolvedPhone = params.waJid.endsWith("@lid") ? phoneDigitsFromJid(params.senderPn) : undefined;

  const contact = await prisma.contact.upsert({
    where: { tenantId_waJid: { tenantId: session.tenantId, waJid: params.waJid } },
    create: { tenantId: session.tenantId, waJid: params.waJid, name: params.pushName, phoneNumber: resolvedPhone },
    update: resolvedPhone ? { phoneNumber: resolvedPhone } : {},
  });

  if (!contact.avatarUrl) {
    fetchAndSaveAvatar(params.socket, contact.id, params.waJid).catch(() => {
      // sem foto de perfil ou privacidade bloqueando — segue sem avatar, não é erro
    });
  }

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

  let mediaFields: Partial<{
    mediaType: "AUDIO" | "IMAGE" | "DOCUMENT";
    mediaKey: string;
    mediaMimeType: string;
    mediaFileName: string;
    mediaDurationSeconds: number;
  }> = {};

  if (params.media) {
    if (isStorageConfigured()) {
      const key = `${session.tenantId}/${conversation.id}/${randomUUID()}${extensionFromMime(params.media.mimeType)}`;
      await uploadMedia(key, params.media.buffer, params.media.mimeType);
      mediaFields = {
        mediaType: params.media.type,
        mediaKey: key,
        mediaMimeType: params.media.mimeType,
        mediaFileName: params.media.fileName,
        mediaDurationSeconds: params.media.durationSeconds,
      };
    } else {
      logger.warn("mídia recebida mas R2 não está configurado (.env) — só a legenda/texto foi salva");
    }
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      sessionId: params.sessionId,
      direction: "INBOUND",
      status: "DELIVERED",
      body: params.text,
      waMessageId: params.waMessageId,
      ...mediaFields,
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

// Importa o histórico que o WhatsApp manda ao parear/reconectar. Fase 0: só
// texto/legenda — baixar mídia de centenas de mensagens antigas de uma vez
// pesaria demais no R2 e na API do WhatsApp, então mídia histórica entra
// como um placeholder ("[imagem]" etc.) em vez do arquivo de verdade.
// Conversa importada nasce RESOLVED (é histórico, não fila de atendimento);
// volta pra Ativos sozinha assim que o cliente manda mensagem nova de verdade.
async function importHistoricalMessages(
  sessionId: string,
  messages: proto.IWebMessageInfo[],
  historyContacts:
    | Array<{ id?: string | null; lid?: string | null; jid?: string | null; name?: string | null; notify?: string | null }>
    | undefined,
  socket: ReturnType<typeof makeWASocket>
) {
  const session = await prisma.whatsAppSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { tenantId: true },
  });

  // WhatsApp manda o nome salvo/pushName num payload separado das mensagens
  // — sem isso o contato fica só com o JID (o bug que apareceu no primeiro
  // teste de importação).
  const nameByJid = new Map<string, string>();
  // @lid é opaco por padrão — quando o WhatsApp revela o par lid/jid (aqui)
  // ou o senderPn de uma mensagem (abaixo), guarda o telefone real pra exibir.
  const phoneByJid = new Map<string, string>();
  for (const c of historyContacts ?? []) {
    const name = c.name || c.notify;
    if (c.id && name) nameByJid.set(c.id, name);
    if (c.lid && c.jid) {
      const digits = phoneDigitsFromJid(c.jid);
      if (digits) phoneByJid.set(c.lid, digits);
    }
  }

  const candidates = messages.filter((msg) => {
    const jid = msg.key.remoteJid;
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return false;
    return !!msg.message && !!msg.key.id;
  });
  if (candidates.length === 0) return;

  // Fallback pro nome: quando não veio no payload de contatos, cada mensagem
  // recebida carrega o pushName de quem mandou. senderPn faz o mesmo papel
  // pro telefone real quando o remoteJid é @lid.
  for (const msg of candidates) {
    const jid = msg.key.remoteJid!;
    if (!msg.key.fromMe && msg.pushName && !nameByJid.has(jid)) {
      nameByJid.set(jid, msg.pushName);
    }
    if (jid.endsWith("@lid") && !phoneByJid.has(jid)) {
      // proto.IMessageKey (tipo cru do histórico) não declara senderPn, mas o
      // Baileys populada em runtime igual faz no WAMessageKey de mensagens ao vivo.
      const senderPn = (msg.key as { senderPn?: string }).senderPn;
      const digits = phoneDigitsFromJid(senderPn);
      if (digits) phoneByJid.set(jid, digits);
    }
  }

  const existing = await prisma.message.findMany({
    where: { sessionId, waMessageId: { in: candidates.map((m) => m.key.id as string) } },
    select: { waMessageId: true },
  });
  const existingIds = new Set(existing.map((m) => m.waMessageId));
  const fresh = candidates.filter((m) => !existingIds.has(m.key.id ?? null));
  if (fresh.length === 0) return;

  logger.info({ count: fresh.length }, "importando histórico de mensagens do WhatsApp");

  const conversationByJid = new Map<string, { id: string }>();

  for (const msg of fresh) {
    const waJid = msg.key.remoteJid!;
    if (conversationByJid.has(waJid)) continue;

    const resolvedName = nameByJid.get(waJid);
    const resolvedPhone = phoneByJid.get(waJid);
    const contact = await prisma.contact.upsert({
      where: { tenantId_waJid: { tenantId: session.tenantId, waJid } },
      create: { tenantId: session.tenantId, waJid, name: resolvedName, phoneNumber: resolvedPhone },
      update: {},
    });
    if (!contact.name && resolvedName) {
      await prisma.contact.update({ where: { id: contact.id }, data: { name: resolvedName } });
    }
    if (!contact.phoneNumber && resolvedPhone) {
      await prisma.contact.update({ where: { id: contact.id }, data: { phoneNumber: resolvedPhone } });
    }
    if (!contact.avatarUrl) {
      fetchAndSaveAvatar(socket, contact.id, waJid).catch(() => {});
    }

    const existingConv = await prisma.conversation.findFirst({
      where: { tenantId: session.tenantId, contactId: contact.id, sessionId },
      select: { id: true },
    });
    const conversation =
      existingConv ??
      (await prisma.conversation.create({
        // lastMessageAt nasce no passado de propósito (schema default seria
        // "agora") — senão o updateMany de baixo, que só sobe a data se for
        // mais recente, nunca dispara pra mensagem de histórico (sempre no
        // passado em relação ao momento do import).
        data: {
          tenantId: session.tenantId,
          sessionId,
          contactId: contact.id,
          status: "RESOLVED",
          lastMessageAt: new Date(0),
        },
      }));
    conversationByJid.set(waJid, conversation);
  }

  const rows = fresh.map((msg) => {
    const waJid = msg.key.remoteJid!;
    const timestamp = msg.messageTimestamp ? new Date(Number(msg.messageTimestamp) * 1000) : new Date();
    return {
      conversationId: conversationByJid.get(waJid)!.id,
      sessionId,
      direction: msg.key.fromMe ? ("OUTBOUND" as const) : ("INBOUND" as const),
      status: (msg.key.fromMe ? "SENT" : "DELIVERED") as "SENT" | "DELIVERED",
      body: extractHistoricalText(msg),
      waMessageId: msg.key.id as string,
      createdAt: timestamp,
      readAt: timestamp, // histórico entra como já lido, não é mensagem nova
    };
  });

  await prisma.message.createMany({ data: rows, skipDuplicates: true });

  const latestByJid = new Map<string, number>();
  for (const msg of fresh) {
    const waJid = msg.key.remoteJid!;
    const ts = Number(msg.messageTimestamp ?? 0);
    if (ts > (latestByJid.get(waJid) ?? 0)) latestByJid.set(waJid, ts);
  }
  for (const [waJid, ts] of latestByJid) {
    const conversation = conversationByJid.get(waJid)!;
    await prisma.conversation.updateMany({
      where: { id: conversation.id, lastMessageAt: { lt: new Date(ts * 1000) } },
      data: { lastMessageAt: new Date(ts * 1000) },
    });
  }
}

function extractHistoricalText(msg: proto.IWebMessageInfo): string {
  const m = msg.message;
  if (!m) return "";
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage) return m.imageMessage.caption || "[imagem]";
  if (m.audioMessage) return "[áudio]";
  if (m.videoMessage) return m.videoMessage.caption || "[vídeo]";
  if (m.stickerMessage) return "[figurinha]";
  if (m.documentMessage) return m.documentMessage.caption || `[arquivo: ${m.documentMessage.fileName ?? "sem nome"}]`;
  return "";
}

// Busca a foto de perfil só na primeira mensagem de um contato (evita bater
// na API do WhatsApp toda hora) — falha normalmente quando a pessoa não tem
// foto pública ou a privacidade bloqueia, e isso não deve derrubar nada.
async function fetchAndSaveAvatar(
  socket: ReturnType<typeof makeWASocket>,
  contactId: string,
  waJid: string
) {
  const url = await socket.profilePictureUrl(waJid, "image");
  if (!url) return;
  await prisma.contact.update({ where: { id: contactId }, data: { avatarUrl: url } });
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

// Baixa a mídia do R2 e manda pro WhatsApp no formato certo pro tipo. Áudio
// sempre como nota de voz (ptt) — é o formato que casa com o player estilo
// WhatsApp que a gente mostra no inbox.
async function sendOutboundMedia(
  socket: ReturnType<typeof makeWASocket>,
  jid: string,
  message: {
    mediaType: string | null;
    mediaKey: string | null;
    mediaMimeType: string | null;
    mediaFileName: string | null;
    body: string;
  }
) {
  if (!message.mediaKey) throw new Error("mensagem marcada como mídia mas sem mediaKey");
  const buffer = await downloadMedia(message.mediaKey);
  const mimetype = message.mediaMimeType ?? undefined;

  if (message.mediaType === "AUDIO") {
    return socket.sendMessage(jid, { audio: buffer, mimetype: mimetype ?? "audio/ogg; codecs=opus", ptt: true });
  }
  if (message.mediaType === "IMAGE") {
    return socket.sendMessage(jid, { image: buffer, mimetype, caption: message.body || undefined });
  }
  return socket.sendMessage(jid, {
    document: buffer,
    mimetype: mimetype ?? "application/octet-stream",
    fileName: message.mediaFileName ?? "arquivo",
    caption: message.body || undefined,
  });
}

// Fase 0 mantém a fila simples de propósito: sem Redis/BullMQ ainda, o
// worker só varre mensagens PENDING da própria sessão a cada 2s. Isso já
// resolve o caso de uso (1 atendente respondendo), e a fila de verdade com
// throttling anti-ban entra na fase de Campanhas.
function pollOutbox(sessionId: string, socket: ReturnType<typeof makeWASocket>, isStopped: () => boolean) {
  const tick = async () => {
    if (isStopped()) return;

    // Try/finally garante que o polling continua mesmo se o Postgres soltar
    // a conexão no meio (comum em provedores serverless tipo Neon depois de
    // ociosidade) — sem isso, um erro aqui parava a fila pra sempre sem
    // avisar ninguém, e derrubava o processo do worker inteiro.
    try {
      const pending = await prisma.message.findMany({
        where: { sessionId, direction: "OUTBOUND", status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 5,
        include: { conversation: { include: { contact: true } }, sender: { select: { name: true } } },
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
          const jid = message.conversation.contact.waJid;
          // Vários atendentes dividem o mesmo número — sem isso o cliente não
          // sabe quem está falando. *negrito* é sintaxe nativa do WhatsApp.
          // Áudio não tem legenda, então o prefixo nele é ignorado mesmo.
          const displayBody = message.sender
            ? message.body
              ? `*${message.sender.name}:* ${message.body}`
              : `*${message.sender.name}*`
            : message.body;
          const messageForSend = { ...message, body: displayBody };

          const sent = message.mediaType && message.mediaKey
            ? await sendOutboundMedia(socket, jid, messageForSend)
            : await socket.sendMessage(jid, { text: displayBody });

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
    } catch (err) {
      logger.error({ err, sessionId }, "falha ao processar fila de saída");
    } finally {
      setTimeout(tick, OUTBOX_POLL_INTERVAL_MS);
    }
  };

  tick();
}

/** Sobe conexões para sessões que ainda não estão ativas nesta instância. */
export async function syncSessions() {
  try {
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
  } catch (err) {
    // Ex: Postgres soltou a conexão por ociosidade — tenta de novo no
    // próximo tick em vez de derrubar o worker inteiro (unhandled rejection).
    logger.error({ err }, "falha ao verificar sessões");
  }
}

export function watchForNewSessions() {
  setInterval(() => {
    syncSessions();
  }, NEW_SESSION_POLL_INTERVAL_MS);
}
