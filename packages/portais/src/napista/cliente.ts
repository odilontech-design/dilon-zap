/**
 * Cliente da API de integradores do NaPista (seller-inventory-api): anúncios (offers), fotos,
 * catálogo e leads. Escrito a partir da documentação oficial (developers.napista.com.br).
 * Autenticação OAuth2 por código de autorização (Keycloak, realm marketplace-dealer), com
 * cliente PÚBLICO: só `client_id` e URL de retorno, sem segredo. O lojista entra com o mesmo
 * usuário e senha do NaPista e autoriza o integrador; guardamos o token e o de renovação.
 *
 * Ambientes: `NAPISTA_AMBIENTE=development` usa os endereços de desenvolvimento do NaPista;
 * sem a variável, produção. `NAPISTA_API_URL` e `NAPISTA_AUTH_URL` trocam os endereços (testes).
 */

const dev = () => process.env.NAPISTA_AMBIENTE === "development";
/** Em que NaPista o Zap está falando agora. A conexão da loja guarda o ambiente em que foi feita. */
export const ambienteDoNapista = (): "development" | "production" => (dev() ? "development" : "production");
const authBase = () => (process.env.NAPISTA_AUTH_URL || `https://auth.${dev() ? "development." : ""}napista.com.br/realms/marketplace-dealer/protocol/openid-connect`).replace(/\/$/, "");
export const baseDoNapista = () => (process.env.NAPISTA_API_URL || `https://api.${dev() ? "development." : ""}napista.com.br/seller-inventory-api`).replace(/\/$/, "");
const apiBase = baseDoNapista;

export type AppNapista = { clientId: string; redirectUri: string };

export function appNapistaDoAmbiente(base = process.env.NEXTAUTH_URL): AppNapista | null {
  const clientId = process.env.NAPISTA_CLIENT_ID;
  if (!clientId || !base) return null;
  return { clientId, redirectUri: `${base.replace(/\/$/, "")}/api/portais/napista/retorno` };
}

export class ErroNapista extends Error {
  constructor(message: string, readonly http?: number) {
    super(message);
    this.name = "ErroNapista";
  }
  /** Acesso recusado (token revogado, sem permissão na loja): a loja precisa reconectar. */
  get semPermissao() {
    return this.http === 401 || this.http === 403;
  }
}

export type TokensNapista = { access: string; refresh: string; expiraEm: number };

async function pedirToken(corpo: Record<string, string>): Promise<TokensNapista> {
  let r: Response;
  try {
    r = await fetch(`${authBase()}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(corpo), signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new ErroNapista("O NaPista não respondeu");
  }
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) throw new ErroNapista(`O NaPista recusou o acesso${j?.error_description ? `: ${String(j.error_description).slice(0, 150)}` : ""}`, r.status === 400 ? 401 : r.status);
  return { access: j.access_token, refresh: j.refresh_token ?? corpo.refresh_token ?? "", expiraEm: Date.now() + Number(j.expires_in ?? 300) * 1000 };
}

export function urlDeAutorizacaoNapista(app: AppNapista, estado: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: app.clientId, redirect_uri: app.redirectUri, state: estado });
  return `${authBase()}/auth?${q}`;
}
export const trocarCodigoNapista = (app: AppNapista, code: string) => pedirToken({ grant_type: "authorization_code", client_id: app.clientId, code, redirect_uri: app.redirectUri });
export const renovarTokensNapista = (app: AppNapista, refresh: string) => pedirToken({ grant_type: "refresh_token", client_id: app.clientId, refresh_token: refresh });

export type ItemNapista = { id: string; nome: string };
export type StatusOferta = "PUBLISHED" | "DRAFT" | "UNPUBLISHED" | "SOLD" | "DELETED";

/** O anúncio (offer) como o NaPista recebe. Preço e km são inteiros. */
export type OfertaNapista = {
  versionId: string;
  modelYear: number;
  manufacturedYear: number;
  /** Opcional na API do NaPista: sem km informada, vai sem este campo (nunca um número inventado). */
  mileage?: number;
  price: number;
  plate?: string;
  fuelType: string;
  color: string;
  transmissionType: "MANUAL" | "AUTOMATIC";
  numberOfDoors?: number;
  description?: string;
  equipments?: string[];
  armoured?: boolean;
  status?: StatusOferta;
};

/** Os valores válidos que o NaPista aceita para cor, combustível, câmbio e equipamentos (`/catalog/attributes`). */
export type AtributosNapista = { cores: ItemNapista[]; combustiveis: ItemNapista[]; cambios: ItemNapista[]; equipamentos: ItemNapista[] };

export type OfertaExistente = { id: string; placa: string; status: StatusOferta; km: number; preco: number };

export type LeadNapista = {
  id: string;
  nome: string;
  email: string | null;
  /** DDD + número, só dígitos (sem o 55). */
  telefone: string | null;
  versao: string;
  mensagem: string;
  placa: string | null;
  atualizadoEm: Date;
  entradaCents: number | null;
  parcelas: number | null;
  credito: string | null;
};

const texto = (v: unknown) => (v === undefined || v === null ? "" : String(v));
const itens = (r: any): ItemNapista[] => (Array.isArray(r?.items) ? r.items : []).map((x: any) => ({ id: texto(x.id), nome: texto(x.name) })).filter((x: ItemNapista) => x.id);

/** Uma sessão com o NaPista para uma loja (seller). Renova o token sozinha e avisa quem guarda (onTokens). */
export class SessaoNapista {
  constructor(
    private tokens: TokensNapista,
    readonly sellerId: string,
    private readonly app: AppNapista,
    private readonly onTokens?: (t: TokensNapista) => Promise<void> | void,
  ) {}

  private async renovar() {
    if (!this.tokens.refresh) throw new ErroNapista("O NaPista pede que a conta seja reconectada", 401);
    this.tokens = await renovarTokensNapista(this.app, this.tokens.refresh);
    await this.onTokens?.(this.tokens);
  }

  private async req<T = any>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    if (this.tokens.expiraEm - Date.now() < 60_000) await this.renovar();
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
        throw new ErroNapista("O NaPista não respondeu");
      }
      if (r.status === 401 && tentativa === 0) {
        await this.renovar();
        continue;
      }
      const t = await r.text();
      if (!r.ok) throw new ErroNapista(`O NaPista respondeu ${r.status}${t ? `: ${t.slice(0, 200)}` : ""}`, r.status);
      if (!t) return undefined as T;
      try {
        return JSON.parse(t) as T;
      } catch {
        return t as unknown as T;
      }
    }
  }

  private s = (resto: string) => `/seller/${encodeURIComponent(this.sellerId)}${resto}`;

  /** As lojas que o usuário autorizado gerencia (o sellerId vai em todas as operações de anúncio). */
  async lojas(): Promise<{ id: string; nome: string; documento: string }[]> {
    const r = await this.req<any>("GET", "/seller/access");
    return (Array.isArray(r?.sellers) ? r.sellers : []).map((l: any) => ({ id: texto(l.sellerId), nome: texto(l.name), documento: texto(l.sellerDocument) })).filter((l: { id: string }) => l.id);
  }

  // ---- catálogo ----
  async marcas() { return itens(await this.req("GET", "/catalog/makes/CAR")); }
  async modelos(marca: string, anoModelo?: number) { return itens(await this.req("GET", `/catalog/CAR/make/${encodeURIComponent(marca)}/models${anoModelo ? `?modelYear=${anoModelo}` : ""}`)); }
  async versoes(modelo: string, anoModelo?: number) { return itens(await this.req("GET", `/catalog/versions/CAR?modelId=${encodeURIComponent(modelo)}${anoModelo ? `&modelYear=${anoModelo}` : ""}`)); }

  // ---- anúncios ----
  /** Os anúncios da loja num status (paginado), para adotar o que já existe pela placa. */
  async ofertas(status: StatusOferta): Promise<OfertaExistente[]> {
    const todos: OfertaExistente[] = [];
    for (let pagina = 0; pagina < 50; pagina++) {
      const r = await this.req<any>("GET", this.s(`/offers?status=${status}&page=${pagina}&limit=100`));
      const lote: any[] = Array.isArray(r?.pageData) ? r.pageData : [];
      for (const o of lote) if (o?.id) todos.push({ id: texto(o.id), placa: texto(o.plate).toUpperCase().replace(/[^A-Z0-9]/g, ""), status: (o.status ?? status) as StatusOferta, km: Number(o.mileage ?? 0), preco: Number(o.price ?? 0) });
      if (!lote.length || pagina + 1 >= Number(r?.totalPages ?? 1)) break;
    }
    return todos;
  }
  async criar(o: OfertaNapista): Promise<string> {
    const r = await this.req<any>("POST", this.s("/offer"), o);
    const id = texto(r?.id);
    if (!id) throw new ErroNapista("O NaPista não devolveu o código do anúncio");
    return id;
  }
  async atualizar(id: string, o: OfertaNapista) { await this.req("PATCH", this.s(`/offer/${encodeURIComponent(id)}`), o); }
  async mudarStatus(id: string, status: StatusOferta) { await this.req("PUT", this.s(`/offer/${encodeURIComponent(id)}/${status}`)); }
  async excluir(id: string) { await this.req("DELETE", this.s(`/offer/${encodeURIComponent(id)}`)); }
  /** Os valores aceitos de cor, combustível, câmbio e equipamentos. A lista é do NaPista: nunca assumimos os códigos. */
  async atributos(categoria: "CAR" | "MOTORCYCLE" | "TRUCK" = "CAR"): Promise<AtributosNapista> {
    const r = await this.req<any>("GET", `/catalog/attributes?category=${categoria}`);
    const grupo = (re: RegExp) => {
      const chave = Object.keys(r ?? {}).find((k) => re.test(k));
      return chave ? itens(r[chave]) : [];
    };
    return { cores: grupo(/color/i), combustiveis: grupo(/fuel/i), cambios: grupo(/transmission|gear/i), equipamentos: grupo(/equip/i) };
  }
  /** O anúncio como está no NaPista: o status e quantas fotos tem agora. */
  async oferta(id: string): Promise<{ status: StatusOferta | null; fotos: number }> {
    const r = await this.req<any>("GET", this.s(`/offer/${encodeURIComponent(id)}`));
    return { status: typeof r?.status === "string" ? (r.status as StatusOferta) : null, fotos: Array.isArray(r?.photos) ? r.photos.length : 0 };
  }
  /** O item deste anúncio como aparece na LISTA de anúncios (pode trazer campos que a leitura individual não traz). Para diagnóstico. */
  async ofertaNaListaBruta(id: string, status: StatusOferta = "PUBLISHED"): Promise<any | null> {
    for (let pagina = 0; pagina < 50; pagina++) {
      const r = await this.req<any>("GET", this.s(`/offers?status=${status}&page=${pagina}&limit=100`));
      const lote: any[] = Array.isArray(r?.pageData) ? r.pageData : [];
      const achado = lote.find((o) => texto(o?.id) === id);
      if (achado) return achado;
      if (!lote.length || pagina + 1 >= Number(r?.totalPages ?? 1)) return null;
    }
    return null;
  }
  /** A loja como o NaPista devolve em /seller/access (todos os campos), para diagnóstico. */
  async lojaBruta(): Promise<any | null> {
    const r = await this.req<any>("GET", "/seller/access");
    return (Array.isArray(r?.sellers) ? r.sellers : []).find((l: any) => texto(l?.sellerId) === this.sellerId) ?? null;
  }
  /** O anúncio exatamente como o NaPista devolve, para diagnóstico (o que ele mostra do anúncio e se há endereço público). */
  async ofertaBruta(id: string): Promise<any> {
    return this.req<any>("GET", this.s(`/offer/${encodeURIComponent(id)}`));
  }
  /** Apaga todas as fotos do anúncio (as fotos por endereço SOMAM às que já estão lá). Anúncio sem foto não é erro. */
  async apagarFotos(id: string) {
    try {
      await this.req("DELETE", this.s(`/offer/${encodeURIComponent(id)}/photos`));
    } catch (e) {
      if (!(e instanceof ErroNapista && e.http === 404)) throw e;
    }
  }
  /** ACRESCENTA estas fotos ao anúncio, na ordem (o NaPista baixa pelos endereços e SOMA às que já existem: apague antes para deixar só estas). */
  async fotosPorUrl(id: string, urls: string[]) { await this.req("POST", this.s(`/offer/${encodeURIComponent(id)}/photos/url`), { list: urls.map((url, i) => ({ url, order: i })) }); }

  // ---- leads ----
  /** Os contatos de compradores num intervalo de datas (aaaa-mm-dd), todas as páginas. */
  async leads(inicio: string, fim: string): Promise<LeadNapista[]> {
    const todos: LeadNapista[] = [];
    for (let pagina = 1; pagina <= 20; pagina++) {
      const r = await this.req<any>("GET", this.s(`/leads?page=${pagina}&size=200&initialDate=${inicio}&endDate=${fim}`));
      const lote: any[] = Array.isArray(r?.pageData) ? r.pageData : [];
      for (const l of lote) {
        if (!l?.id) continue;
        const tel = `${texto(l.clientPhone?.areaCode)}${texto(l.clientPhone?.number)}`.replace(/\D/g, "");
        const quando = new Date(l.updatedAt);
        todos.push({
          id: texto(l.id),
          nome: texto(l.clientName) || "Contato do NaPista",
          email: texto(l.clientEmail).toLowerCase() || null,
          telefone: tel.length >= 10 ? tel : null,
          versao: texto(l.vehicleVersion),
          mensagem: texto(l.contactMessage),
          placa: texto(l.vehiclePlate).toUpperCase().replace(/[^A-Z0-9]/g, "") || null,
          atualizadoEm: Number.isNaN(quando.getTime()) ? new Date() : quando,
          entradaCents: typeof l.upfrontValue === "number" ? Math.round(l.upfrontValue * 100) : null,
          parcelas: typeof l.installments === "number" ? l.installments : null,
          credito: texto(l.clientCreditStatus) || null,
        });
      }
      if (!lote.length || pagina >= Number(r?.totalPages ?? 1)) break;
    }
    return todos;
  }
}
