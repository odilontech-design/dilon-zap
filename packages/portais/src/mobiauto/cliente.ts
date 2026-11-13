/**
 * Cliente da Open API da MobiAuto (Mobigestor): estoque (deals), fotos, publicação nos
 * portais, catálogo de veículos e planos. Escrito a partir do contrato público
 * (open-api.mobiauto.com.br, Swagger "open-api-1.0"). Autenticação OAuth2 por código de
 * autorização (Keycloak): a loja autoriza o Zap uma vez e guardamos o token de acesso e o de
 * renovação. Os endereços podem ser trocados por variável de ambiente para testar contra um
 * servidor falso.
 */

const authBase = () => (process.env.MOBIAUTO_AUTH_URL ?? "https://auth.mobiauto.com.br/auth/realms/mobiauto/protocol/openid-connect").replace(/\/$/, "");
const apiBase = () => (process.env.MOBIAUTO_API_URL ?? "https://open-api.mobiauto.com.br").replace(/\/$/, "");

export type AppMobiauto = { clientId: string; clientSecret: string; redirectUri: string };

export function appMobiautoDoAmbiente(base = process.env.NEXTAUTH_URL): AppMobiauto | null {
  const clientId = process.env.MOBIAUTO_CLIENT_ID;
  const clientSecret = process.env.MOBIAUTO_CLIENT_SECRET;
  if (!clientId || !clientSecret || !base) return null;
  return { clientId, clientSecret, redirectUri: `${base.replace(/\/$/, "")}/api/portais/mobiauto/retorno` };
}

export class ErroMobiauto extends Error {
  constructor(message: string, readonly http?: number) {
    super(message);
    this.name = "ErroMobiauto";
  }
  /** O acesso foi recusado (token revogado, sem permissão na loja): a loja precisa reconectar. */
  get semPermissao() {
    return this.http === 401 || this.http === 403;
  }
}

export type TokensMobiauto = { access: string; refresh: string; expiraEm: number };

async function pedirToken(corpo: Record<string, string>): Promise<TokensMobiauto> {
  let r: Response;
  try {
    r = await fetch(`${authBase()}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(corpo), signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ErroMobiauto("A MobiAuto não respondeu");
  }
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new ErroMobiauto(`A MobiAuto recusou o acesso${j?.error_description ? `: ${String(j.error_description).slice(0, 150)}` : ""}`, r.status === 400 ? 401 : r.status);
  return { access: j.access_token, refresh: j.refresh_token ?? corpo.refresh_token ?? "", expiraEm: Date.now() + Number(j.expires_in ?? 300) * 1000 };
}

export function urlDeAutorizacaoMobiauto(app: AppMobiauto, estado: string): string {
  const q = new URLSearchParams({ client_id: app.clientId, redirect_uri: app.redirectUri, response_type: "code", scope: "openid", state: estado });
  return `${authBase()}/auth?${q}`;
}

export const trocarCodigoMobiauto = (app: AppMobiauto, code: string) => pedirToken({ grant_type: "authorization_code", client_id: app.clientId, client_secret: app.clientSecret, redirect_uri: app.redirectUri, code });
export const renovarTokensMobiauto = (app: AppMobiauto, refresh: string) => pedirToken({ grant_type: "refresh_token", client_id: app.clientId, client_secret: app.clientSecret, refresh_token: refresh });

export type ItemMobi = { id: number; nome: string; inicio?: number; fim?: number };
export type PlanoMobi = { id: string; nome: string; total: number; disponiveis: number; usados: number };

/** O anúncio (deal) no Mobigestor: só os campos que o Zap lê ou escreve. */
export type DealMobi = {
  id?: number;
  vehicleType: "CAR";
  stockKind: "USED";
  makeName?: string;
  modelName?: string;
  trimId: number;
  trimName?: string;
  modelYear: number;
  productionYear: number;
  km: number;
  plate?: string;
  price: number;
  colorId: number;
  fuelId: number;
  transmissionId: number;
  doors: number;
  description?: string;
  featureIds?: number[];
  localityId?: number;
};

export type DealExistente = { id: number; placa: string; publicado: boolean; km: number; preco: number };

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const item = (x: any): ItemMobi => ({ id: Number(x.id), nome: texto(x.name ?? x.description ?? x.label), inicio: x.initialYear ? Number(x.initialYear) : undefined, fim: x.finalYear ? Number(x.finalYear) : undefined });

/** Uma sessão com a MobiAuto para uma loja (dealer). Renova o token sozinha e avisa quem guarda (onTokens). */
export class SessaoMobiauto {
  constructor(
    private tokens: TokensMobiauto,
    readonly dealerId: string,
    private readonly app: AppMobiauto,
    private readonly onTokens?: (t: TokensMobiauto) => Promise<void> | void,
  ) {}

  private async renovar() {
    if (!this.tokens.refresh) throw new ErroMobiauto("A MobiAuto pede que a conta seja reconectada", 401);
    this.tokens = await renovarTokensMobiauto(this.app, this.tokens.refresh);
    await this.onTokens?.(this.tokens);
  }

  private async req<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    if (this.tokens.expiraEm - Date.now() < 60_000) await this.renovar();
    for (let tentativa = 0; ; tentativa++) {
      let r: Response;
      try {
        r = await fetch(`${apiBase()}${caminho}`, {
          method: metodo,
          headers: { Authorization: `Bearer ${this.tokens.access}`, ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}) },
          body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
          signal: AbortSignal.timeout(30_000),
        });
      } catch {
        throw new ErroMobiauto("A MobiAuto não respondeu");
      }
      if (r.status === 401 && tentativa === 0) {
        await this.renovar();
        continue;
      }
      const t = await r.text();
      if (!r.ok) throw new ErroMobiauto(`A MobiAuto respondeu ${r.status}${t ? `: ${t.slice(0, 200)}` : ""}`, r.status);
      if (!t) return undefined as T;
      try {
        return JSON.parse(t) as T;
      } catch {
        return t as unknown as T;
      }
    }
  }

  private d = (resto: string) => `/api/dealer/${encodeURIComponent(this.dealerId)}${resto}`;

  // ---- catálogo ----
  async marcas() { return ((await this.req<any[]>("GET", "/api/vehicle/v1.0/makes/CAR")) ?? []).map(item); }
  async modelos(marca: number) { return ((await this.req<any[]>("GET", `/api/vehicle/v1.0/models/CAR/${marca}`)) ?? []).map(item); }
  async versoes(modelo: number) { return ((await this.req<any[]>("GET", `/api/vehicle/v1.0/trims/CAR/${modelo}`)) ?? []).map(item); }
  async cores() { return ((await this.req<any[]>("GET", "/api/vehicle/v1.0/colors")) ?? []).map(item); }
  async combustiveis() { return ((await this.req<any[]>("GET", "/api/vehicle/v1.0/fuels")) ?? []).map(item); }
  async cambios() { return ((await this.req<any[]>("GET", "/api/vehicle/v1.0/transmissions")) ?? []).map(item); }
  async opcionais() { return ((await this.req<any[]>("GET", "/api/vehicle/v1.1/features/CAR")) ?? []).map(item); }

  /** A loja (dealer) e os planos de publicação dela. */
  async lojas(): Promise<{ id: string; nome: string; cnpj: string }[]> {
    return ((await this.req<any[]>("GET", "/api/dealer/v1.0/dealers")) ?? []).map((l) => ({ id: texto(l.id), nome: texto(l.name), cnpj: texto(l.cnpj) }));
  }
  async planos(): Promise<PlanoMobi[]> {
    return ((await this.req<any[]>("GET", this.d("/plans"))) ?? []).map((p) => ({ id: texto(p.dealPlanId), nome: texto(p.name), total: Number(p.quantity ?? 0), disponiveis: Number(p.quantityAvailable ?? 0), usados: Number(p.quantityUsed ?? 0) }));
  }
  async localidades(): Promise<number[]> {
    return ((await this.req<any[]>("GET", this.d("/locality"))) ?? []).map((l) => Number(l.id)).filter(Number.isFinite);
  }

  // ---- estoque ----
  /** Todos os deals da loja (paginado), para adotar o que já existe pela placa. */
  async estoque(): Promise<DealExistente[]> {
    const tamanho = 100;
    const vistos = new Map<number, DealExistente>();
    for (let pagina = 0; pagina < 50; pagina++) {
      const lote = (await this.req<any[]>("GET", this.d(`/inventory/v1.0?page=${pagina}&size=${tamanho}`))) ?? [];
      const novos = lote.filter((x) => Number.isFinite(Number(x.id)) && !vistos.has(Number(x.id)));
      for (const x of novos) vistos.set(Number(x.id), { id: Number(x.id), placa: texto(x.plate).toUpperCase().replace(/[^A-Z0-9]/g, ""), publicado: Array.isArray(x.publishes) && x.publishes.length > 0, km: Number(x.km ?? 0), preco: Number(x.price ?? 0) });
      // Sem itens novos (fim da lista, ou a API ignorou a página): para.
      if (!novos.length || lote.length < tamanho) break;
    }
    return [...vistos.values()];
  }
  async criar(d: DealMobi): Promise<number> {
    const r = await this.req<any>("POST", this.d("/inventory/v1.0"), d);
    const id = Number(r?.id);
    if (!Number.isFinite(id) || id <= 0) throw new ErroMobiauto("A MobiAuto não devolveu o código do anúncio");
    return id;
  }
  async atualizar(id: number, d: DealMobi) { await this.req("PUT", this.d(`/inventory/v1.0/${id}`), { ...d, id }); }
  async excluir(id: number) { await this.req("DELETE", this.d(`/inventory/v1.0/${id}`)); }
  async publicar(id: number, plano: string) { await this.req("PUT", `/api/publish/v1.0/dealer/${encodeURIComponent(this.dealerId)}/deal/${id}/publish?planId=${encodeURIComponent(plano)}`); }
  async despublicar(id: number) { await this.req("PUT", `/api/publish/v1.0/dealer/${encodeURIComponent(this.dealerId)}/deal/${id}/unpublish`); }

  // ---- fotos ----
  async fotos(id: number): Promise<{ id: number; posicao: number }[]> {
    return ((await this.req<any[]>("GET", this.d(`/inventory/v1.0/${id}/image`))) ?? []).map((f) => ({ id: Number(f.imageId ?? f.id), posicao: Number(f.position ?? 0) }));
  }
  async adicionarFotos(id: number, urls: string[]) { if (urls.length) await this.req("POST", this.d(`/inventory/v1.0/${id}/image`), urls.map((url, i) => ({ url, position: i }))); }
  async excluirFoto(id: number, imagem: number) { await this.req("DELETE", this.d(`/inventory/v1.0/${id}/image/${imagem}`)); }
}
