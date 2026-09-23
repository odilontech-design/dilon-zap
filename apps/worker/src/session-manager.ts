import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  makeCacheableSignalKeyStore,
  generateMessageID,
  WAMessageStatus,
  // Valor, não só tipo: o enum HistorySyncType é lido em runtime pra
  // distinguir a resposta de "buscar histórico anterior" (ON_DEMAND) do
  // sync que chega sozinho ao parear.
  proto,
  type WAMessage,
  type GroupMetadata,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import pino from "pino";
import { randomUUID } from "node:crypto";
import { prisma, type Prisma } from "@dilon-zap/db";
import { uploadMedia, downloadMedia, isStorageConfigured } from "@dilon-zap/storage";
import { usePostgresAuthState } from "./postgres-auth-state";
import { dentroDoHorario, type DiaDeAtendimento } from "./business-hours";
import { criarBaileysLogger } from "./baileys-logger";
import { decidirAutoResposta, avaliarAutomacao, type OpcaoUra } from "./auto-reply-decisao";
import {
  ehGrupo,
  nomeDoAutor,
  tempoRestante,
  INTERVALO_CONSULTA_GRUPO_MS,
  INTERVALO_SINCRONIZACAO_MS,
  normalizarParticipantes,
  type ParticipanteBruto,
} from "./grupos";

const logger = pino({ level: process.env.LOG_LEVEL ?? "warn" });

// O Baileys recebe um logger separado e filtrado — ver baileys-logger.ts. Sem
// isso não temos como saber quando o cliente não conseguiu abrir a mensagem:
// ela consta como entregue e lida do nosso lado de qualquer jeito.
const baileysLogger = criarBaileysLogger();

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

// Quando o número está DESCONECTADO, o problema não é a mensagem: ela vai
// sair assim que alguém reconectar, e desistir em 60 segundos só produz três
// áudios marcados como "falhou" que ninguém reenvia (foi o que aconteceu com
// a Guttierres). Então, nesse caso, a mensagem espera — com um teto de um dia,
// porque mandar de madrugada algo escrito na véspera confundiria o cliente
// mais do que ajudaria.
const ESPERA_RECONEXAO_MS = 24 * 60 * 60 * 1000;

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
/**
 * Como o texto sai no WhatsApp do cliente. Vários atendentes dividem o mesmo
 * número — sem o nome, o cliente não sabe com quem está falando.
 *
 * Fonte única de propósito: isto era feito só no envio, e a edição mandava o
 * texto cru. Resultado: a atendente corrigia uma vírgula e a mensagem perdia
 * o "*Consultora Camila:*" no aparelho do cliente — no meio de uma conversa
 * onde as outras mensagens tinham. Duas cópias da mesma regra divergem;
 * uma só, não.
 */
export function corpoParaEnvio(nomeAtendente: string | null | undefined, corpo: string) {
  if (!nomeAtendente) return corpo;
  // Nome em negrito, quebra de linha, mensagem embaixo. Antes era
  // "*Nome:* mensagem" na mesma linha, o que embolava assinatura e conteúdo
  // num parágrafo só — em mensagem longa a atendente sumia no meio do texto.
  return corpo ? `*${nomeAtendente}*\n${corpo}` : `*${nomeAtendente}*`;
}

export async function editOutboundMessage(
  tenantId: string,
  waJid: string,
  waMessageId: string,
  newText: string
): Promise<{ ok: boolean; reason?: string }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "sem conexão ativa" };

  // Busca quem enviou pra remontar o prefixo. O texto guardado no banco é
  // sempre o cru (sem nome) — quem veste o nome é o envio, e a edição
  // precisa vestir igual.
  const original = await prisma.message.findFirst({
    where: { waMessageId, direction: "OUTBOUND" },
    select: { sender: { select: { name: true } } },
  });

  await socket.sendMessage(waJid, {
    text: corpoParaEnvio(original?.sender?.name, newText),
    edit: { remoteJid: waJid, id: waMessageId, fromMe: true },
  });
  return { ok: true };
}

/**
 * Bloqueia ou desbloqueia o número na CONTA do WhatsApp da empresa.
 *
 * Diferente do bloqueio da plataforma, que só esconde da caixa de entrada:
 * aqui o cliente para de conseguir falar com o número da empresa por
 * completo, e o bloqueio aparece no celular de quem estiver com o aparelho.
 * Por isso é ação separada e explícita na tela, nunca efeito colateral.
 */
export async function setWhatsAppBlock(
  tenantId: string,
  waJid: string,
  acao: "block" | "unblock"
): Promise<{ ok: boolean; reason?: string }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "sem conexão ativa" };

  try {
    await socket.updateBlockStatus(waJid, acao);
    return { ok: true };
  } catch (err) {
    logger.error({ err, waJid, acao }, "falha ao bloquear/desbloquear no WhatsApp");
    return { ok: false, reason: "o WhatsApp recusou a operação" };
  }
}

/**
 * Pergunta ao WhatsApp quais desses números têm conta.
 *
 * Devolve um mapa jid -> tem conta. Números ausentes da resposta são
 * tratados como "não tem" — é assim que o protocolo responde.
 *
 * Só aceita telefone: @lid é identificador interno e o onWhatsApp não sabe
 * responder sobre ele. Contato que só temos como @lid fica sem checagem, o
 * que é diferente de "não tem WhatsApp" — e a tela precisa dessa distinção
 * pra não sugerir excluir quem apenas não pôde ser verificado.
 */
export async function checarNumerosNoWhatsApp(
  tenantId: string,
  jids: string[]
): Promise<{ ok: boolean; reason?: string; resultado?: Record<string, boolean> }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "sem conexão ativa" };

  const telefones = jids.filter((j) => j.endsWith("@s.whatsapp.net"));
  if (telefones.length === 0) return { ok: true, resultado: {} };

  try {
    const resposta = await socket.onWhatsApp(...telefones);
    const temConta = new Set(
      (resposta ?? []).filter((r) => r.exists).map((r) => r.jid)
    );

    const resultado: Record<string, boolean> = {};
    for (const jid of telefones) {
      // Compara pelos dígitos: a resposta pode voltar com o jid normalizado
      // de forma diferente do que mandamos (o WhatsApp corrige o nono dígito
      // de celular brasileiro, por exemplo).
      const digitos = jid.split("@")[0];
      resultado[jid] = [...temConta].some((j) => j.split("@")[0] === digitos);
    }
    return { ok: true, resultado };
  } catch (err) {
    logger.error({ err }, "falha ao checar números no WhatsApp");
    return { ok: false, reason: "não foi possível consultar agora" };
  }
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
  emoji: string,
  // Num grupo, a mensagem de outra pessoa só é achada com o autor junto.
  participant?: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "sem conexão ativa" };

  await socket.sendMessage(waJid, {
    react: {
      text: emoji,
      key: { remoteJid: waJid, id: targetWaMessageId, fromMe: targetFromMe, ...(participant ? { participant } : {}) },
    },
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
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
      logger: baileysLogger,
      printQRInTerminal: false,
      // Pede o histórico mais completo que o WhatsApp aceitar mandar no
      // pareamento — só faz efeito num QR novo, não numa sessão já pareada.
      syncFullHistory: true,
      // Quando o aparelho do cliente não consegue decifrar uma mensagem nossa,
      // ele pede reenvio. O Baileys procura a original primeiro no cache em
      // memória e, se não achar, chama este gancho. Sem implementá-lo o
      // reenvio morre com "recv retry request, but message not available" e a
      // pessoa fica com "Aguardando mensagem" pra sempre — mesmo com a
      // mensagem constando ENTREGUE do nosso lado, porque o recibo de entrega
      // é do envelope, não da decifragem. Foi o caso da Renata (#1327).
      //
      // Só texto: reconstruir mídia exigiria rebaixar do R2 e recifrar, e o
      // ganho não paga o custo — o texto é o que a atendente precisa que
      // chegue. Mídia sem retry continua caindo no reenvio manual.
      getMessage: async (key) => {
        if (!key.id) return undefined;
        try {
          const salva = await prisma.message.findFirst({
            where: { waMessageId: key.id, direction: "OUTBOUND" },
            select: { id: true, body: true },
          });
          if (!salva) return undefined;

          // Registra o pedido mesmo quando não dá pra servir: é isso que
          // permite o Inbox avisar a atendente em vez de a falha morrer no log.
          //
          // Conferido no Baileys 7.x: o gancho só é chamado em dois lugares —
          // sendMessagesAgain (retry, o nosso caso) e resposta a evento de
          // calendário. Nunca criamos eventos, então marcar aqui não gera falso
          // positivo. O caminho de enquete está comentado na lib.
          const servida = Boolean(salva.body);
          await prisma.message
            .update({
              where: { id: salva.id },
              data: {
                retryRequestedAt: new Date(),
                ...(servida ? { retryServedAt: new Date() } : {}),
              },
            })
            .catch(() => {
              // Não pode impedir o reenvio em si — o registro é secundário.
            });

          return servida ? { conversation: salva.body } : undefined;
        } catch (err) {
          // Postgres fora do ar não pode derrubar o fluxo de retry.
          logger.error({ err, waMessageId: key.id }, "falha ao buscar mensagem pro reenvio");
          return undefined;
        }
      },
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
      // Grupo tem caminho próprio: só grava se a equipe ativou, e grava quem
      // mandou cada mensagem. Ver registrarMensagemDeGrupo.
      if (ehGrupo(waJid)) {
        await registrarMensagemDeGrupo({ sessionId, tenantId: entry.tenantId, msg, socket }).catch((err) =>
          logger.error({ err, waMessageId: msg.key.id }, "falha ao registrar mensagem de grupo")
        );
        continue;
      }

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
        // Na 7.x o par LID/telefone virou campo de primeira classe: quando a
        // mensagem chega endereçada por LID, remoteJidAlt traz o telefone
        // correspondente (e vice-versa). Substitui o antigo senderPn, que a
        // 6.x populava sem declarar no tipo — e nem sempre populava.
        remoteJidAlt: msg.key.remoteJidAlt ?? undefined,
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

      await aplicarRecibo(sessionId, key.id, status);
    }
  });

  // Segunda fonte de recibo, e ela não é redundante: o messages.update acima
  // só chega quando o Baileys resolve traduzir o recibo num status de
  // mensagem. O message-receipt.update é o evento cru, e vem em casos em que
  // o outro não vem. Ouvir só um deles era parte de por que um terço das
  // mensagens ficava parado em "enviado" pra sempre.
  socket.ev.on("message-receipt.update", async (recibos) => {
    for (const { key, receipt } of recibos) {
      if (!key.fromMe || !key.id) continue;

      // Ouvido (áudio) e lido são a mesma coisa pra quem olha a tela: a
      // pessoa consumiu a mensagem.
      const status: StatusDeRecibo | null =
        receipt.playedTimestamp || receipt.readTimestamp
          ? "READ"
          : receipt.receiptTimestamp
            ? "DELIVERED"
            : null;
      if (!status) continue;

      await aplicarRecibo(sessionId, key.id, status);
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

  // Nome da agenda do celular. Quando alguém salva ou renomeia o contato no
  // aparelho, o WhatsApp avisa por aqui.
  //
  // Esse listener não existia, e era exatamente por isso que salvar o
  // contato no celular não refletia no sistema: o nome da agenda só era lido
  // no messaging-history.set, que roda ao conectar. Então o nome aparecia
  // quando a sessão reconectava e nunca no meio do dia — comportamento que
  // de fora parece "às vezes funciona".
  const aplicarNomeDaAgenda = async (
    contatos: Array<{ id?: string | null; lid?: string | null; name?: string | null; notify?: string | null }>
  ) => {
    for (const c of contatos) {
      const jid = c.id ?? c.lid;
      // `name` é o nome salvo na agenda; `notify` é o pushName que a própria
      // pessoa escolheu. A agenda vem primeiro: é como a empresa chama o
      // cliente, e é o que a atendente espera ver.
      // Duas fontes bem diferentes, e tratá-las como equivalentes era o bug:
      // `name` é o nome da AGENDA do celular — como a empresa cadastrou o
      // cliente ("Dc2 Sheila vieira"); `notify` é o pushName, o nome que a
      // própria pessoa escolheu pra conta dela ("Sheila").
      const nomeAgenda = c.name?.trim();
      const pushName = c.notify?.trim();
      const nome = nomeAgenda || pushName;
      if (!jid || !nome) continue;
      if (jid.endsWith("@g.us") || jid === "status@broadcast") continue;

      try {
        const contato = await prisma.contact.findFirst({
          where: { tenantId: entry.tenantId, waJid: jid },
          select: { id: true, name: true, waName: true, nameManual: true },
        });
        if (!contato) continue;

        // O WhatsApp reenvia a lista inteira de contatos a cada sincronização,
        // não só o que mudou — sem essa comparação, toda reconexão parecia
        // alteração nova e disparava escrita à toa.
        if (contato.waName === nome) continue;

        // Duas regras, cada uma cobrindo um jeito de perder o nome certo:
        //
        // nameManual: alguém digitou esse nome aqui dentro. Nada do WhatsApp
        // reescreve — era o relato da Camila, que corrigia o nome e ele
        // voltava sozinho.
        //
        // pushName só preenche vazio: se o contato JÁ tem nome, o nome que a
        // cliente escolheu pra própria conta não substitui o que a empresa
        // usa pra identificá-la. Só a agenda tem essa autoridade.
        const podeReescrever =
          !contato.nameManual && (Boolean(nomeAgenda) || !contato.name);

        await prisma.contact.update({
          where: { id: contato.id },
          data: podeReescrever ? { waName: nome, name: nome } : { waName: nome },
        });
      } catch (err) {
        logger.error({ err, jid }, "falha ao atualizar nome do contato");
      }
    }
  };

  socket.ev.on("contacts.upsert", (contatos) => {
    void aplicarNomeDaAgenda(contatos);
  });
  socket.ev.on("contacts.update", (contatos) => {
    void aplicarNomeDaAgenda(contatos);
  });

  // Nome e tamanho dos grupos. O WhatsApp manda isto sozinho — ao entrar num
  // grupo, quando alguém renomeia, e numa leva ao conectar —, então ouvir aqui
  // mantém a lista de grupos em dia sem nenhuma consulta nossa.
  socket.ev.on("groups.upsert", (grupos) => {
    void atualizarCatalogoDeGrupos(entry.tenantId, grupos);
  });
  socket.ev.on("groups.update", (grupos) => {
    void atualizarCatalogoDeGrupos(entry.tenantId, grupos);
  });

  // WhatsApp manda o histórico existente (em blocos) logo depois de parear
  // um número novo, e às vezes um resumo de "o que rolou enquanto eu tava
  // offline" em reconexões. Sem esse listener, o Inbox só teria conversa
  // a partir do momento em que o worker ligou.
  socket.ev.on("messaging-history.set", async ({ messages, contacts, chats, isLatest, syncType }) => {
    try {
      // Resposta a um "buscar histórico anterior" de grupo (ver
      // buscarHistoricoDeGrupo): SÓ aqui mensagem antiga de grupo entra. No
      // sync do pareamento continua valendo a regra de sempre — grupo não
      // traz histórico — senão parear um número que está em dezenas de grupos
      // baixaria mídia antiga de todos eles de uma vez.
      if (syncType === proto.HistorySync.HistorySyncType.ON_DEMAND) {
        const doGrupo = (messages ?? []).filter((m) => ehGrupo(m.key?.remoteJid));
        for (const msg of doGrupo) {
          // registrarMensagemDeGrupo já ignora grupo não ativado, deduplica
          // por waMessageId e grava o autor — é o mesmo caminho da mensagem
          // ao vivo, então histórico e tempo real ficam idênticos na tela.
          await registrarMensagemDeGrupo({ sessionId, tenantId: entry.tenantId, msg, socket });
        }
        if (doGrupo.length > 0) {
          logger.info({ sessionId, count: doGrupo.length }, "histórico de grupo importado");
        }
      }

      // Os grupos vêm na lista de chats do histórico, já com nome: é a fonte
      // mais barata da lista de disponíveis, porque já chegou. Mensagem antiga
      // de grupo NÃO é importada — o grupo só tem histórico aqui a partir de
      // quando a equipe ativa.
      // flatMap e não filter+map: é o que deixa o TypeScript saber que o id
      // que passou por ehGrupo não é mais nulo.
      const gruposDoHistorico = (chats ?? []).flatMap((c) =>
        ehGrupo(c.id) ? [{ id: c.id, subject: c.name ?? undefined }] : []
      );
      if (gruposDoHistorico.length > 0) {
        await atualizarCatalogoDeGrupos(entry.tenantId, gruposDoHistorico);
      }

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

// Ordem de progresso de uma mensagem enviada. Existe pra que o status só
// ande PRA FRENTE.
//
// O WhatsApp reenvia recibos fora de ordem e repete os antigos em reconexão
// e sincronização de histórico. Como a gravação era um updateMany direto,
// um SERVER_ACK atrasado chegando depois do READ rebaixava a mensagem de
// "lida" pra "enviada" — e ela ficava assim pra sempre, porque o recibo de
// leitura não vem duas vezes.
//
// FAILED fica abaixo de SENT de propósito: recibo do WhatsApp é prova mais
// forte que erro nosso, então uma mensagem marcada como falha que depois
// recebe confirmação de entrega deve ser corrigida pra entregue.
const NIVEL_STATUS = { PENDING: 0, FAILED: 1, SENT: 2, DELIVERED: 3, READ: 4 } as const;
type StatusDeRecibo = keyof typeof NIVEL_STATUS;

async function aplicarRecibo(sessionId: string, waMessageId: string, novo: StatusDeRecibo) {
  const inferiores = (Object.keys(NIVEL_STATUS) as StatusDeRecibo[]).filter(
    (s) => NIVEL_STATUS[s] < NIVEL_STATUS[novo]
  );
  if (inferiores.length === 0) return;

  // O filtro por status na cláusula where é o que torna isso atômico: dois
  // recibos chegando juntos não conseguem se sobrescrever, porque o que vale
  // menos não encontra linha pra atualizar.
  await prisma.message.updateMany({
    where: {
      sessionId,
      waMessageId,
      direction: "OUTBOUND",
      status: { in: inferiores },
    },
    data: { status: novo, statusUpdatedAt: new Date() },
  });
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
// WAMessage e não proto.IWebMessageInfo: downloadMediaMessage exige a chave
// não-nula, e quem chama aqui já garantiu isso (mensagem ao vivo sempre tem,
// e o histórico passa pelo type guard de `candidates`).
async function extractInboundContent(
  msg: WAMessage,
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
        // Compara pela coluna avatarPhotoId, não extraindo da avatarUrl: a
        // avatarUrl agora aponta pro nosso servidor, e extrair dela daria
        // sempre "avatar" — casando contatos que não têm nada a ver.
        const candidates = await prisma.contact.findMany({
          where: { tenantId: params.tenantId, waJid: { not: params.waJid }, avatarPhotoId: { not: null } },
          select: { id: true, avatarPhotoId: true, name: true },
        });
        const match = candidates.find((c) => c.avatarPhotoId === photoId);
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
  remoteJidAlt?: string;
  quotedWaMessageId?: string;
  socket: ReturnType<typeof makeWASocket>;
  // Mensagem de grupo: o contato da conversa é o grupo, e o autor vai na
  // própria mensagem. autorJid/autorNome nulos = mandada pela empresa.
  grupo?: { autorJid: string | null; autorNome: string | null };
}) {
  const isInbound = params.direction === "INBOUND";

  const session = await prisma.whatsAppSession.findUniqueOrThrow({
    where: { id: params.sessionId },
    select: { tenantId: true },
  });
  const resolvedPhone = params.waJid.endsWith("@lid")
    ? phoneDigitsFromJid(params.remoteJidAlt)
    : undefined;
  // pushName só identifica quem MANDOU a mensagem — numa mensagem OUTBOUND
  // (mandada do próprio celular, fora do Inbox) isso seria o nome do próprio
  // negócio, não do contato, então não pode virar o nome do contato.
  const contactName = isInbound ? params.pushName : undefined;

  // Grupo já foi garantido por registrarMensagemDeGrupo, e nenhuma das
  // reconciliações de pessoa (telefone, foto de perfil) faz sentido pra ele —
  // o pushName, principalmente, é de quem mandou, e virar nome do grupo foi
  // exatamente o defeito dos grupos gravados antes.
  const contact = params.grupo
    ? await prisma.contact.findUniqueOrThrow({
        where: { tenantId_waJid: { tenantId: session.tenantId, waJid: params.waJid } },
      })
    : await resolveContact({
        tenantId: session.tenantId,
        waJid: params.waJid,
        contactName,
        resolvedPhone,
        socket: params.socket,
      });

  if (precisaBuscarAvatar(contact)) {
    buscarAvatarEmSegundoPlano(params.socket, contact.id, params.waJid);
  }

  // upsert (não find-then-create) é essencial aqui: duas mensagens chegando
  // quase juntas (poucos ms de diferença, cada uma num evento messages.upsert
  // separado que o Baileys não serializa) disparavam dois recordMessage()
  // concorrentes — nenhum via o create do outro a tempo, e cada um criava
  // sua própria Conversation pro mesmo contato. upsert é uma operação atômica
  // no Postgres (INSERT ... ON CONFLICT), não tem essa janela de corrida.
  //
  // Estado ANTES desta mensagem — o upsert logo abaixo já sobrescreve status
  // e lastMessageAt, e é o valor de ANTES que diz se o atendimento tinha
  // acabado de ser fechado ou fazia tempo que ninguém escrevia (ver
  // avaliarAutomacao). Lido separado, e não dentro de uma transação com o
  // upsert: uma leitura ligeiramente desatualizada aqui, num caso raro de
  // corrida, no máximo faz o menu reaparecer ou deixar de reaparecer uma vez
  // a mais — não é dado que precisa de atomicidade.
  const estadoAntesDaMensagem = isInbound
    ? await prisma.conversation.findUnique({
        where: { contactId_sessionId: { contactId: contact.id, sessionId: params.sessionId } },
        select: { status: true, lastMessageAt: true },
      })
    : null;

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
      // Grupo não tem ciclo de atendimento: fica sempre aberto.
      status: isInbound || params.grupo ? "OPEN" : "RESOLVED",
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
    autorJid: params.grupo?.autorJid ?? undefined,
    autorNome: params.grupo?.autorNome ?? undefined,
    // Foto do setor da conversa neste instante — ver o comentário de
    // Message.setorId no schema.
    setorId: conversation.setorId,
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

  // A regra de quem cala o robô e de quando a triagem reinicia tem nome e
  // teste — ver avaliarAutomacao. Em grupo o robô nunca fala: saudação,
  // aviso de ausência e menu de triagem mandados pra dezenas de pessoas são
  // spam, e é o tipo de coisa que faz o WhatsApp derrubar o número.
  if (isInbound && !params.grupo) {
    const atendimento = await carregarAtendimento(session.tenantId);
    const menuLigado = atendimento.uraAtiva && atendimento.uraOpcoes.length > 0;
    const decisao = avaliarAutomacao(
      { assignedToId: conversation.assignedToId, setorId: conversation.setorId },
      estadoAntesDaMensagem,
      new Date(),
      atendimento.uraReinicioAposMinutos * 60_000,
      menuLigado
    );

    if (decisao.podeFalar) {
      // Esquece o roteamento anterior ANTES de decidir a resposta: sem isso
      // o menu não seria remontado (uraEnviadaEm continuaria preenchido, e o
      // texto do cliente seria lido como resposta a um menu que ele nem viu
      // de novo) e a conversa reapareceria atribuída a quem já não é mais
      // quem está cuidando.
      if (decisao.reiniciarRoteamento) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            uraEnviadaEm: null,
            uraReenvios: 0,
            assignedToId: null,
            setorId: null,
            assignedAt: null,
            assignedById: null,
            assignmentSeenAt: null,
          },
        });
      }

      await maybeAutoReply({
        tenantId: session.tenantId,
        sessionId: params.sessionId,
        conversationId: conversation.id,
        inboundText: params.text,
        foraDoHorario: !dentroDoHorario(atendimento.dias, atendimento.timezone),
        mensagemAusencia: atendimento.outOfHoursMessage,
        ausenciaAvisadaEm: conversation.outOfHoursNotifiedAt,
        contactId: contact.id,
        saudacaoEnviadaEm: contact.saudacaoEnviadaEm,
        setorAtualId: decisao.reiniciarRoteamento ? null : conversation.setorId,
        uraAtiva: atendimento.uraAtiva,
        uraMensagem: atendimento.uraMensagem,
        uraOpcoes: atendimento.uraOpcoes,
        uraEnviadaEm: decisao.reiniciarRoteamento ? null : conversation.uraEnviadaEm,
        uraReenvios: decisao.reiniciarRoteamento ? 0 : conversation.uraReenvios,
      });
    }
  }
}

// Última consulta de dados de grupo e última "Atualizar lista", por tenant.
// Em memória de propósito: a trava só precisa sobreviver ao minuto seguinte,
// e o worker reiniciando já espaça as consultas por conta própria.
const ultimaConsultaDeGrupo = new Map<string, number>();
const ultimaSincronizacaoDeGrupos = new Map<string, number>();
// Última "Atualizar participantes", por tenant. Curto de propósito — é um
// grupo por clique — mas existe pra que clicar em sequência em dez grupos não
// vire dez consultas ao WhatsApp no mesmo segundo.
const ultimaConsultaDeParticipantes = new Map<string, number>();
const INTERVALO_PARTICIPANTES_MS = 15_000;

/**
 * Substitui a foto dos membros de um grupo pela lista que o WhatsApp acabou de
 * devolver. Substitui em vez de somar: quem saiu do grupo tem que sumir daqui,
 * senão a equipe ligaria pra alguém que já não faz mais parte.
 */
async function salvarParticipantes(grupoId: string, brutos: ParticipanteBruto[]) {
  const participantes = normalizarParticipantes(brutos);
  await prisma.$transaction([
    prisma.grupoParticipante.deleteMany({ where: { grupoId } }),
    prisma.grupoParticipante.createMany({
      data: participantes.map((p) => ({ grupoId, ...p })),
      skipDuplicates: true,
    }),
  ]);
  return participantes;
}

/**
 * "Atualizar participantes" de um grupo: pede ao WhatsApp a lista de membros
 * com telefone. É o único jeito de saber o número de quem fala no grupo — a
 * mensagem chega com o autor em @lid, sem número nenhum.
 *
 * Sob comando e um grupo por vez: nunca uma rotina que varra todos os grupos.
 */
export async function atualizarParticipantesDoGrupo(
  tenantId: string,
  contactId: string
): Promise<{ ok: boolean; reason?: string; total?: number; comTelefone?: number }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "o número está desconectado" };

  const grupo = await prisma.contact.findFirst({
    where: { id: contactId, tenantId, grupo: true },
    select: { id: true, waJid: true },
  });
  if (!grupo) return { ok: false, reason: "grupo não encontrado" };

  const agora = Date.now();
  const falta = tempoRestante(ultimaConsultaDeParticipantes.get(tenantId), agora, INTERVALO_PARTICIPANTES_MS);
  if (falta > 0) {
    return { ok: false, reason: `aguarde ${Math.ceil(falta / 1000)}s antes de atualizar outro grupo` };
  }
  ultimaConsultaDeParticipantes.set(tenantId, agora);

  try {
    const meta = await socket.groupMetadata(grupo.waJid);
    const salvos = await salvarParticipantes(grupo.id, meta.participants ?? []);
    await prisma.contact.update({
      where: { id: grupo.id },
      data: { grupoParticipantes: salvos.length || undefined },
    });
    return { ok: true, total: salvos.length, comTelefone: salvos.filter((p) => p.telefone).length };
  } catch (err) {
    logger.error({ err, grupo: grupo.waJid }, "falha ao buscar participantes do grupo");
    return { ok: false, reason: "o WhatsApp não respondeu agora — tente de novo mais tarde" };
  }
}

/**
 * Acha o grupo, ou registra como disponível na primeira mensagem dele.
 *
 * Grupo nunca visto custa UMA consulta de dados (nome, tamanho) e nunca mais:
 * a partir daí ele existe no banco e as mensagens seguintes voltam logo na
 * primeira linha. A trava por tempo cobre o caso perigoso — o número
 * reconectando e vários grupos desconhecidos mandando mensagem no mesmo
 * minuto. Consulta em rajada é o que o WhatsApp pune (ver AVATAR_TTL_MS).
 */
async function garantirGrupo(tenantId: string, jid: string, socket: ReturnType<typeof makeWASocket>) {
  const existente = await prisma.contact.findUnique({
    where: { tenantId_waJid: { tenantId, waJid: jid } },
    select: { id: true, grupo: true, grupoAtivadoEm: true },
  });
  // Contato de grupo gravado antes de 03/08 chega aqui com grupo=false e é
  // corrigido pelo upsert abaixo.
  if (existente?.grupo) return existente;

  let subject: string | undefined;
  let participantes: number | undefined;
  let membros: ParticipanteBruto[] | undefined;
  const agora = Date.now();
  if (tempoRestante(ultimaConsultaDeGrupo.get(tenantId), agora, INTERVALO_CONSULTA_GRUPO_MS) === 0) {
    ultimaConsultaDeGrupo.set(tenantId, agora);
    try {
      const meta = await socket.groupMetadata(jid);
      subject = meta.subject?.trim() || undefined;
      participantes = meta.participants?.length || undefined;
      membros = meta.participants;
    } catch (err) {
      // Sem nome agora não é problema: o evento de grupo ou o "Atualizar
      // lista" preenchem depois. Travar a mensagem por isso seria pior.
      logger.warn({ err, jid }, "não deu pra ler os dados do grupo — segue sem nome");
    }
  }

  const salvo = await prisma.contact.upsert({
    where: { tenantId_waJid: { tenantId, waJid: jid } },
    create: { tenantId, waJid: jid, grupo: true, name: subject, waName: subject, grupoParticipantes: participantes },
    update: {
      grupo: true,
      ...(subject ? { name: subject, waName: subject } : {}),
      ...(participantes ? { grupoParticipantes: participantes } : {}),
    },
    select: { id: true, grupo: true, grupoAtivadoEm: true },
  });

  // A consulta acima já trouxe os membros com telefone — guardar agora não
  // custa chamada nenhuma a mais ao WhatsApp. Falhar aqui não pode travar a
  // mensagem que está chegando: sem membros, o telefone só não aparece.
  if (membros?.length) {
    await salvarParticipantes(salvo.id, membros).catch((err) =>
      logger.warn({ err, jid }, "não deu pra guardar os membros do grupo")
    );
  }

  return salvo;
}

/**
 * Mensagem que chegou num grupo.
 *
 * Grupo não ativado para ANTES de baixar mídia ou gravar texto. É o que
 * permite o número estar em grupo de família e de fornecedor sem que isso vire
 * CPU gasta, arquivo guardado e conversa na tela — só fica registrado que o
 * grupo existe, pra aparecer em "Gerenciar grupos".
 */
async function registrarMensagemDeGrupo(p: {
  sessionId: string;
  tenantId: string;
  msg: WAMessage;
  socket: ReturnType<typeof makeWASocket>;
}) {
  const jid = p.msg.key.remoteJid!;
  const grupo = await garantirGrupo(p.tenantId, jid, p.socket);
  if (!grupo.grupoAtivadoEm) return;

  const content = await extractInboundContent(p.msg, p.socket);
  if (!content) return;

  const fromMe = !!p.msg.key.fromMe;
  await recordMessage({
    sessionId: p.sessionId,
    waJid: jid,
    direction: fromMe ? "OUTBOUND" : "INBOUND",
    text: content.text,
    media: content.media,
    waMessageId: p.msg.key.id ?? undefined,
    quotedWaMessageId: content.quotedWaMessageId,
    socket: p.socket,
    // Mandada do celular da empresa: igual a uma OUTBOUND num chat 1:1, não
    // tem participante a mostrar.
    grupo: fromMe
      ? { autorJid: null, autorNome: null }
      : {
          autorJid: p.msg.key.participant ?? null,
          autorNome: nomeDoAutor(p.msg.pushName, p.msg.key.participant, p.msg.key.participantAlt),
        },
  });
}

/**
 * Grava nome e tamanho dos grupos que o WhatsApp informou. O que ainda não
 * existe entra como disponível — nunca ativa nada sozinho.
 */
async function atualizarCatalogoDeGrupos(tenantId: string, grupos: Array<Partial<GroupMetadata>>) {
  for (const g of grupos) {
    if (!ehGrupo(g.id)) continue;
    const subject = g.subject?.trim() || undefined;
    const participantes = g.participants?.length || undefined;
    try {
      await prisma.contact.upsert({
        where: { tenantId_waJid: { tenantId, waJid: g.id } },
        create: { tenantId, waJid: g.id, grupo: true, name: subject, waName: subject, grupoParticipantes: participantes },
        update: {
          grupo: true,
          ...(subject ? { name: subject, waName: subject } : {}),
          ...(participantes ? { grupoParticipantes: participantes } : {}),
        },
      });
    } catch (err) {
      logger.error({ err, jid: g.id }, "falha ao atualizar grupo");
    }
  }
}

/** Quantas mensagens anteriores pedir de uma vez. O WhatsApp cobra por
 * mensagem, não por dia, então "uns 10 dias" vira uma quantidade — num grupo
 * parado isso vai longe, num movimentado cobre pouco. 50 é o que a própria
 * Meta usa como lote padrão de sincronização sob demanda. */
const MENSAGENS_POR_PEDIDO_DE_HISTORICO = 50;

/**
 * Pede ao WhatsApp as mensagens ANTERIORES às que já temos de um grupo.
 *
 * Existe porque grupo só passa a ter histórico aqui a partir do momento em
 * que a equipe ativa (ver registrarMensagemDeGrupo) — e a Hemoderi opera pela
 * agenda de cirurgias em grupo, onde o que foi combinado ontem importa.
 *
 * Sempre sob comando, um grupo por vez: disparar isso pra dezenas de grupos
 * de uma vez é concentração de chamada contra o WhatsApp, que é exatamente o
 * que derruba número (ver o incidente da Believe). Não existe versão
 * automática disto de propósito.
 *
 * A resposta NÃO volta aqui: chega depois pelo evento messaging-history.set,
 * marcada como ON_DEMAND, e é lá que as mensagens entram (ver o listener).
 */
export async function buscarHistoricoDeGrupo(
  tenantId: string,
  contactId: string
): Promise<{ ok: boolean; reason?: string }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "o número está desconectado" };

  const grupo = await prisma.contact.findFirst({
    where: { id: contactId, tenantId, grupo: true },
    select: { id: true, waJid: true, grupoAtivadoEm: true },
  });
  if (!grupo) return { ok: false, reason: "grupo não encontrado" };
  if (!grupo.grupoAtivadoEm) return { ok: false, reason: "ative o grupo antes de buscar o histórico" };

  // Âncora: o pedido é "o que veio ANTES desta mensagem", então sem nenhuma
  // mensagem nossa daquele grupo não há de onde partir. Acontece com grupo
  // recém-ativado que ainda não recebeu nada — aí é só esperar a primeira.
  const conversa = await prisma.conversation.findFirst({
    where: { contactId: grupo.id },
    select: { id: true },
  });
  const ancora = conversa
    ? await prisma.message.findFirst({
        where: { conversationId: conversa.id, waMessageId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { waMessageId: true, createdAt: true, direction: true },
      })
    : null;
  if (!ancora?.waMessageId) {
    return {
      ok: false,
      reason: "esse grupo ainda não tem nenhuma mensagem aqui — assim que chegar a primeira, dá pra buscar o que veio antes",
    };
  }

  try {
    await socket.fetchMessageHistory(
      MENSAGENS_POR_PEDIDO_DE_HISTORICO,
      { remoteJid: grupo.waJid, id: ancora.waMessageId, fromMe: ancora.direction === "OUTBOUND" },
      ancora.createdAt.getTime()
    );
    logger.info({ tenantId, grupo: grupo.waJid }, "histórico de grupo pedido ao WhatsApp");
    return { ok: true };
  } catch (err) {
    logger.error({ err, grupo: grupo.waJid }, "falha ao pedir histórico do grupo");
    return { ok: false, reason: "o WhatsApp não respondeu agora — tente de novo mais tarde" };
  }
}

/**
 * "Atualizar lista" da tela de grupos: pede ao WhatsApp todos os grupos do
 * número numa chamada só.
 *
 * Sob demanda e travado por INTERVALO_SINCRONIZACAO_MS. Nunca vira rotina
 * automática: a lista chega sozinha pelos eventos de grupo e pelo histórico,
 * e isto existe só pro caso de a equipe não achar um grupo que sabe que existe.
 */
export async function sincronizarGrupos(
  tenantId: string
): Promise<{ ok: boolean; reason?: string; total?: number }> {
  const socket = getSocketForTenant(tenantId);
  if (!socket) return { ok: false, reason: "o número está desconectado" };

  const agora = Date.now();
  const falta = tempoRestante(ultimaSincronizacaoDeGrupos.get(tenantId), agora, INTERVALO_SINCRONIZACAO_MS);
  if (falta > 0) {
    return { ok: false, reason: `a lista foi atualizada há pouco — tente de novo em ${Math.ceil(falta / 60_000)} min` };
  }
  ultimaSincronizacaoDeGrupos.set(tenantId, agora);

  try {
    const todos = Object.values(await socket.groupFetchAllParticipating());
    await atualizarCatalogoDeGrupos(tenantId, todos);
    return { ok: true, total: todos.length };
  } catch (err) {
    logger.error({ err }, "falha ao buscar a lista de grupos");
    return { ok: false, reason: "o WhatsApp não respondeu agora — tente de novo mais tarde" };
  }
}

// Horário e mensagem de ausência mudam raramente e são lidos a cada mensagem
// recebida — sem cache, cada mensagem viraria duas consultas a mais num
// Postgres de 1 vCPU. 60s é curto o bastante pra mudança na tela valer quase
// na hora e longo o bastante pra tirar o peso do caminho quente.
const CACHE_ATENDIMENTO_MS = 60_000;
const cacheAtendimento = new Map<
  string,
  {
    em: number;
    dados: {
      timezone: string;
      outOfHoursMessage: string | null;
      dias: DiaDeAtendimento[];
      uraAtiva: boolean;
      uraMensagem: string | null;
      uraOpcoes: OpcaoUra[];
      uraReinicioAposMinutos: number;
    };
  }
>();

async function carregarAtendimento(tenantId: string) {
  const guardado = cacheAtendimento.get(tenantId);
  if (guardado && Date.now() - guardado.em < CACHE_ATENDIMENTO_MS) return guardado.dados;

  const [tenant, dias, uraOpcoes] = await Promise.all([
    prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        timezone: true,
        outOfHoursMessage: true,
        uraAtiva: true,
        uraMensagem: true,
        uraReinicioAposMinutos: true,
      },
    }),
    prisma.businessHour.findMany({
      where: { tenantId },
      select: { weekday: true, isOpen: true, opensAt: true, closesAt: true },
    }),
    // Só opções cujo destino ainda está ativo: encaminhar pra quem saiu da
    // empresa deixaria a conversa "atendida" na mesa de ninguém — pior que
    // não encaminhar, porque some da fila sem dono e ninguém procura.
    //
    // Setor pede DUAS condições. Ativo não basta: setor sem nenhum membro
    // ativo é uma fila que ninguém filtra, e o efeito pro cliente é o mesmo
    // de ser encaminhado pra quem saiu da empresa. Melhor a opção nem
    // aparecer no menu do que aparecer e não levar a lugar nenhum.
    //
    // O OR é obrigatório aqui: com atendenteId nulável, filtrar só por
    // `atendente: { deactivatedAt: null }` descartaria TODA opção de setor
    // em silêncio, e o menu apareceria sem elas sem ninguém entender por quê.
    prisma.uraOpcao.findMany({
      where: {
        tenantId,
        OR: [
          { atendente: { deactivatedAt: null } },
          { setor: { ativo: true, membros: { some: { user: { deactivatedAt: null } } } } },
        ],
      },
      select: { ordem: true, rotulo: true, atendenteId: true, setorId: true },
      orderBy: { ordem: "asc" },
    }),
  ]);

  const dados = {
    timezone: tenant.timezone,
    outOfHoursMessage: tenant.outOfHoursMessage,
    dias,
    uraAtiva: tenant.uraAtiva,
    uraMensagem: tenant.uraMensagem,
    uraOpcoes,
    uraReinicioAposMinutos: tenant.uraReinicioAposMinutos,
  };
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

  // Type guard e não filtro comum: na 7.x o `key` do histórico é opcional no
  // tipo, e sem estreitar aqui cada uso lá embaixo viraria um `!` solto — que
  // é justamente o que esconde um `key` faltando virando crash em produção.
  const candidates = messages.filter((msg): msg is WAMessage => {
    const jid = msg.key?.remoteJid;
    if (!jid || jid.endsWith("@g.us") || jid === "status@broadcast") return false;
    return !!msg.message && !!msg.key?.id;
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
      // Mesmo campo das mensagens ao vivo: com o remoteJid em @lid, o
      // remoteJidAlt traz o telefone. Na 6.x isso era um senderPn não
      // declarado no tipo, que exigia cast e nem sempre vinha preenchido.
      const digits = phoneDigitsFromJid(msg.key.remoteJidAlt ?? undefined);
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
    if (precisaBuscarAvatar(contact)) {
      buscarAvatarEmSegundoPlano(socket, contact.id, waJid);
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

// Quanto tempo uma conferida de foto vale antes de valer a pena refazer.
//
// NÃO transforme isso numa varredura em lote. Já foi tentado, em 17/08/2026:
// um laço conferia 20 contatos a cada 5 minutos pra consertar a base inteira
// de uma vez. Depois de ~81 consultas, o WhatsApp passou a responder
// not-authorized e removeu o dispositivo vinculado da Believe
// (stream:error 401, conflict type="device_removed"). O número ficou fora do
// ar por 40 minutos, 16 mensagens de cliente nunca saíram, e foi preciso
// reler o QR code.
//
// Buscar foto no ritmo das mensagens que chegam é seguro — foi o que rodou
// por meses. Em lote, não é. A diferença não é o total de consultas, é a
// concentração.
const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Vale (re)buscar a foto desse contato agora? Uma regra só cobre os dois
// lados do problema: quem não tem foto para de ser tentado a cada mensagem
// pra sempre, e quem tem é reconferido de vez em quando — senão a pessoa
// troca a foto de perfil e a nossa nunca muda.
function precisaBuscarAvatar(contact: { avatarCheckedAt: Date | null }) {
  if (!contact.avatarCheckedAt) return true;
  return Date.now() - contact.avatarCheckedAt.getTime() > AVATAR_TTL_MS;
}

// Busca a foto de perfil e guarda A IMAGEM no nosso R2, não o endereço dela.
//
// Guardar o endereço era o que fazíamos antes, e não funciona: as URLs de
// pps.whatsapp.net expiram. Numa amostra de 12 fotos que tínhamos salvas em
// produção, 6 já respondiam 403 — a foto aparecia no dia em que o contato
// chegou e sumia semanas depois, sem nada ter mudado do nosso lado.
async function fetchAndSaveAvatar(
  socket: ReturnType<typeof makeWASocket>,
  contactId: string,
  waJid: string
) {
  // Marca a tentativa ANTES de tentar. Se marcasse depois, toda falha
  // deixaria o contato elegível de novo na mensagem seguinte — que é
  // exatamente o loop que essa marcação existe pra cortar.
  await prisma.contact.update({
    where: { id: contactId },
    data: { avatarCheckedAt: new Date() },
  });

  const url = await socket.profilePictureUrl(waJid, "image");
  if (!url) return "sem-foto";

  const photoId = avatarPhotoId(url);
  const atual = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { avatarKey: true, avatarPhotoId: true },
  });
  // Mesma foto que já está guardada: não baixa nem sobe de novo.
  if (atual?.avatarKey && photoId && atual.avatarPhotoId === photoId) return "inalterada";

  // Sem R2 (ambiente local), guarda a URL do WhatsApp como antes. Expira em
  // algumas semanas, o que é o bastante pra desenvolvimento.
  if (!isStorageConfigured()) {
    await prisma.contact.update({
      where: { id: contactId },
      data: { avatarUrl: url, avatarPhotoId: photoId },
    });
    return "sem-r2";
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN do WhatsApp respondeu ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const key = `avatars/${contactId}.jpg`;
  await uploadMedia(key, buffer, res.headers.get("content-type") ?? "image/jpeg");

  await prisma.contact.update({
    where: { id: contactId },
    data: {
      avatarKey: key,
      avatarPhotoId: photoId,
      // A chave é sempre a mesma pro mesmo contato, então o navegador
      // guardaria a foto velha pra sempre depois de uma troca. O ?v= muda
      // junto com a foto e é o que faz a troca aparecer.
      avatarUrl: `/api/contacts/${contactId}/avatar?v=${encodeURIComponent(photoId ?? "1")}`,
    },
  });
  return "salva";
}

// Envolve a busca de avatar pra ela nunca derrubar o fluxo da mensagem, mas
// TAMBÉM nunca sumir em silêncio. Antes cada chamada terminava num
// `.catch(() => {})` puro: com 263 contatos sem foto em produção, não havia
// como distinguir "essa pessoa não tem foto" de "a busca está quebrada".
function buscarAvatarEmSegundoPlano(
  socket: ReturnType<typeof makeWASocket>,
  contactId: string,
  waJid: string
) {
  fetchAndSaveAvatar(socket, contactId, waJid).catch((err) => {
    console.warn(
      `[dilon-zap worker] [avatar] falha ao buscar foto de ${waJid}: ${err?.message ?? err}`
    );
  });
}

// v1 do construtor de fluxos: casamento simples por palavra-chave. Só dispara
// pra conversa sem atendente atribuído — assim que um humano assume, a
// automação para de responder no lugar dele.
// Qual resposta sai fica em decidirAutoResposta (auto-reply-decisao.ts), que
// é pura e tem teste. Aqui ficam só as idas ao banco: ler as regras, gravar a
// mensagem e registrar o que já foi avisado.
async function maybeAutoReply(params: {
  tenantId: string;
  sessionId: string;
  conversationId: string;
  inboundText: string;
  foraDoHorario: boolean;
  mensagemAusencia: string | null;
  ausenciaAvisadaEm: Date | null;
  contactId: string;
  saudacaoEnviadaEm: Date | null;
  // Setor da conversa ANTES desta rodada — pra marcar a resposta automática
  // com o setor certo mesmo quando é ELA quem está encaminhando pra lá (ver
  // Message.setorId).
  setorAtualId: string | null;
  uraAtiva: boolean;
  uraMensagem: string | null;
  uraOpcoes: OpcaoUra[];
  uraEnviadaEm: Date | null;
  uraReenvios: number;
}) {
  const rules = await prisma.autoReply.findMany({ where: { tenantId: params.tenantId } });

  const decisao = decidirAutoResposta({
    regras: rules,
    textoRecebido: params.inboundText,
    foraDoHorario: params.foraDoHorario,
    mensagemAusencia: params.mensagemAusencia,
    ausenciaAvisadaEm: params.ausenciaAvisadaEm,
    saudacaoEnviadaEm: params.saudacaoEnviadaEm,
    agora: new Date(),
    ausenciaIntervaloMs: AUSENCIA_INTERVALO_MS,
    uraAtiva: params.uraAtiva,
    uraMensagem: params.uraMensagem,
    uraOpcoes: params.uraOpcoes,
    uraEnviadaEm: params.uraEnviadaEm,
    uraReenvios: params.uraReenvios,
  });
  if (!decisao) return;

  const {
    texto,
    marcarAusencia,
    marcarSaudacao,
    marcarUraEnviada,
    contarReenvioUra,
    atribuirPara,
    direcionarParaSetor,
  } =
    decisao;

  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      sessionId: params.sessionId,
      direction: "OUTBOUND",
      status: "PENDING",
      body: texto,
      // Se esta é a resposta que encaminha pro setor, ela já nasce marcada
      // com o setor de destino — é a primeira mensagem que a equipe de lá vê.
      setorId: direcionarParaSetor ?? params.setorAtualId,
    },
  });

  if (marcarAusencia) {
    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: { outOfHoursNotifiedAt: new Date() },
    });
  }

  // Estado do menu na conversa. As três coisas mexem na mesma linha, então
  // vão num update só — e o encaminhamento entra junto com assignedAt para o
  // Inbox mostrar o aviso de "chegou pra você", igual a uma transferência
  // feita por um colega. assignedById fica nulo de propósito: não foi ninguém
  // da equipe que transferiu, foi o próprio cliente escolhendo no menu.
  const mudancasNaConversa: Prisma.ConversationUpdateInput = {};
  if (marcarUraEnviada) mudancasNaConversa.uraEnviadaEm = new Date();
  if (contarReenvioUra) mudancasNaConversa.uraReenvios = { increment: 1 };
  if (atribuirPara) {
    mudancasNaConversa.assignedTo = { connect: { id: atribuirPara } };
    mudancasNaConversa.assignedAt = new Date();
  }
  // Setor NÃO preenche assignedTo de propósito: a conversa vai pra fila do
  // setor, sem responsável, que é o estado em que a equipe inteira enxerga e
  // qualquer membro pode assumir. Preencher um responsável aqui escolheria
  // uma pessoa por conta própria e desfaria justamente o que o setor resolve.
  if (direcionarParaSetor) {
    mudancasNaConversa.setor = { connect: { id: direcionarParaSetor } };
  }
  if (Object.keys(mudancasNaConversa).length > 0) {
    await prisma.conversation.update({
      where: { id: params.conversationId },
      data: mudancasNaConversa,
    });
  }

  // Marca depois de enfileirar: só conta como saudado quem de fato recebeu.
  if (marcarSaudacao) {
    await prisma.contact.update({
      where: { id: params.contactId },
      data: { saudacaoEnviadaEm: new Date() },
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
          quotedMessage: { select: { waMessageId: true, direction: true, body: true, autorJid: true } },
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
          // Áudio não tem legenda, então o prefixo nele é ignorado mesmo.
          const displayBody = corpoParaEnvio(message.sender?.name, message.body);
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
                  // Em grupo, citar a mensagem de outra pessoa exige dizer de
                  // quem ela é — sem isso a citação sai quebrada no aparelho.
                  ...(message.quotedMessage.autorJid ? { participant: message.quotedMessage.autorJid } : {}),
                },
                message: { conversation: message.quotedMessage.body || "" },
              }
            : undefined;

          // Id gerado por nós e gravado ANTES do envio. É o que garante que o
          // recibo de entrega encontre a mensagem: quando quem gerava era o
          // WhatsApp, o id só chegava aqui depois do sendMessage resolver, e
          // qualquer recibo que chegasse nesse meio-tempo procurava um id que
          // ainda não existia no banco e era jogado fora sem deixar rastro.
          //
          // Numa retentativa reaproveita o id já gravado: mesmo id significa
          // que o WhatsApp trata como a mesma mensagem, em vez de o cliente
          // receber duas.
          const waMessageId = message.waMessageId ?? generateMessageID();
          if (!message.waMessageId) {
            await prisma.message.update({
              where: { id: message.id },
              data: { waMessageId },
            });
          }

          if (message.mediaType && message.mediaKey) {
            await sendOutboundMedia(socket, jid, messageForSend, { quoted, messageId: waMessageId });
          } else {
            await socket.sendMessage(jid, { text: displayBody }, { quoted, messageId: waMessageId });
          }

          // updateMany com filtro de status, não update por id: o recibo de
          // entrega pode ter chegado enquanto o envio ainda estava em curso,
          // e um `status: "SENT"` cego rebaixaria a mensagem de entregue pra
          // enviada — desfazendo justamente o que essa correção conserta.
          await prisma.message.updateMany({
            where: { id: message.id, status: "PENDING" },
            data: { status: "SENT", statusUpdatedAt: new Date() },
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

          // Número desconectado é caso à parte: a espera vale o dia inteiro,
          // porque o que falta é o QR Code ser lido, não a mensagem ser
          // reenviada. Ver ESPERA_RECONEXAO_MS.
          const sessao = await prisma.whatsAppSession.findUnique({
            where: { id: sessionId },
            select: { status: true },
          });
          if (sessao && sessao.status !== "CONNECTED" && ageMs < ESPERA_RECONEXAO_MS) {
            await prisma.message.update({
              where: { id: message.id },
              data: { errorMessage: "aguardando o número reconectar" },
            });
            continue;
          }

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
