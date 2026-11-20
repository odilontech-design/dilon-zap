import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * O webhook do Instagram: a Meta chama com um POST a cada mensagem (assinado
 * com o segredo do app) e, ao cadastrar o endereço, com um GET de verificação.
 * Puro: valida a assinatura e transforma o JSON em eventos simples.
 */

/** Confere o header `X-Hub-Signature-256: sha256=<hex>` do corpo bruto. */
export function assinaturaDoWebhookValida(corpoBruto: string, header: string | null, segredoDoApp: string): boolean {
  const recebido = (header ?? "").replace(/^sha256=/i, "").trim();
  const esperado = createHmac("sha256", segredoDoApp).update(corpoBruto, "utf8").digest("hex");
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verificação do endereço: devolve o `hub.challenge` se o token confere; senão null. */
export function respostaDeVerificacao(q: URLSearchParams, tokenEsperado: string | undefined): string | null {
  if (!tokenEsperado || q.get("hub.mode") !== "subscribe" || q.get("hub.verify_token") !== tokenEsperado) return null;
  return q.get("hub.challenge");
}

export type AnexoInstagram = { tipo: string; url: string | null };

export type EventoDeMensagem = {
  /** O id da conta profissional da loja (entry.id). */
  contaId: string;
  /** O id de quem conversa com a loja (IGSID). */
  igsid: string;
  mid: string;
  texto: string;
  anexos: AnexoInstagram[];
  quando: Date;
  /** Mensagem enviada pela própria loja (inclusive pelo app do Instagram), não recebida. */
  eco: boolean;
};

const ROTULO_ANEXO: Record<string, string> = { image: "foto", video: "vídeo", audio: "áudio", file: "arquivo", share: "publicação compartilhada", story_mention: "marcou a loja num story", ig_reel: "reel", reel: "reel", sticker: "figurinha", like_heart: "curtida", location: "localização" };

export function lerEventosDeMensagem(corpo: unknown): EventoDeMensagem[] {
  const c = corpo as { object?: string; entry?: { id?: string; time?: number; messaging?: any[] }[] } | null;
  if (!c || c.object !== "instagram" || !Array.isArray(c.entry)) return [];
  const eventos: EventoDeMensagem[] = [];
  for (const entrada of c.entry) {
    const contaId = String(entrada.id ?? "");
    for (const m of entrada.messaging ?? []) {
      const msg = m?.message;
      if (!contaId || !msg?.mid || msg.is_deleted) continue;
      const remetente = String(m.sender?.id ?? "");
      const destinatario = String(m.recipient?.id ?? "");
      const eco = !!msg.is_echo || remetente === contaId;
      const igsid = eco ? destinatario : remetente;
      if (!igsid || igsid === contaId) continue;
      const anexos: AnexoInstagram[] = (Array.isArray(msg.attachments) ? msg.attachments : []).map((a: any) => ({ tipo: String(a?.type ?? "arquivo"), url: typeof a?.payload?.url === "string" ? a.payload.url : null }));
      let texto = typeof msg.text === "string" ? msg.text : "";
      if (!texto && anexos.length) texto = anexos.map((a) => `[${ROTULO_ANEXO[a.tipo] ?? a.tipo}]`).join(" ");
      if (!texto && msg.reply_to?.story) texto = "[respondeu a um story]";
      if (!texto) continue;
      if (typeof msg.text === "string" && msg.reply_to?.story) texto = `[respondendo a um story] ${texto}`;
      const ts = typeof m.timestamp === "number" ? m.timestamp : entrada.time;
      eventos.push({ contaId, igsid, mid: String(msg.mid), texto: texto.slice(0, 2000), anexos, quando: ts ? new Date(ts) : new Date(), eco });
    }
  }
  return eventos;
}
