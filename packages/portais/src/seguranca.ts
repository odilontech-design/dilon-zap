import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Segredos dos portais: os tokens OAuth das lojas ficam criptografados no
 * banco (AES-256-GCM), e os links que entregamos a terceiros (o "state" do
 * OAuth, as fotos que a OLX baixa) são assinados (HMAC), para ninguém forjar.
 */

/** A chave de PORTAIS_CHAVE: 32 bytes em base64 (gere com `openssl rand -base64 32`). */
export function chaveDoAmbiente(valor = process.env.PORTAIS_CHAVE): Buffer {
  if (!valor) throw new Error("PORTAIS_CHAVE não configurada");
  const k = Buffer.from(valor, "base64");
  if (k.length !== 32) throw new Error("PORTAIS_CHAVE precisa ter 32 bytes em base64");
  return k;
}

/** "v1.<iv>.<tag>.<cifrado>", tudo em base64url. */
export function cifrar(texto: string, chave: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave, iv);
  const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), cifrado.toString("base64url")].join(".");
}

export function decifrar(guardado: string, chave: Buffer): string {
  const [versao, iv, tag, dados] = guardado.split(".");
  if (versao !== "v1" || !iv || !tag || dados === undefined) throw new Error("segredo em formato desconhecido");
  const d = createDecipheriv("aes-256-gcm", chave, Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(dados, "base64url")), d.final()]).toString("utf8");
}

function hmac(dados: string, segredo: string): string {
  return createHmac("sha256", segredo).update(dados).digest("base64url");
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * O "state" do OAuth: diz de qual empresa e de qual pessoa veio o pedido, com
 * validade de 15 minutos. Sem isso, o retorno do portal poderia ligar a conta
 * da OLX de uma loja na empresa de outra.
 */
export function assinarEstado(dados: { tenantId: string; userId: string; portal: string }, segredo: string, agora = Date.now()): string {
  const corpo = Buffer.from(JSON.stringify({ ...dados, exp: agora + 15 * 60_000 })).toString("base64url");
  return `${corpo}.${hmac(corpo, segredo)}`;
}

export function lerEstado(estado: string, segredo: string, agora = Date.now()): { tenantId: string; userId: string; portal: string } | null {
  const [corpo, assinatura] = estado.split(".");
  if (!corpo || !assinatura || !iguais(assinatura, hmac(corpo, segredo))) return null;
  try {
    const d = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as { tenantId: string; userId: string; portal: string; exp: number };
    return d.exp > agora ? { tenantId: d.tenantId, userId: d.userId, portal: d.portal } : null;
  } catch {
    return null;
  }
}

/** Assinatura do link público de uma foto (o portal baixa a imagem sem login). */
export function assinarFoto(fotoId: string, segredo: string): string {
  return hmac(`foto:${fotoId}`, segredo).slice(0, 22);
}

export function fotoAssinadaValida(fotoId: string, assinatura: string, segredo: string): boolean {
  return iguais(assinatura, assinarFoto(fotoId, segredo));
}
