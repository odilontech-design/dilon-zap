import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizar, soDigitos } from "../texto";

/**
 * Lead que a OLX entrega por POST (doc "Envio de Leads"): um por contato de
 * comprador, vindo de WhatsApp, telefone, chat ou simulação de financiamento.
 * Puro: valida o corpo, limpa os campos e calcula a chave que impede o mesmo
 * lead de virar duas negociações.
 */

export type LeadOlx = {
  chave: string;
  origem: "whatsapp" | "telefone" | "chat" | "financing" | "olx";
  nome: string;
  email: string | null;
  /** Só dígitos, com DDI 55. Nulo quando não veio telefone utilizável. */
  telefone: string | null;
  mensagem: string;
  /** listId: o número do anúncio na OLX. */
  idNoPortal: string | null;
  /** adId: o id que o Zap mandou ao publicar (vazio em anúncio criado direto no portal). */
  idEnviado: string | null;
  linkAnuncio: string | null;
  criadoEm: Date;
  /** Anúncio que o comprador oferece na troca (primeiro da lista), quando há. */
  troca: string | null;
};

export const ROTULO_ORIGEM: Record<LeadOlx["origem"], string> = {
  whatsapp: "WhatsApp",
  telefone: "telefone",
  chat: "chat da OLX",
  financing: "simulação de financiamento",
  olx: "OLX",
};

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

/** Telefone da OLX: "2199999999", "21999999999" ou já com 55. Fixo e sem DDD não servem. */
export function telefoneDoLead(v: unknown): string | null {
  const d = soDigitos(typeof v === "string" || typeof v === "number" ? String(v) : "");
  const sem55 = d.length >= 12 && d.startsWith("55") ? d.slice(2) : d;
  if (sem55.length === 11 && sem55[2] === "9") return `55${sem55}`;
  if (sem55.length === 10) return `55${sem55}`;
  return null;
}

export function lerLead(corpo: unknown): { ok: true; lead: LeadOlx } | { ok: false; erro: string } {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "corpo inválido" };
  const c = corpo as Record<string, unknown>;
  const nome = texto(c.name, 120);
  const idNoPortal = texto(c.listId, 40);
  if (!nome) return { ok: false, erro: "name ausente" };
  if (!idNoPortal) return { ok: false, erro: "listId ausente" };

  const fonte = normalizar(texto(c.source, 20) ?? "olx");
  const origem: LeadOlx["origem"] = fonte === "whatsapp" || fonte === "telefone" || fonte === "chat" || fonte === "financing" ? fonte : "olx";
  const email = texto(c.email, 160)?.toLowerCase() ?? null;
  const telefone = telefoneDoLead(c.phone);
  const mensagem = texto(c.message, 1000) ?? "";
  const criado = typeof c.createdAt === "string" ? new Date(c.createdAt) : null;
  const criadoEm = criado && !Number.isNaN(criado.getTime()) ? criado : new Date();

  const externo = texto(c.externalId, 100);
  const chave = externo ?? createHash("sha256").update([idNoPortal, email ?? "", telefone ?? "", nome, origem, mensagem, criadoEm.toISOString()].join("|")).digest("hex").slice(0, 32);

  const hist = (c.buyerHistory as { adToExchange?: { subject?: unknown; price?: unknown } } | undefined)?.adToExchange;
  const trocaTitulo = texto(hist?.subject, 100);
  const trocaPreco = typeof hist?.price === "number" && hist.price > 0 ? hist.price : null;
  const troca = trocaTitulo ? `${trocaTitulo}${trocaPreco ? ` (R$ ${trocaPreco.toLocaleString("pt-BR")})` : ""}` : null;

  return {
    ok: true,
    lead: {
      chave,
      origem,
      nome,
      email,
      telefone,
      mensagem,
      idNoPortal,
      idEnviado: texto(c.adId, 40),
      linkAnuncio: texto(c.linkAd, 300),
      criadoEm,
      troca,
    },
  };
}

/** Token que vai na URL (identifica a loja) e, separado, o que a OLX manda no header. */
export function novoTokenDeLead(): string {
  return randomBytes(24).toString("base64url");
}

export function credencialDoLead(leadToken: string, segredo: string): string {
  return createHmac("sha256", segredo).update(`lead:${leadToken}`).digest("base64url").slice(0, 32);
}

/** Aceita o header com ou sem "Bearer ", comparando sem vazar o tempo. */
export function credencialConfere(header: string | null, leadToken: string, segredo: string): boolean {
  const recebido = (header ?? "").replace(/^Bearer\s+/i, "").trim();
  const esperado = credencialDoLead(leadToken, segredo);
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
