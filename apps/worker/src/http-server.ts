import http from "node:http";
import { getSocketForTenant } from "./session-manager";

const PORT = Number(process.env.WORKER_INTERNAL_PORT ?? 4001);
const SECRET = process.env.WORKER_INTERNAL_SECRET;

// API interna, só pro apps/web perguntar coisas que só o worker sabe (porque
// só ele tem a conexão Baileys viva) — hoje só resolve-jid. Escuta em
// 127.0.0.1 de propósito: não deve ser alcançável fora desta máquina/host.
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

    res.writeHead(404).end();
  });

  server.listen(PORT, "127.0.0.1", () => {
    console.log(`[dilon-zap worker] servidor interno ouvindo em 127.0.0.1:${PORT}`);
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
