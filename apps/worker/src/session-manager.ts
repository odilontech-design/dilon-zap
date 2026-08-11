import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
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
import { dentroDoHorario, type DiaDeAtendimento } from "./business-hours";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

// Uma entrada por sessão ativa nesta instância do worker. Evita abrir duas
// conexões Baileys pro mesmo número se o loop de polling rodar de novo antes
// da conexão anterior terminar de subir. Guarda o socket + tenantId também,
// pra dar pro servidor HTTP interno resolver JID (ver http-server.ts).
type ActiveSession = {
  stop: () => void;
  socket: ReturnType<typeof makeWASocket> | null;
  tenantId: string;
  /** Tira a fila de saída do ritmo ocioso — chamado quando o web enfileira algo. */
  wakeOutbox?: () => void;
};
const activeSessions = new Map<string, ActiveSession>();

// A fila de saída é consultada em ritmo adaptativo: 1s logo depois de mandar
// alguma coisa (rajada de mensagens do atendente sai sem atraso perceptível),
// e vai afrouxando até 5s quando não há nada pendente. Em ritmo fixo de 1s
// eram 86.400 consultas por dia por sessão mesmo com a fila vazia — puro
// tráfego e carga de banco à toa, 24h por dia.
const OUTBOX_POLL_MIN_MS = 1_000;
const OUTBOX_POLL_MAX_MS = 5_000;

// Intervalo mínimo entre dois avisos de ausência na MESMA conversa. 6h cobre
// uma madrugada inteira: o cliente que escreve 23h, 23h05 e 01h leva um aviso
// só, e quem volta na tarde seguinte (ainda fora do horário) recebe de novo,
// porque aí já é outro contato e o silêncio pareceria descaso.
const AUSENCIA_INTERVALO_MS = 6 * 60 * 60 * 1000;
const NEW_SESSION_POLL_INTERVAL_MS = 5_000;
const RETRY_WINDOW_MS = 60_000; // quanto tempo tenta de novo sozinho antes de marcar FAILED de vez

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

/** Edita o texto de uma mensagem já enviada — WhatsApp só deixa editar mensagem própria (fromMe). */
export async function editOutboundMessage(
  tenantId: string,
  waJid: string,
  waMessageId: string,
  newText: string
): Promise<{ ok: boolean; reason?: string }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "sem conexão ativa" };

  await socket.sendMessage(waJid, { text: newText, edit: { remoteJid: waJid, id: waMessageId, fromMe: true } });
  return { ok: true };
}

/** Revoga (apaga pra todos) uma mensagem já enviada. */
export async function deleteOutboundMessage(
  tenantId: string,
  waJid: string,
  waMessageId: string
): Promise<{ ok: boolean; reason?: string }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "sem conexão ativa" };

  await socket.sendMessage(waJid, { delete: { remoteJid: waJid, id: waMessageId, fromMe: true } });
  return { ok: true };
}

/**
 * Reage (ou remove a reação) numa mensagem — nossa ou do contato.
 * `targetFromMe` é a identidade de QUEM MANDOU a mensagem alvo (não de quem
 * está reagindo — reagir é sempre "nós"): o WhatsApp exige isso pra localizar
 * a mensagem certa. emoji vazio remove a reação, igual ao app oficial.
 */
export async function reactToMessage(
  tenantId: string,
  waJid: string,
  targetWaMessageId: string,
  targetFromMe: boolean,
  emoji: string
): Promise<{ ok: boolean; reason?: string }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "sem conexão ativa" };

  await socket.sendMessage(waJid, {
    react: { text: emoji, key: { remoteJid: waJid, id: targetWaMessageId, fromMe: targetFromMe } },
  });
  return { ok: true };
}

export async function startSession(sessionId: string) {
  if (activeSessions.has(sessionId)) return;

  // Reserva a vaga ANTES de qualquer await — guard-check + set precisam ser
  // atômicos (sem await entre os dois), senão duas chamadas concorrentes
  // (syncSessions a cada 5s + o retry de 3s daqui embaixo, por exemplo)
  // podem passar pelo `has()` juntas e a que terminar depois sobrescreve a
  // entrada da que terminou antes — aí o catch de baixo apaga do mapa a
  // sessão saudável (com socket de verdade rodando) em vez da que falhou,
  // e tanto pollOutbox quanto getSocketForTenant ficam "cegos" pra uma
  // conexão que continua viva, podendo até duplicar envio de mensagem.
  let stopped = false;
  const entry: ActiveSession = { stop: () => (stopped = true), socket: null, tenantId: "" };
  activeSessions.set(sessionId, entry);

  let socket: ReturnType<typeof makeWASocket>;
  try {
    const sessionRow = await prisma.whatsAppSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { tenantId: true },
    });
    entry.tenantId = sessionRow.tenantId;

    const { state, saveCreds } = await usePostgresAuthState(sessionId);
    const { version } = await fetchLatestBaileysVersion();

    socket = makeWASocket({
      version,
      // Sem esse cache, toda leitura/escrita de chave de sessão bate direto
      // no Postgres — sob volume alto (vários atendentes mandando mensagem
      // ao mesmo tempo), isso alarga a janela de corrida entre operações
      // concorrentes de criptografia e pode corromper o estado da sessão do
      // Signal Protocol (erros "Bad MAC" / "No matching sessions found").
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
      logger,
      printQRInTerminal: false,
      // Pede o histórico mais completo que o WhatsApp aceitar mandar no
      // pareamento — só faz efeito num QR novo, não numa sessão já pareada.
      syncFullHistory: true,
      // Fase 0: um número por tenant, throttling de disparo em massa entra na
      // fase de Campanhas — aqui só garantimos que a conexão em si é estável.
    });
    socket.ev.on("creds.update", saveCreds);
  } catch (err) {
    // Sem isso, uma falha transitória bem aqui (ex: Neon derrubou a conexão
    // por ociosidade nesse instante — já aconteceu antes neste projeto)
    // deixava a sessão "zumbi": marcada como ativa em activeSessions pra
    // sempre, sem socket de verdade e sem nunca chegar no pollOutbox, e
    // syncSessions() nunca mais tentava de novo — só reiniciando o worker
    // inteiro destravava. Agora tenta de novo sozinho em 3s, igual reconexão normal.
    activeSessions.delete(sessionId);
    logger.error({ err, sessionId }, "falha ao iniciar sessão — tentando de novo em 3s");
    if (!stopped) setTimeout(() => startSession(sessionId), 3_000);
    return;
  }
  entry.socket = socket;

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
      const waJid = msg.key.remoteJid;
      if (!waJid) continue;
      // status@broadcast = atualização de Status de QUALQUER contato, não uma
      // conversa de verdade — remoteJid é sempre esse valor fixo, quem postou
      // é msg.key.participant (mesmo padrão de mensagem de grupo). Só marca
      // lastStatusAt em contato que JÁ existe (updateMany não cria) — Status
      // de gente que nunca conversou com o número não deveria virar contato.
      if (waJid === "status@broadcast") {
        const posterJid = msg.key.participant;
        if (posterJid && !msg.key.fromMe) {
          await prisma.contact
            .updateMany({
              where: { tenantId: entry.tenantId, waJid: posterJid },
              data: { lastStatusAt: new Date() },
            })
            .catch((err) => logger.error({ err }, "falha ao marcar status do contato"));
        }
        continue;
      }
      // Grupo (@g.us) também não é 1:1, fica de fora até a Fase de
      // campanhas/grupos decidir como tratar.
      if (waJid.endsWith("@g.us")) continue;

      const content = await extractInboundContent(msg, socket).catch((err) => {
        logger.error({ err }, "falha ao processar mensagem");
        return null;
      });
      if (!content) continue;

      // fromMe aqui não é "mandada pelo nosso outbox" (essa nunca passa por
      // aqui, o worker já sabe que mandou) — é uma mensagem enviada direto
      // do celular, fora do Inbox. Sem tratar isso, o histórico ficava sem
      // as respostas dadas fora do sistema.
      //
      // .catch em vez de deixar propagar: um erro aqui (ex: Postgres soltou
      // a conexão bem nessa hora) não pode derrubar o resto do lote — sem
      // isso, uma mensagem problemática fazia o for parar e todo o resto das
      // mensagens desse evento (podem ser várias) ficava sem ser gravado.
      await recordMessage({
        sessionId,
        waJid,
        direction: msg.key.fromMe ? "OUTBOUND" : "INBOUND",
        text: content.text,
        media: content.media,
        waMessageId: msg.key.id ?? undefined,
        pushName: msg.pushName ?? undefined,
        senderPn: msg.key.senderPn ?? undefined,
        quotedWaMessageId: content.quotedWaMessageId,
        socket,
      }).catch((err) => logger.error({ err, waMessageId: msg.key.id }, "falha ao registrar mensagem"));
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

  // Reação (emoji) numa mensagem — tanto a do contato quanto o eco de uma
  // reação que nós mesmos mandamos (pelo Inbox ou direto do celular). Só
  // existem duas identidades possíveis num chat 1:1: fromMe true (nós) ou
  // false (contato) — ver comentário do model MessageReaction no schema.
  socket.ev.on("messages.reaction", async (reactionEvents) => {
    for (const { key, reaction } of reactionEvents) {
      if (!key.id) continue;
      const fromMe = !!reaction.key?.fromMe;
      const emoji = reaction.text ?? "";

      const message = await prisma.message
        .findFirst({ where: { sessionId, waMessageId: key.id }, select: { id: true } })
        .catch(() => null);
      if (!message) continue;

      if (!emoji) {
        await prisma.messageReaction
          .deleteMany({ where: { messageId: message.id, fromMe } })
          .catch((err) => logger.error({ err }, "falha ao remover reação"));
        continue;
      }

      // update só troca o emoji, nunca reactorUserId — se essa reação já foi
      // registrada pela API (reação mandada pelo Inbox), isso aqui é só o eco
      // da confirmação do WhatsApp chegando depois, e não pode apagar a
      // autoria que a API já gravou.
      await prisma.messageReaction
        .upsert({
          where: { messageId_fromMe: { messageId: message.id, fromMe } },
          create: { messageId: message.id, fromMe, emoji },
          update: { emoji },
        })
        .catch((err) => logger.error({ err }, "falha ao gravar reação"));
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
  type: "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO";
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  durationSeconds?: number;
};

// contextInfo (onde mora a citação, quando a mensagem é uma resposta a outra)
// vem aninhado dentro do tipo específico da mensagem, não solto no nível de
// cima — cada branch tem seu próprio campo.
function getQuotedWaMessageId(m: proto.IMessage): string | undefined {
  const contextInfo =
    m.extendedTextMessage?.contextInfo ??
    m.imageMessage?.contextInfo ??
    m.videoMessage?.contextInfo ??
    m.audioMessage?.contextInfo ??
    m.documentMessage?.contextInfo;
  return contextInfo?.stanzaId ?? undefined;
}

// Detecta o tipo de conteúdo da mensagem e baixa a mídia (já descriptografada
// pelo Baileys) quando aplicável. Mensagem sem texto e sem mídia reconhecida
// (figurinha, localização, enquete etc.) volta null e é ignorada por ora.
async function extractInboundContent(
  msg: proto.IWebMessageInfo,
  socket: ReturnType<typeof makeWASocket>
): Promise<{ text: string; media?: InboundMedia; quotedWaMessageId?: string } | null> {
  const m = msg.message;
  if (!m) return null;

  const plainText = m.conversation ?? m.extendedTextMessage?.text ?? "";
  const quotedWaMessageId = getQuotedWaMessageId(m);
  const downloadOpts = { logger, reuploadRequest: socket.updateMediaMessage };

  if (m.audioMessage) {
    const buffer = (await downloadMediaMessage(msg, "buffer", {}, downloadOpts)) as Buffer;
    return {
      text: plainText,
      quotedWaMessageId,
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
      quotedWaMessageId,
      media: { type: "IMAGE", buffer, mimeType: m.imageMessage.mimetype ?? "image/jpeg" },
    };
  }

  if (m.videoMessage) {
    const buffer = (await downloadMediaMessage(msg, "buffer", {}, downloadOpts)) as Buffer;
    return {
      text: m.videoMessage.caption ?? plainText,
      quotedWaMessageId,
      media: {
        type: "VIDEO",
        buffer,
        mimeType: m.videoMessage.mimetype ?? "video/mp4",
        durationSeconds: m.videoMessage.seconds ?? undefined,
      },
    };
  }

  if (m.documentMessage) {
    const buffer = (await downloadMediaMessage(msg, "buffer", {}, downloadOpts)) as Buffer;
    return {
      text: m.documentMessage.caption ?? plainText,
      quotedWaMessageId,
      media: {
        type: "DOCUMENT",
        buffer,
        mimeType: m.documentMessage.mimetype ?? "application/octet-stream",
        fileName: m.documentMessage.fileName ?? undefined,
      },
    };
  }

  if (!plainText) return null;
  return { text: plainText, quotedWaMessageId };
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

// Acha (ou cria) o contato certo pro JID que chegou nessa mensagem —
// reconciliando com um contato JÁ EXISTENTE do MESMO telefone real, mesmo
// que o JID literal seja diferente. Sem isso, o rollout de privacidade de
// número do WhatsApp (a mesma pessoa passa a aparecer como @lid em vez do
// @s.whatsapp.net de antes, ou vice-versa) cria um Contact/Conversation
// NOVO do zero pra alguém que já tinha atendimento em andamento — a
// conversa "duplica" (na prática, vira duas conversas separadas pra
// mesma pessoa, cada resposta dela caindo ora numa ora noutra).
async function resolveContact(params: {
  tenantId: string;
  waJid: string;
  contactName?: string;
  resolvedPhone?: string; // só quando waJid é @lid e o senderPn resolveu o telefone
  socket?: ReturnType<typeof makeWASocket>; // habilita o fallback por foto de perfil, ver abaixo
}) {
  const phoneDigits = params.waJid.endsWith("@s.whatsapp.net")
    ? params.waJid.replace("@s.whatsapp.net", "")
    : params.resolvedPhone;

  if (phoneDigits) {
    const other = await prisma.contact.findFirst({
      where: {
        tenantId: params.tenantId,
        waJid: { not: params.waJid },
        OR: [{ waJid: `${phoneDigits}@s.whatsapp.net` }, { phoneNumber: phoneDigits }],
      },
    });
    if (other) {
      const updateData: { name?: string; phoneNumber?: string } = {};
      if (params.contactName && !other.name) updateData.name = params.contactName;
      if (!other.phoneNumber) updateData.phoneNumber = phoneDigits;
      return Object.keys(updateData).length > 0
        ? prisma.contact.update({ where: { id: other.id }, data: updateData })
        : other;
    }
  }

  // Sem telefone resolvido (o proto do Baileys instalado não expõe senderPn
  // por mensagem — resolvedPhone só vem de fato do histórico) e é um @lid
  // que ainda não existe: antes de criar um contato novo, tenta casar pela
  // FOTO DE PERFIL (mesmo arquivo no CDN da Meta, ignorando os parâmetros de
  // assinatura da URL que mudam a cada request) com outro contato já
  // existente desse tenant. Cobre o caso real que causou a duplicata da
  // Isabella Virginio: WhatsApp trocou o @lid dela e a mensagem nova chegou
  // sem nenhum jeito de ligar ao telefone já conhecido.
  if (!phoneDigits && params.waJid.endsWith("@lid") && params.socket) {
    const existsByJid = await prisma.contact.findUnique({
      where: { tenantId_waJid: { tenantId: params.tenantId, waJid: params.waJid } },
      select: { id: true },
    });
    if (!existsByJid) {
      const photoId = await fetchAvatarPhotoId(params.socket, params.waJid);
      if (photoId) {
        const candidates = await prisma.contact.findMany({
          where: { tenantId: params.tenantId, waJid: { not: params.waJid }, avatarUrl: { not: null } },
          select: { id: true, avatarUrl: true, name: true },
        });
        const match = candidates.find((c) => avatarPhotoId(c.avatarUrl!) === photoId);
        if (match) {
          // Atualiza o waJid pro valor novo — daqui pra frente essa pessoa
          // resolve direto pelo caminho rápido (upsert por waJid literal),
          // sem precisar buscar a foto de novo a cada mensagem.
          return prisma.contact.update({
            where: { id: match.id },
            data: { waJid: params.waJid, name: match.name ?? params.contactName },
          });
        }
      }
    }
  }

  return prisma.contact.upsert({
    where: { tenantId_waJid: { tenantId: params.tenantId, waJid: params.waJid } },
    create: { tenantId: params.tenantId, waJid: params.waJid, name: params.contactName, phoneNumber: phoneDigits && params.waJid.endsWith("@lid") ? phoneDigits : undefined },
    update: phoneDigits && params.waJid.endsWith("@lid") ? { phoneNumber: phoneDigits } : {},
  });
}

// Parte estável de uma URL de foto de perfil do WhatsApp (o nome do arquivo
// no CDN da Meta) — ignora ?ccb=/oh=/oe=/... que mudam a cada request mas
// apontam pro mesmo arquivo. Duas URLs com esse mesmo trecho são a mesma foto.
function avatarPhotoId(url: string): string | null {
  try {
    return new URL(url).pathname.split("/").pop() || null;
  } catch {
    return null;
  }
}

async function fetchAvatarPhotoId(
  socket: ReturnType<typeof makeWASocket>,
  waJid: string
): Promise<string | null> {
  try {
    const url = await socket.profilePictureUrl(waJid, "image");
    return url ? avatarPhotoId(url) : null;
  } catch {
    return null; // sem foto ou privacidade bloqueando — segue sem esse sinal, não é erro
  }
}

async function recordMessage(params: {
  sessionId: string;
  waJid: string;
  direction: "INBOUND" | "OUTBOUND";
  text: string;
  media?: InboundMedia;
  waMessageId?: string;
  pushName?: string;
  senderPn?: string;
  quotedWaMessageId?: string;
  socket: ReturnType<typeof makeWASocket>;
}) {
  const isInbound = params.direction === "INBOUND";

  const session = await prisma.whatsAppSession.findUniqueOrThrow({
    where: { id: params.sessionId },
    select: { tenantId: true },
  });
  const resolvedPhone = params.waJid.endsWith("@lid") ? phoneDigitsFromJid(params.senderPn) : undefined;
  // pushName só identifica quem MANDOU a mensagem — numa mensagem OUTBOUND
  // (mandada do próprio celular, fora do Inbox) isso seria o nome do próprio
  // negócio, não do contato, então não pode virar o nome do contato.
  const contactName = isInbound ? params.pushName : undefined;

  const contact = await resolveContact({
    tenantId: session.tenantId,
    waJid: params.waJid,
    contactName,
    resolvedPhone,
    socket: params.socket,
  });

  if (!contact.avatarUrl) {
    fetchAndSaveAvatar(params.socket, contact.id, params.waJid).catch(() => {
      // sem foto de perfil ou privacidade bloqueando — segue sem avatar, não é erro
    });
  }

  // upsert (não find-then-create) é essencial aqui: duas mensagens chegando
  // quase juntas (poucos ms de diferença, cada uma num evento messages.upsert
  // separado que o Baileys não serializa) disparavam dois recordMessage()
  // concorrentes — nenhum via o create do outro a tempo, e cada um criava
  // sua própria Conversation pro mesmo contato. upsert é uma operação atômica
  // no Postgres (INSERT ... ON CONFLICT), não tem essa janela de corrida.
  //
  // Mensagem OUTBOUND vinda do celular (fora do Inbox) só atualiza a data —
  // não força status "OPEN" como faz uma mensagem nova do cliente, porque
  // não é uma demanda nova que precisa de atendimento.
  const conversation = await prisma.conversation.upsert({
    where: { contactId_sessionId: { contactId: contact.id, sessionId: params.sessionId } },
    update: isInbound ? { lastMessageAt: new Date(), status: "OPEN" } : { lastMessageAt: new Date() },
    create: {
      tenantId: session.tenantId,
      sessionId: params.sessionId,
      contactId: contact.id,
      lastMessageAt: new Date(),
      status: isInbound ? "OPEN" : "RESOLVED",
    },
  });

  // Pré-checagem barata (só otimização, não a garantia de atomicidade — essa
  // vem do upsert lá embaixo): evita baixar/reenviar mídia à toa quando é um
  // reenvio óbvio (mensagem OUTBOUND mandada pelo próprio Inbox já foi
  // gravada por /api/messages/send, e o Baileys também reemite messages.upsert
  // pra mensagens INBOUND já vistas em alguns casos, ex: replay num reconnect).
  if (params.waMessageId) {
    const existing = await prisma.message.findFirst({
      where: { conversationId: conversation.id, waMessageId: params.waMessageId },
      select: { id: true },
    });
    if (existing) return;
  }

  let mediaFields: Partial<{
    mediaType: "AUDIO" | "IMAGE" | "DOCUMENT" | "VIDEO";
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

  // Citação só existe dentro da mesma conversa — se não achar (ex: citou
  // mensagem de antes da gente rastrear, ou o stanzaId não bate por algum
  // motivo), segue sem quote em vez de falhar a mensagem inteira.
  const quotedMessage = params.quotedWaMessageId
    ? await prisma.message.findFirst({
        where: { conversationId: conversation.id, waMessageId: params.quotedWaMessageId },
        select: { id: true },
      })
    : null;

  const messageData = {
    conversationId: conversation.id,
    sessionId: params.sessionId,
    direction: params.direction,
    status: isInbound ? ("DELIVERED" as const) : ("SENT" as const),
    body: params.text,
    waMessageId: params.waMessageId,
    quotedMessageId: quotedMessage?.id,
    ...mediaFields,
  };

  // upsert (não create) fecha a mesma janela de corrida da Conversation: se
  // duas cópias da mesma mensagem passarem pela pré-checagem acima quase
  // juntas (nenhuma via o create da outra a tempo), o upsert garante que só
  // uma linha existe no fim — update vazio de propósito, a segunda cópia não
  // deve sobrescrever nada da primeira.
  if (params.waMessageId) {
    await prisma.message.upsert({
      where: { conversationId_waMessageId: { conversationId: conversation.id, waMessageId: params.waMessageId } },
      create: messageData,
      update: {},
    });
  } else {
    await prisma.message.create({ data: messageData });
  }

  if (isInbound && !conversation.assignedToId) {
    const atendimento = await carregarAtendimento(session.tenantId);
    await maybeAutoReply({
      tenantId: session.tenantId,
      sessionId: params.sessionId,
      conversationId: conversation.id,
      inboundText: params.text,
      foraDoHorario: !dentroDoHorario(atendimento.dias, atendimento.timezone),
      mensagemAusencia: atendimento.outOfHoursMessage,
      ausenciaAvisadaEm: conversation.outOfHoursNotifiedAt,
    });
  }
}

// Horário e mensagem de ausência mudam raramente e são lidos a cada mensagem
// recebida — sem cache, cada mensagem viraria duas consultas a mais num
// Postgres de 1 vCPU. 60s é curto o bastante pra mudança na tela valer quase
// na hora e longo o bastante pra tirar o peso do caminho quente.
const CACHE_ATENDIMENTO_MS = 60_000;
const cacheAtendimento = new Map<
  string,
  { em: number; dados: { timezone: string; outOfHoursMessage: string | null; dias: DiaDeAtendimento[] } }
>();

async function carregarAtendimento(tenantId: string) {
  const guardado = cacheAtendimento.get(tenantId);
  if (guardado && Date.now() - guardado.em < CACHE_ATENDIMENTO_MS) return guardado.dados;

  const [tenant, dias] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { timezone: true, outOfHoursMessage: true },
    }),
    prisma.businessHour.findMany({
      where: { tenantId },
      select: { weekday: true, isOpen: true, opensAt: true, closesAt: true },
    }),
  ]);

  const dados = { timezone: tenant.timezone, outOfHoursMessage: tenant.outOfHoursMessage, dias };
  cacheAtendimento.set(tenantId, { em: Date.now(), dados });
  return dados;
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
    const contact = await resolveContact({
      tenantId: session.tenantId,
      waJid,
      contactName: resolvedName,
      resolvedPhone,
      socket,
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

    // upsert (não find-then-create) — mesmo motivo do recordMessage(): evita
    // criar duas conversas pro mesmo contato se o histórico de mais de um
    // chat importar em paralelo. update vazio de propósito: se a conversa já
    // existe, usa como está, sem mexer em nada.
    const conversation = await prisma.conversation.upsert({
      where: { contactId_sessionId: { contactId: contact.id, sessionId } },
      update: {},
      create: {
        // lastMessageAt nasce no passado de propósito (schema default seria
        // "agora") — senão o updateMany de baixo, que só sobe a data se for
        // mais recente, nunca dispara pra mensagem de histórico (sempre no
        // passado em relação ao momento do import).
        tenantId: session.tenantId,
        sessionId,
        contactId: contact.id,
        status: "RESOLVED",
        lastMessageAt: new Date(0),
      },
    });
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
// Uma mensagem recebida gera NO MÁXIMO uma resposta automática. Por isso
// ausência e resposta padrão são decididas aqui juntas, e não em automações
// separadas: separadas, um cliente escrevendo às 22h levaria a resposta da
// palavra-chave E o aviso de que estamos fechados, duas mensagens seguidas do
// nada.
//
// Ordem: palavra-chave ganha sempre (é específica e útil a qualquer hora);
// fora do horário, o aviso de ausência ocupa o lugar da resposta padrão; e se
// a empresa não configurou ausência, tudo se comporta como antes.
async function maybeAutoReply(params: {
  tenantId: string;
  sessionId: string;
  conversationId: string;
  inboundText: string;
  foraDoHorario: boolean;
  mensagemAusencia: string | null;
  ausenciaAvisadaEm: Date | null;
}) {
  const rules = await prisma.autoReply.findMany({ where: { tenantId: params.tenantId } });

  const lowerText = params.inboundText.toLowerCase();
  const porPalavraChave = rules.find(
    (r) => !r.isDefault && r.keyword && lowerText.includes(r.keyword.toLowerCase())
  );

  const ausenciaLigada = params.foraDoHorario && Boolean(params.mensagemAusencia);
  // Trava anti-spam: cliente que manda cinco mensagens de madrugada recebe UM
  // aviso, não cinco. Sem isso a automação vira motivo de reclamação.
  const jaAvisou =
    params.ausenciaAvisadaEm != null &&
    Date.now() - params.ausenciaAvisadaEm.getTime() < AUSENCIA_INTERVALO_MS;

  let texto: string | null = null;
  let marcarAusencia = false;

  if (porPalavraChave) {
    texto = porPalavraChave.response;
  } else if (ausenciaLigada) {
    if (jaAvisou) return; // já avisamos há pouco — fica quieto de propósito
    texto = params.mensagemAusencia;
    marcarAusencia = true;
  } else {
    texto = rules.find((r) => r.isDefault)?.response ?? null;
  }

  if (!texto) return;

  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      sessionId: params.sessionId,
      direction: "OUTBOUND",
      status: "PENDING",
      body: texto,
    },
  });

  if (marcarAusencia) {
    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { outOfHoursNotifiedAt: new Date() },
    });
  }

  // Auto-resposta é justamente o caso em que a fila pode estar no ritmo mais
  // lento (ninguém enviando nada há um tempo) — sem isso, a resposta
  // automática sairia com alguns segundos de atraso à toa.
  wakeOutboxForTenant(params.tenantId);
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
  },
  options?: Parameters<ReturnType<typeof makeWASocket>["sendMessage"]>[2]
) {
  if (!message.mediaKey) throw new Error("mensagem marcada como mídia mas sem mediaKey");
  const buffer = await downloadMedia(message.mediaKey);
  const mimetype = message.mediaMimeType ?? undefined;

  if (message.mediaType === "AUDIO") {
    return socket.sendMessage(
      jid,
      { audio: buffer, mimetype: mimetype ?? "audio/ogg; codecs=opus", ptt: true },
      options
    );
  }
  if (message.mediaType === "IMAGE") {
    return socket.sendMessage(jid, { image: buffer, mimetype, caption: message.body || undefined }, options);
  }
  if (message.mediaType === "VIDEO") {
    return socket.sendMessage(jid, { video: buffer, mimetype: mimetype ?? "video/mp4", caption: message.body || undefined }, options);
  }
  return socket.sendMessage(
    jid,
    {
      document: buffer,
      mimetype: mimetype ?? "application/octet-stream",
      fileName: message.mediaFileName ?? "arquivo",
      caption: message.body || undefined,
    },
    options
  );
}

// Fase 0 mantém a fila simples de propósito: sem Redis/BullMQ ainda, o
// worker só varre mensagens PENDING da própria sessão em ritmo adaptativo
// (ver OUTBOX_POLL_MIN_MS). Isso já resolve o caso de uso (1 atendente
// respondendo), e a fila de verdade com throttling anti-ban entra na fase
// de Campanhas.
function pollOutbox(sessionId: string, socket: ReturnType<typeof makeWASocket>, isStopped: () => boolean) {
  let idleDelayMs = OUTBOX_POLL_MIN_MS;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const schedule = (delayMs: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, delayMs);
  };

  // Chamado pelo web assim que uma mensagem entra na fila (ver
  // /internal/outbox/wake): volta pro ritmo rápido e, se não houver ciclo em
  // andamento, dispara um agora — assim o ritmo ocioso mais folgado não custa
  // atraso nenhum pro atendente. Se já estiver rodando, o finally lá embaixo
  // já vai reagendar com o intervalo mínimo restaurado aqui.
  const wake = () => {
    idleDelayMs = OUTBOX_POLL_MIN_MS;
    if (!running) schedule(0);
  };

  const entry = activeSessions.get(sessionId);
  if (entry) entry.wakeOutbox = wake;

  const tick = async () => {
    if (isStopped()) return;
    running = true;

    // Try/finally garante que o polling continua mesmo se o Postgres soltar
    // a conexão no meio (comum em provedores serverless tipo Neon depois de
    // ociosidade) — sem isso, um erro aqui parava a fila pra sempre sem
    // avisar ninguém, e derrubava o processo do worker inteiro.
    try {
      const pending = await prisma.message.findMany({
        where: { sessionId, direction: "OUTBOUND", status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: 5,
        include: {
          conversation: { include: { contact: true } },
          sender: { select: { name: true } },
          quotedMessage: { select: { waMessageId: true, direction: true, body: true } },
        },
      });

      // Teve o que enviar: volta pro ritmo rápido, porque provavelmente vem
      // mais coisa logo atrás (atendente mandando várias seguidas). Fila
      // vazia: vai dobrando o intervalo até o teto.
      idleDelayMs = pending.length > 0 ? OUTBOX_POLL_MIN_MS : Math.min(idleDelayMs * 2, OUTBOX_POLL_MAX_MS);

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

          // Reconstrói um WAMessage mínimo só com o que o Baileys precisa pra
          // renderizar a citação (key + texto) — não guardamos a mensagem
          // crua do WhatsApp, só o necessário fica salvo no nosso Message.
          const quoted = message.quotedMessage?.waMessageId
            ? {
                key: {
                  remoteJid: jid,
                  id: message.quotedMessage.waMessageId,
                  fromMe: message.quotedMessage.direction === "OUTBOUND",
                },
                message: { conversation: message.quotedMessage.body || "" },
              }
            : undefined;

          const sent = message.mediaType && message.mediaKey
            ? await sendOutboundMedia(socket, jid, messageForSend, { quoted })
            : await socket.sendMessage(jid, { text: displayBody }, { quoted });

          await prisma.message.update({
            where: { id: message.id },
            data: { status: "SENT", waMessageId: sent?.key?.id ?? undefined },
          });
        } catch (error) {
          const errorMessage = (error as Error).message;
          // Queda passageira da conexão (o socket cai e reconecta sozinho em
          // segundos) não devia exigir o atendente perceber e reenviar na mão
          // — foi exatamente isso que aconteceu com uma mensagem de chave pix
          // que "sumiu" pro cliente. Enquanto a mensagem for recente e o erro
          // for desse tipo, mantém PENDING (sem marcar FAILED) pra próxima
          // volta do polling tentar de novo sozinha; só desiste de verdade
          // depois de RETRY_WINDOW_MS ou se o erro não parecer transitório.
          const isTransient = /connection closed|timed out|econnreset|socket.*closed|not connected/i.test(errorMessage);
          const ageMs = Date.now() - message.createdAt.getTime();
          if (isTransient && ageMs < RETRY_WINDOW_MS) {
            await prisma.message.update({
              where: { id: message.id },
              data: { errorMessage: `tentando de novo — ${errorMessage}` },
            });
          } else {
            await prisma.message.update({
              where: { id: message.id },
              data: { status: "FAILED", errorMessage },
            });
          }
        }
      }
    } catch (err) {
      logger.error({ err, sessionId }, "falha ao processar fila de saída");
    } finally {
      running = false;
      schedule(idleDelayMs);
    }
  };

  tick();
}

/** Acorda a fila de saída do tenant — usado pelo web ao enfileirar mensagem. */
export function wakeOutboxForTenant(tenantId: string) {
  for (const entry of activeSessions.values()) {
    if (entry.tenantId === tenantId) entry.wakeOutbox?.();
  }
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
