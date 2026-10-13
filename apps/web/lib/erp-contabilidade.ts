/**
 * Cliente da API de plataforma do Dilon Contabilidade (/api/plataforma/*).
 *
 * O ERP é outro sistema, em outro servidor e com outro banco; o Zap só conversa
 * com ele por esta API, com um token longo guardado no ambiente. Falha de rede
 * ou do ERP nunca é engolida em silêncio: vira um erro com mensagem que o painel
 * mostra, e o estado local só muda depois que o ERP confirmou.
 */

export type ErpUso = { empresasAtivas: number; usuariosEquipe: number; acessosPortal: number; ultimaAtividadeEm: string | null };

export type ErpEscritorio = {
  id: string;
  slug: string;
  nome: string;
  zapTenantId: string | null;
  ativo: boolean;
  suspensoEm: string | null;
  suspensoMotivo: string | null;
  limiteEmpresas: number | null;
  limiteUsuarios: number | null;
  urlLogin: string;
  uso: ErpUso;
};

export class ErpIndisponivelError extends Error {
  constructor(mensagem: string, readonly status?: number) {
    super(mensagem);
    this.name = "ErpIndisponivelError";
  }
}

export function erpConfigurado(): boolean {
  return Boolean(process.env.ERP_CONTABILIDADE_URL && (process.env.ERP_CONTABILIDADE_TOKEN ?? "").length >= 32);
}

async function chamar<T>(metodo: "GET" | "POST" | "PATCH", caminho: string, corpo?: unknown): Promise<{ status: number; json: T }> {
  const base = (process.env.ERP_CONTABILIDADE_URL ?? "").replace(/\/+$/, "");
  const token = process.env.ERP_CONTABILIDADE_TOKEN ?? "";
  if (!base || token.length < 32) throw new ErpIndisponivelError("A integração com o ERP não está configurada neste ambiente (ERP_CONTABILIDADE_URL / ERP_CONTABILIDADE_TOKEN).");
  let resp: Response;
  try {
    resp = await fetch(`${base}/api/plataforma${caminho}`, {
      method: metodo,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    throw new ErpIndisponivelError(e instanceof Error && e.name === "TimeoutError" ? "O ERP não respondeu a tempo." : "Não foi possível falar com o ERP.");
  }
  const json = (await resp.json().catch(() => null)) as T;
  if (resp.status === 401) throw new ErpIndisponivelError("O ERP recusou o token de integração. Confira ERP_CONTABILIDADE_TOKEN.", 401);
  if (resp.status === 503) throw new ErpIndisponivelError("A API de plataforma está desativada no ERP (falta PLATAFORMA_API_TOKEN lá).", 503);
  return { status: resp.status, json };
}

const mensagemDe = (j: unknown, padrao: string) => (j && typeof j === "object" && "erro" in j && typeof (j as { erro: unknown }).erro === "string" ? (j as { erro: string }).erro : padrao);

export async function testarLigacao(): Promise<void> {
  const r = await chamar<{ ok?: boolean }>("GET", "/saude");
  if (r.status !== 200 || !r.json?.ok) throw new ErpIndisponivelError("O ERP respondeu de forma inesperada.", r.status);
}

export async function criarEscritorio(dados: {
  zapTenantId: string; nome: string; slug?: string; adminNome: string; adminEmail: string; limiteEmpresas: number | null; limiteUsuarios: number | null;
}): Promise<{ criado: boolean; escritorio: ErpEscritorio; admin?: { email: string; nome: string; senhaProvisoria: string } }> {
  const r = await chamar<{ criado: boolean; escritorio: ErpEscritorio; admin?: { email: string; nome: string; senhaProvisoria: string }; erro?: string }>("POST", "/escritorios", dados);
  if (r.status !== 200 && r.status !== 201) throw new ErpIndisponivelError(mensagemDe(r.json, "O ERP não conseguiu criar o escritório."), r.status);
  return r.json;
}

export async function consultarEscritorio(zapTenantId: string): Promise<ErpEscritorio | null> {
  const r = await chamar<{ escritorio: ErpEscritorio }>("GET", `/escritorios/${encodeURIComponent(zapTenantId)}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new ErpIndisponivelError(mensagemDe(r.json, "O ERP não respondeu como esperado."), r.status);
  return r.json.escritorio;
}

export async function atualizarEscritorio(
  zapTenantId: string,
  mudancas: Partial<{ nome: string; limiteEmpresas: number | null; limiteUsuarios: number | null; ativo: boolean; motivo: string }>,
): Promise<ErpEscritorio> {
  const r = await chamar<{ escritorio: ErpEscritorio }>("PATCH", `/escritorios/${encodeURIComponent(zapTenantId)}`, mudancas);
  if (r.status !== 200) throw new ErpIndisponivelError(mensagemDe(r.json, "O ERP não aceitou a alteração."), r.status);
  return r.json.escritorio;
}

export async function redefinirSenha(zapTenantId: string, email: string): Promise<{ email: string; nome: string; senhaProvisoria: string }> {
  const r = await chamar<{ email: string; nome: string; senhaProvisoria: string }>("POST", `/escritorios/${encodeURIComponent(zapTenantId)}/redefinir-senha`, { email });
  if (r.status !== 200) throw new ErpIndisponivelError(mensagemDe(r.json, "O ERP não redefiniu a senha."), r.status);
  return r.json;
}
