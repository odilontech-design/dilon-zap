import type { WASocket } from "@whiskeysockets/baileys";

/**
 * "Visto por último" / online / digitando do contato, como no WhatsApp.
 *
 * O WhatsApp só manda presença de quem a gente ASSINA (presenceSubscribe) — é
 * o que o WhatsApp Web faz ao abrir uma conversa. Aqui é igual: a assinatura
 * só acontece quando alguém está com a conversa aberta no Dilon Zap, e no
 * máximo uma vez a cada poucos minutos por contato. Nunca em lote, nunca em
 * segundo plano: ver feedback "nunca varredura automática contra o WhatsApp".
 *
 * O "visto por último" só vem se o contato deixa isso visível na privacidade
 * dele (e o número conectado também). Sem isso, chega no máximo o "online".
 *
 * Guarda só em memória e com teto de tamanho: é informação de agora, e o
 * worker já caiu uma vez por falta de memória (21/10).
 */

type Estado = "online" | "digitando" | "gravando" | "offline";
type Registro = { estado: Estado; vistoEm: number | null; em: number };

const LIMITE = 3000;
const registros = new Map<string, Registro>();
const assinadoEm = new Map<string, number>();
const REASSINAR_MS = 4 * 60_000;

const chave = (sessionId: string, jid: string) => `${sessionId}|${jid.split(":")[0].split("@")[0]}`;

function guardar(k: string, r: Registro) {
  registros.delete(k); // reinsere no fim: o Map vira uma fila do mais antigo pro mais novo
  registros.set(k, r);
  if (registros.size > LIMITE) registros.delete(registros.keys().next().value!);
}

/** Chamado pelo evento presence.update do Baileys. */
export function registrarPresenca(
  sessionId: string,
  update: { id: string; presences: Record<string, { lastKnownPresence?: string; lastSeen?: number }> }
) {
  for (const [participante, p] of Object.entries(update.presences ?? {})) {
    // "paused" = parou de digitar, mas continua com o WhatsApp aberto.
    const estado: Estado =
      p.lastKnownPresence === "available" || p.lastKnownPresence === "paused"
        ? "online"
        : p.lastKnownPresence === "composing"
          ? "digitando"
          : p.lastKnownPresence === "recording"
            ? "gravando"
            : "offline";
    const k = chave(sessionId, participante || update.id);
    const anterior = registros.get(k);
    guardar(k, {
      estado,
      // lastSeen vem em segundos, e só quando o contato permite.
      vistoEm: p.lastSeen ? p.lastSeen * 1000 : estado === "offline" ? (anterior?.vistoEm ?? null) : null,
      em: Date.now(),
    });
  }
}

/**
 * O que se sabe da presença do contato, assinando se for a hora. A primeira
 * consulta costuma voltar vazia: a resposta do WhatsApp chega pelo evento,
 * alguns segundos depois, e aparece na consulta seguinte.
 */
export async function consultarPresenca(socket: WASocket | null, sessionId: string, jid: string, alternativo?: string | null) {
  const k = chave(sessionId, jid);
  const kAlt = alternativo ? chave(sessionId, alternativo) : null;
  if (socket && !jid.endsWith("@g.us")) {
    const ultima = assinadoEm.get(k) ?? 0;
    if (Date.now() - ultima > REASSINAR_MS) {
      assinadoEm.delete(k);
      assinadoEm.set(k, Date.now());
      if (assinadoEm.size > LIMITE) assinadoEm.delete(assinadoEm.keys().next().value!);
      await socket.presenceSubscribe(jid).catch(() => {});
    }
  }
  const r = registros.get(k) ?? (kAlt ? registros.get(kAlt) : undefined);
  // "digitando" e "online" envelhecem: sem atualização há mais de 2 min, não afirma.
  if (r && r.estado !== "offline" && Date.now() - r.em > 2 * 60_000) return { estado: "offline" as Estado, vistoEm: r.vistoEm };
  return r ? { estado: r.estado, vistoEm: r.vistoEm } : { estado: null, vistoEm: null };
}
