/**
 * Cliente da API de Veículos do Mercado Livre (anúncios classificados, categoria MLB1744).
 * Escrito a partir da documentação oficial (developers.mercadolivre.com.br, "Publicação de
 * automóveis" e "Gerenciamento de pacotes de veículos", lidas em 26/11/2026) e testado contra um
 * servidor falso (sincronizar-mercadolivre.test-manual.ts). AINDA NÃO validado contra a API
 * real: faltam o app da Dilon Tech e um usuário de teste ativado como concessionária (ver
 * docs/portais-e-site.md). O que não está na documentação lida (rotas de pausar, fechar e
 * excluir; troca do refresh token) segue o padrão geral da API do Mercado Livre e está marcado
 * como "a confirmar".
 *
 * OAuth2 por código de autorização, com cliente CONFIDENCIAL (client_id e client_secret). O
 * refresh token do Mercado Livre é de uso único: a cada renovação vem um novo, e quem guarda
 * (onTokens) precisa gravar o novo na hora.
 *
 * `MERCADOLIVRE_API_URL` e `MERCADOLIVRE_AUTH_URL` trocam os endereços (testes).
 */

const apiBase = () => (process.env.MERCADOLIVRE_API_URL ?? "https://api.mercadolibre.com").replace(/\/$/, "");
const authBase = () => (process.env.MERCADOLIVRE_AUTH_URL ?? "https://auth.mercadolivre.com.br").replace(/\/$/, "");

export const CATEGORIA_CARROS_ML = "MLB1744";

export type AppMercadoLivre = { clientId: string; clientSecret: string; redirectUri: string };

export function appMercadoLivreDoAmbiente(base = process.env.NEXTAUTH_URL): AppMercadoLivre | null {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: `${base.replace(/\/$/, "")}/api/portais/mercadolivre/retorno` };
}

export class ErroMercadoLivre extends Error {
  constructor(message: string, readonly http?: number) {
    super(message);
    this.name = "ErroMercadoLivre";
  }
  /** Acesso recusado (token revogado, sem permissão ou sem pacote): a loja precisa reconectar. */
  get semPermissao() {
    return this.http === 401 || this.http === 403;
  }
}

export type TokensMercadoLivre = { access: string; refresh: string; expiraEm: number; userId?: string };

async function pedirToken(app: AppMercadoLivre, corpo: Record<string, string>): Promise<TokensMercadoLivre> {
  let r: Response;
  try {
    r = await fetch(`${apiBase()}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...corpo }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ErroMercadoLivre("O Mercado Livre não respondeu");
  }
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new ErroMercadoLivre(`O Mercado Livre recusou o acesso${j?.message ? `: ${String(j.message).slice(0, 150)}` : ""}`, r.status === 400 ? 401 : r.status);
  return { access: j.access_token, refresh: j.refresh_token ?? corpo.refresh_token ?? "", expiraEm: Date.now() + Number(j.expires_in ?? 21_600) * 1000, userId: j.user_id !== undefined ? String(j.user_id) : undefined };
}

export function urlDeAutorizacaoMercadoLivre(app: AppMercadoLivre, estado: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: app.clientId, redirect_uri: app.redirectUri, state: estado });
  return `${authBase()}/authorization?${q}`;
}
export const trocarCodigoMercadoLivre = (app: AppMercadoLivre, code: string) => pedirToken(app, { grant_type: "authorization_code", code, redirect_uri: app.redirectUri });
export const renovarTokensMercadoLivre = (app: AppMercadoLivre, refresh: string) => pedirToken(app, { grant_type: "refresh_token", refresh_token: refresh });

export type StatusItemML = "active" | "paused" | "closed" | "under_review" | "inactive";

/** O corpo do anúncio como o Mercado Livre recebe (ver mapa.ts). */
export type ItemMercadoLivre = Record<string, unknown> & { title?: string; price?: number; pictures?: { source: string }[]; attributes?: { id: string; value_name: string }[] };

export type PacoteML = { status: string; conteudo: string; vagas: number };

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v));

/** Uma sessão com o Mercado Livre para uma loja (vendedor). Renova o token sozinha e avisa quem guarda (onTokens). */
export class SessaoMercadoLivre {
  constructor(
    private tokens: TokensMercadoLivre,
    readonly vendedorId: string,
    private readonly app: AppMercadoLivre,
    private readonly onTokens?: (t: TokensMercadoLivre) => Promise<void> | void,
  ) {}

  private async renovar() {
    if (!this.tokens.refresh) throw new ErroMercadoLivre("O Mercado Livre pede que a conta seja reconectada", 401);
    this.tokens = await renovarTokensMercadoLivre(this.app, this.tokens.refresh);
    await this.onTokens?.(this.tokens);
  }

  private async req<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    if (this.tokens.expiraEm - Date.now() < 120_000) await this.renovar();
    for (let tentativa = 0; ; tentativa++) {
      let r: Response;
      try {
        r = await fetch(`${apiBase()}${caminho}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${this.tokens.access}`, Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
          body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new ErroMercadoLivre("O Mercado Livre não respondeu");
      }
      if (r.status === 401 && tentativa === 0) {
        await this.renovar();
        continue;
      }
      const t = await r.text();
      if (!r.ok) {
        let detalhe = t.slice(0, 300);
        try {
          const j = JSON.parse(t);
          const causas = Array.isArray(j?.cause) ? j.cause.map((c: any) => texto(c?.message ?? c?.code)).filter(Boolean).slice(0, 4).join("; ") : "";
          detalhe = [texto(j?.message), causas].filter(Boolean).join(" — ").slice(0, 300) || detalhe;
        } catch {
          /* corpo que não é JSON: fica o texto cru */
        }
        throw new ErroMercadoLivre(`O Mercado Livre respondeu ${r.status}${detalhe ? `: ${detalhe}` : ""}`, r.status);
      }
      if (!t) return undefined as T;
      try {
        return JSON.parse(t) as T;
      } catch {
        return t as unknown as T;
      }
    }
  }

  /** Quem autorizou: o id do vendedor e o apelido (para mostrar na tela). */
  async eu(): Promise<{ id: string; apelido: string; email: string | null }> {
    const r = await this.req<any>("GET", "/users/me");
    const id = texto(r?.id);
    if (!id) throw new ErroMercadoLivre("O Mercado Livre não devolveu a conta autorizada");
    return { id, apelido: texto(r?.nickname) || id, email: texto(r?.email) || null };
  }

  /** Os pacotes de publicação da conta e quantas vagas restam (só vale anunciar com vaga). */
  async pacotes(): Promise<PacoteML[]> {
    const r = await this.req<any>("GET", `/users/${encodeURIComponent(this.vendedorId)}/classifieds_promotion_packs?package_content=ALL`);
    return (Array.isArray(r) ? r : []).map((p: any) => ({ status: texto(p?.status), conteudo: texto(p?.package_content), vagas: Math.max(0, Number(p?.remaining_listings ?? 0)) }));
  }
  /** Vagas de publicação em pacotes ativos. */
  async vagas(): Promise<number> {
    return (await this.pacotes()).filter((p) => p.status === "active" && p.conteudo === "publications").reduce((s, p) => s + p.vagas, 0);
  }

  async criar(item: ItemMercadoLivre): Promise<{ id: string; url: string | null }> {
    const r = await this.req<any>("POST", "/items", item);
    const id = texto(r?.id);
    if (!id) throw new ErroMercadoLivre("O Mercado Livre não devolveu o código do anúncio");
    return { id, url: texto(r?.permalink) || null };
  }
  async atualizar(id: string, parte: Partial<ItemMercadoLivre>) { await this.req("PUT", `/items/${encodeURIComponent(id)}`, parte); }
  async item(id: string): Promise<{ id: string; status: StatusItemML; url: string | null }> {
    const r = await this.req<any>("GET", `/items/${encodeURIComponent(id)}`);
    return { id: texto(r?.id), status: texto(r?.status) as StatusItemML, url: texto(r?.permalink) || null };
  }
  /** A descrição é um recurso à parte: criada depois do anúncio (POST) e trocada depois (PUT). */
  async descricaoNova(id: string, textoPuro: string) { await this.req("POST", `/items/${encodeURIComponent(id)}/description`, { plain_text: textoPuro }); }
  async descricaoTroca(id: string, textoPuro: string) { await this.req("PUT", `/items/${encodeURIComponent(id)}/description`, { plain_text: textoPuro }); }
  /** Pausar e reativar (a confirmar com a API real). */
  async mudarStatus(id: string, status: "active" | "paused" | "closed") { await this.req("PUT", `/items/${encodeURIComponent(id)}`, { status }); }
  /** Fecha e apaga do histórico da loja (a confirmar com a API real). */
  async excluir(id: string) {
    await this.mudarStatus(id, "closed");
    await this.req("PUT", `/items/${encodeURIComponent(id)}`, { deleted: "true" });
  }
}
