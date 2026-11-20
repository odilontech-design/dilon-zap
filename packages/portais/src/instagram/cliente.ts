/**
 * Cliente da API do Instagram (Instagram API com Instagram Login) para a caixa
 * de entrada da loja: conectar a conta profissional por OAuth, ler o perfil de
 * quem escreve e responder as mensagens diretas.
 *
 * Endereços e campos escritos a partir da documentação pública da Meta (a
 * confirmar na homologação do app). Os três endereços-base podem ser trocados
 * por variável de ambiente, o que permite testar contra um servidor falso.
 */

const oauth = () => (process.env.INSTAGRAM_OAUTH_URL ?? "https://www.instagram.com").replace(/\/$/, "");
const api = () => (process.env.INSTAGRAM_API_URL ?? "https://api.instagram.com").replace(/\/$/, "");
const graph = () => (process.env.INSTAGRAM_GRAPH_URL ?? "https://graph.instagram.com").replace(/\/$/, "");
const VERSAO = "v21.0";

export const ESCOPOS_INSTAGRAM = ["instagram_business_basic", "instagram_business_manage_messages"];

export type AppInstagram = { id: string; segredo: string };

export function appInstagramDoAmbiente(): AppInstagram | null {
  const id = process.env.INSTAGRAM_APP_ID;
  const segredo = process.env.INSTAGRAM_APP_SECRET;
  return id && segredo ? { id, segredo } : null;
}

export class ErroInstagram extends Error {
  constructor(
    message: string,
    readonly codigo?: number,
    readonly subcodigo?: number,
  ) {
    super(message);
    this.name = "ErroInstagram";
  }
  /** Passou a janela de 24 h desde a última mensagem do cliente: não dá mais para responder. */
  get foraDaJanela() {
    return this.codigo === 10 && this.subcodigo === 2534022;
  }
  /** O token foi revogado ou venceu: a loja precisa reconectar. */
  get tokenInvalido() {
    return this.codigo === 190;
  }
}

async function chamar<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ErroInstagram("O Instagram não respondeu. Tente de novo em instantes.");
  }
  const texto = await r.text();
  let j: any = null;
  try {
    j = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta que não é JSON: tratada abaixo
  }
  if (!r.ok || j?.error || j?.error_message) {
    const e = j?.error ?? j ?? {};
    throw new ErroInstagram(String(e.message ?? e.error_message ?? `Instagram respondeu ${r.status}`).slice(0, 300), typeof e.code === "number" ? e.code : undefined, typeof e.error_subcode === "number" ? e.error_subcode : undefined);
  }
  return j as T;
}

export function urlDeAutorizacaoInstagram(app: AppInstagram, redirectUri: string, state: string): string {
  const q = new URLSearchParams({ client_id: app.id, redirect_uri: redirectUri, response_type: "code", scope: ESCOPOS_INSTAGRAM.join(","), state, enable_fb_login: "0", force_authentication: "1" });
  return `${oauth()}/oauth/authorize?${q}`;
}

/** O "code" do retorno vira um token de curta duração (1 h) e o id da conta. */
export async function trocarCodigoInstagram(app: AppInstagram, redirectUri: string, code: string): Promise<{ token: string; userId: string }> {
  const corpo = new URLSearchParams({ client_id: app.id, client_secret: app.segredo, grant_type: "authorization_code", redirect_uri: redirectUri, code: code.replace(/#_$/, "") });
  const j = await chamar<{ access_token?: string; user_id?: string | number; data?: { access_token: string; user_id: string | number }[] }>(`${api()}/oauth/access_token`, { method: "POST", body: corpo });
  const d = j.data?.[0] ?? j;
  if (!d.access_token || d.user_id === undefined) throw new ErroInstagram("O Instagram não devolveu o token.");
  return { token: d.access_token, userId: String(d.user_id) };
}

/** Token de curta duração → de longa duração (60 dias). */
export async function tokenLongoInstagram(app: AppInstagram, tokenCurto: string): Promise<{ token: string; expiraEm: Date }> {
  const q = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: app.segredo, access_token: tokenCurto });
  const j = await chamar<{ access_token: string; expires_in: number }>(`${graph()}/access_token?${q}`);
  return { token: j.access_token, expiraEm: new Date(Date.now() + j.expires_in * 1000) };
}

/** Renova o token de longa duração (vale mais 60 dias a partir de agora). */
export async function renovarTokenInstagram(token: string): Promise<{ token: string; expiraEm: Date }> {
  const q = new URLSearchParams({ grant_type: "ig_refresh_token", access_token: token });
  const j = await chamar<{ access_token: string; expires_in: number }>(`${graph()}/refresh_access_token?${q}`);
  return { token: j.access_token, expiraEm: new Date(Date.now() + j.expires_in * 1000) };
}

export type PerfilInstagram = { id: string; username: string; nome: string | null };

export async function perfilInstagram(token: string): Promise<PerfilInstagram> {
  const j = await chamar<{ user_id?: string; id?: string; username?: string; name?: string }>(`${graph()}/${VERSAO}/me?fields=user_id,username,name,account_type`, { headers: { Authorization: `Bearer ${token}` } });
  const id = j.user_id ?? j.id;
  if (!id || !j.username) throw new ErroInstagram("O Instagram não devolveu o perfil da conta.");
  return { id: String(id), username: j.username, nome: j.name ?? null };
}

/** Quem está escrevendo (nome e @), para a lista de conversas; falhar aqui não impede de mostrar a mensagem. */
export async function perfilDoContatoInstagram(token: string, igsid: string): Promise<{ nome: string | null; username: string | null } | null> {
  try {
    const j = await chamar<{ name?: string; username?: string }>(`${graph()}/${VERSAO}/${encodeURIComponent(igsid)}?fields=name,username`, { headers: { Authorization: `Bearer ${token}` } });
    return { nome: j.name ?? null, username: j.username ?? null };
  } catch {
    return null;
  }
}

/** Pede ao Instagram que mande as mensagens recebidas para o nosso webhook. */
export async function assinarMensagensInstagram(token: string): Promise<void> {
  await chamar(`${graph()}/${VERSAO}/me/subscribed_apps?subscribed_fields=messages`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
}

/** Responde uma mensagem direta (só vale até 24 h depois da última mensagem do cliente). */
export async function enviarTextoInstagram(token: string, igsid: string, texto: string): Promise<{ mid: string }> {
  const j = await chamar<{ message_id?: string; recipient_id?: string }>(`${graph()}/${VERSAO}/me/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: igsid }, message: { text: texto.slice(0, 1000) } }),
  });
  if (!j.message_id) throw new ErroInstagram("O Instagram não confirmou o envio.");
  return { mid: j.message_id };
}
