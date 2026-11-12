import type { AnuncioOlx } from "./mapa";

/**
 * Chamadas HTTP ao Autoupload da OLX. Os endereços podem ser trocados por
 * variável de ambiente (OLX_AUTH_URL, OLX_API_URL) para os testes rodarem
 * contra um servidor falso, sem conta de verdade.
 */

const authUrl = () => (process.env.OLX_AUTH_URL ?? "https://auth.olx.com.br").replace(/\/$/, "");
const apiUrl = () => (process.env.OLX_API_URL ?? "https://apps.olx.com.br").replace(/\/$/, "");

export type CredenciaisApp = { clientId: string; clientSecret: string; redirectUri: string };

export function credenciaisDoAmbiente(base = process.env.NEXTAUTH_URL): CredenciaisApp | null {
  const clientId = process.env.OLX_CLIENT_ID;
  const clientSecret = process.env.OLX_CLIENT_SECRET;
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: `${base.replace(/\/$/, "")}/api/portais/olx/retorno` };
}

export class ErroOlx extends Error {
  constructor(message: string, readonly http?: number, readonly codigo?: number) {
    super(message);
  }
}

async function json<T>(res: Response, oQue: string): Promise<T> {
  const texto = await res.text();
  if (res.status === 401 || res.status === 403) throw new ErroOlx(`OLX recusou o acesso (${oQue}): reconecte a conta`, res.status);
  if (!res.ok) throw new ErroOlx(`OLX respondeu ${res.status} em ${oQue}: ${texto.slice(0, 200)}`, res.status);
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new ErroOlx(`OLX respondeu algo que não é JSON em ${oQue}`, res.status);
  }
}

const tempo = () => AbortSignal.timeout(30_000);

export function urlDeAutorizacao(app: CredenciaisApp, estado: string): string {
  const q = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: app.redirectUri,
    response_type: "code",
    scope: "autoupload basic_user_info",
    state: estado,
  });
  return `${authUrl()}/oauth?${q}`;
}

/** Troca o código do retorno pelo token (a OLX não manda refresh token: ele vale até a loja revogar). */
export async function trocarCodigo(app: CredenciaisApp, code: string): Promise<string> {
  const res = await fetch(`${authUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: app.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: tempo(),
  });
  const d = await json<{ access_token?: string; error?: string }>(res, "troca do código");
  if (!d.access_token) throw new ErroOlx(`OLX não devolveu o token${d.error ? ` (${d.error})` : ""}`);
  return d.access_token;
}

export async function dadosDoUsuario(token: string): Promise<{ nome: string | null; email: string | null }> {
  const res = await fetch(`${apiUrl()}/oauth_api/basic_user_info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token }),
    signal: tempo(),
  });
  const d = await json<{ user_name?: string; user_email?: string }>(res, "dados da conta");
  return { nome: d.user_name ?? null, email: d.user_email ?? null };
}

export type ItemDoLote = AnuncioOlx | { id: string; operation: "delete" };

export type RespostaLote = {
  token?: string;
  statusCode: number;
  statusMessage?: string;
  errors?: { id: string; messages?: { category?: string; message?: string; field?: string }[] }[];
};

/** O que cada statusCode do import quer dizer, em português para a loja. */
export const STATUS_IMPORT: Record<number, string> = {
  [-1]: "Erro inesperado na OLX",
  [-2]: "Conta bloqueada na OLX",
  [-3]: "Nenhum anúncio no lote",
  [-4]: "A OLX recusou dados do anúncio",
  [-5]: "OLX fora do ar",
  [-6]: "A conta da OLX não tem permissão para integrar: precisa de plano profissional",
  [-7]: "Limite de anúncios do plano da OLX atingido",
  [-8]: "Limite de anúncios do plano da OLX atingido",
};

export async function enviarLote(token: string, itens: ItemDoLote[]): Promise<RespostaLote> {
  const res = await fetch(`${apiUrl()}/autoupload/import`, {
    method: "PUT",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ access_token: token, ad_list: itens }),
    signal: tempo(),
  });
  return json<RespostaLote>(res, "envio de anúncios");
}

export type StatusDoAnuncioNoLote = {
  status: "pending" | "error" | "queued" | "accepted" | "refused";
  operation?: string;
  message?: string[] | string;
  list_id?: number | string;
  url?: string;
  image_errors?: unknown[];
};

export async function statusDoLote(token: string, loteToken: string): Promise<{ concluido: boolean; anuncios: Record<string, StatusDoAnuncioNoLote> }> {
  const res = await fetch(`${apiUrl()}/autoupload/import/${encodeURIComponent(loteToken)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token }),
    signal: tempo(),
  });
  const d = await json<{ autoupload_status?: string; ads?: Record<string, StatusDoAnuncioNoLote> }>(res, "status do lote");
  return { concluido: d.autoupload_status === "done", anuncios: d.ads ?? {} };
}

/** Catálogo de marcas → modelos → versões ("car_info", "car_info/6", "car_info/6/123"). */
export async function catalogo(token: string, marca?: string, modelo?: string): Promise<Record<string, number>> {
  const partes = ["autoupload", "car_info", marca, modelo].filter(Boolean).map((p) => encodeURIComponent(p!));
  const res = await fetch(`${apiUrl()}/${partes.join("/")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: token }),
    signal: tempo(),
  });
  const d = await json<{ status?: string; data?: Record<string, number> }>(res, "catálogo");
  return d.data ?? {};
}

/** Tamanho máximo do corpo do import (1 MB), com folga. */
export const LIMITE_LOTE_BYTES = 900_000;
