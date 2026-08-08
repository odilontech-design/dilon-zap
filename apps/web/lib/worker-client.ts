// Só o worker tem a conexão Baileys viva, então é ele quem sabe se um número
// usa JID de telefone (@s.whatsapp.net) ou o formato mais novo @lid — sem
// isso, contato criado manualmente/importado pode duplicar quando a mesma
// pessoa manda mensagem de verdade depois (ver commit da resolução de JID).
export async function resolveWhatsAppJid(
  tenantId: string,
  phoneDigits: string
): Promise<{ jid: string | null; exists: boolean | null }> {
  const baseUrl = process.env.WORKER_INTERNAL_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!baseUrl || !secret) return { jid: null, exists: null };

  try {
    const res = await fetch(`${baseUrl}/internal/resolve-jid`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tenantId, phone: phoneDigits }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return { jid: null, exists: null };
    return await res.json();
  } catch {
    // Worker fora do ar, timeout, etc. — quem chamou cai pro formato padrão.
    return { jid: null, exists: null };
  }
}

export async function editWhatsAppMessage(
  tenantId: string,
  waJid: string,
  waMessageId: string,
  text: string
): Promise<{ ok: boolean; reason?: string }> {
  const baseUrl = process.env.WORKER_INTERNAL_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!baseUrl || !secret) return { ok: false, reason: "worker não configurado" };

  try {
    const res = await fetch(`${baseUrl}/internal/messages/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tenantId, waJid, waMessageId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "falha ao falar com o worker" };
    return await res.json();
  } catch {
    return { ok: false, reason: "worker fora do ar" };
  }
}

export async function deleteWhatsAppMessage(
  tenantId: string,
  waJid: string,
  waMessageId: string
): Promise<{ ok: boolean; reason?: string }> {
  const baseUrl = process.env.WORKER_INTERNAL_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!baseUrl || !secret) return { ok: false, reason: "worker não configurado" };

  try {
    const res = await fetch(`${baseUrl}/internal/messages/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tenantId, waJid, waMessageId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "falha ao falar com o worker" };
    return await res.json();
  } catch {
    return { ok: false, reason: "worker fora do ar" };
  }
}

/** emoji vazio ("") remove a reação — mesmo comportamento do app oficial do WhatsApp. */
export async function reactWhatsAppMessage(
  tenantId: string,
  waJid: string,
  waMessageId: string,
  targetFromMe: boolean,
  emoji: string
): Promise<{ ok: boolean; reason?: string }> {
  const baseUrl = process.env.WORKER_INTERNAL_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!baseUrl || !secret) return { ok: false, reason: "worker não configurado" };

  try {
    const res = await fetch(`${baseUrl}/internal/messages/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tenantId, waJid, waMessageId, targetFromMe, emoji }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "falha ao falar com o worker" };
    return await res.json();
  } catch {
    return { ok: false, reason: "worker fora do ar" };
  }
}

/**
 * Avisa o worker que tem mensagem nova na fila de saída, pra ele sair do
 * ritmo ocioso e enviar na hora. Best-effort e sem await obrigatório: se o
 * worker estiver fora do ar ou a chamada falhar, o polling normal pega a
 * mensagem no ciclo seguinte — nada se perde, só sai alguns segundos depois.
 */
export async function wakeOutbox(tenantId: string): Promise<void> {
  const baseUrl = process.env.WORKER_INTERNAL_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!baseUrl || !secret) return;

  try {
    await fetch(`${baseUrl}/internal/outbox/wake`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tenantId }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch {
    // silêncio proposital — ver comentário acima
  }
}

export async function disconnectWhatsApp(tenantId: string): Promise<{ ok: boolean; reason?: string }> {
  const baseUrl = process.env.WORKER_INTERNAL_URL;
  const secret = process.env.WORKER_INTERNAL_SECRET;
  if (!baseUrl || !secret) return { ok: false, reason: "worker não configurado" };

  try {
    const res = await fetch(`${baseUrl}/internal/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ tenantId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: "falha ao falar com o worker" };
    return await res.json();
  } catch {
    return { ok: false, reason: "worker fora do ar" };
  }
}
