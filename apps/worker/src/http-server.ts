import http from "node:http";
import {
  getSocketForTenant,
  editOutboundMessage,
  deleteOutboundMessage,
  reactToMessage,
  wakeOutboxForTenant,
  checarNumerosNoWhatsApp,
  setWhatsAppBlock,
  sincronizarGrupos,
  buscarHistoricoDeGrupo,
} from "./session-manager";

const PORT = Number(process.env.WORKER_INTERNAL_PORT ?? 4001);
const SECRET = process.env.WORKER_INTERNAL_SECRET;
// Dev local: 127.0.0.1 (só o próprio processo web, no mesmo host, acessa).
// Produção (Docker): 0.0.0.0, porque o container do web é outro host na rede
// interna do Docker — o isolamento vem de não publicar essa porta pro host/
// internet (ver docker-compose.prod.yml, que só usa "expose", nunca "ports"
// pra esse serviço), não do bind em si.
const HOST = process.env.WORKER_INTERNAL_HOST ?? "127.0.0.1";

// API interna, só pro apps/web perguntar coisas que só o worker sabe (porque
// só ele tem a conexão Baileys viva) — hoje só resolve-jid e disconnect.
export function startInternalServer() {
  if (!SECRET) {
    console.warn(
      "[dilon-zap worker] WORKER_INTERNAL_SECRET não definido no .env — servidor interno desligado."
    );
    return;
  }

  const server = http.createServer((req, res) => {
    if (req.headers.authorization !== `Bearer ${SECRET}`) {
      res.writeHead(401).end();
      return;
    }

    if (req.method === "POST" && req.url === "/internal/resolve-jid") {
      handleResolveJid(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/disconnect") {
      handleDisconnect(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/messages/edit") {
      handleEditMessage(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/messages/delete") {
      handleDeleteMessage(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/messages/react") {
      handleReactMessage(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/outbox/wake") {
      handleWakeOutbox(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/contacts/check-whatsapp") {
      handleCheckWhatsApp(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/contacts/block-whatsapp") {
      handleBlockWhatsApp(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/groups/sync") {
      handleSyncGroups(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/internal/groups/history") {
      handleGroupHistory(req, res);
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(PORT, HOST, () => {
    console.log(`[dilon-zap worker] servidor interno ouvindo em ${HOST}:${PORT}`);
  });
}

// Logout de verdade (revoga a sessão no WhatsApp) — diferente de só derrubar
// o socket, isso já deixa a sessão pronta pra pedir um QR novo, que é o que
// dispara a sincronização de histórico de novo (ver session-manager.ts).
function handleDisconnect(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId } = JSON.parse(body) as { tenantId?: string };
      if (!tenantId) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "tenantId é obrigatório" }));
        return;
      }

      const socket = getSocketForTenant(tenantId);
      if (!socket) {
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: false, reason: "sem conexão ativa" }));
        return;
      }

      await socket.logout();
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

function handleEditMessage(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId, waJid, waMessageId, text } = JSON.parse(body) as {
        tenantId?: string;
        waJid?: string;
        waMessageId?: string;
        text?: string;
      };
      if (!tenantId || !waJid || !waMessageId || !text) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "tenantId, waJid, waMessageId e text são obrigatórios" }));
        return;
      }

      const result = await editOutboundMessage(tenantId, waJid, waMessageId, text);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

function handleDeleteMessage(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId, waJid, waMessageId } = JSON.parse(body) as {
        tenantId?: string;
        waJid?: string;
        waMessageId?: string;
      };
      if (!tenantId || !waJid || !waMessageId) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "tenantId, waJid e waMessageId são obrigatórios" }));
        return;
      }

      const result = await deleteOutboundMessage(tenantId, waJid, waMessageId);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

function handleReactMessage(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId, waJid, waMessageId, targetFromMe, emoji, participant } = JSON.parse(body) as {
        tenantId?: string;
        waJid?: string;
        waMessageId?: string;
        targetFromMe?: boolean;
        emoji?: string;
        participant?: string | null;
      };
      if (!tenantId || !waJid || !waMessageId || typeof targetFromMe !== "boolean" || emoji === undefined) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "tenantId, waJid, waMessageId, targetFromMe e emoji são obrigatórios" }));
        return;
      }

      const result = await reactToMessage(tenantId, waJid, waMessageId, targetFromMe, emoji, participant);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

// Aviso de "tem coisa nova na fila" — deixa o polling da fila de saída ficar
// folgado quando está ocioso sem custar atraso no envio (ver pollOutbox).
// Best-effort de propósito: se falhar, o próximo ciclo do polling pega a
// mensagem do mesmo jeito, só um pouco depois.
function handleWakeOutbox(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { tenantId } = JSON.parse(body) as { tenantId?: string };
      if (!tenantId) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "tenantId é obrigatório" }));
        return;
      }

      wakeOutboxForTenant(tenantId);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true }));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

// Lista de grupos do número, pedida pela tela de grupos. A trava contra
// repetição mora em sincronizarGrupos, junto de quem fala com o WhatsApp.
/**
 * Pede ao WhatsApp o histórico anterior de UM grupo (ver
 * buscarHistoricoDeGrupo). Um por chamada, sempre disparado por alguém da
 * equipe — não existe rota que faça isso em lote.
 */
function handleGroupHistory(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId, contactId } = JSON.parse(body) as { tenantId?: string; contactId?: string };
      if (!tenantId || !contactId) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "tenantId e contactId são obrigatórios" }));
        return;
      }

      const result = await buscarHistoricoDeGrupo(tenantId, contactId);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}
function handleSyncGroups(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId } = JSON.parse(body) as { tenantId?: string };
      if (!tenantId) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "tenantId é obrigatório" }));
        return;
      }

      const result = await sincronizarGrupos(tenantId);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

function handleResolveJid(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId, phone } = JSON.parse(body) as { tenantId?: string; phone?: string };
      if (!tenantId || !phone) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "tenantId e phone são obrigatórios" }));
        return;
      }

      const socket = getSocketForTenant(tenantId);
      if (!socket) {
        // Sem conexão ativa pra esse tenant — quem chamou cai pro formato
        // padrão (@s.whatsapp.net) em vez de travar a criação do contato.
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ jid: null, exists: null }));
        return;
      }

      const results = await socket.onWhatsApp(phone);
      const match = results?.[0];
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({ jid: match?.jid ?? null, exists: match?.exists ?? false }));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

function handleCheckWhatsApp(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId, jids } = JSON.parse(body) as { tenantId?: string; jids?: string[] };
      if (!tenantId || !Array.isArray(jids)) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "tenantId e jids são obrigatórios" }));
        return;
      }

      const result = await checarNumerosNoWhatsApp(tenantId, jids);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}

function handleBlockWhatsApp(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const { tenantId, waJid, acao } = JSON.parse(body) as {
        tenantId?: string;
        waJid?: string;
        acao?: "block" | "unblock";
      };
      if (!tenantId || !waJid || (acao !== "block" && acao !== "unblock")) {
        res
          .writeHead(400, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "tenantId, waJid e acao (block|unblock) são obrigatórios" }));
        return;
      }

      const result = await setWhatsAppBlock(tenantId, waJid, acao);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(result));
    } catch (err) {
      res
        .writeHead(500, { "Content-Type": "application/json" })
        .end(JSON.stringify({ error: (err as Error).message }));
    }
  });
}
