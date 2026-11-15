import { z } from "zod";

/**
 * Painel "Site": os números do e-commerce da empresa (Believe, 13/11), vindos do site dela por uma rota de
 * leitura protegida por chave. Contrato v1 fechado com a sessão do site:
 *
 *   GET <url do site>/api/integracao/painel?de=AAAA-MM-DD&ate=AAAA-MM-DD
 *   Authorization: Bearer <chave>
 *
 * Dinheiro sempre em centavos inteiros; conversão em pontos-base (2500 = 25%); de/ate inclusivos, em Brasília,
 * no máximo 366 dias; sem dado pessoal de cliente. Erros do site: 401 chave, 400 período, 500 falha, sempre
 * { "error": "..." }.
 *
 * Este arquivo é puro (sem banco e sem "@/"): a validação do contrato, a proteção do endereço, o período, o cache
 * e o tratamento do site fora do ar, com o fetch e a resolução de DNS injetáveis para teste. A chave guardada e a
 * rota ficam em painel-ecommerce-config.ts e em /api/painel-ecommerce.
 */

export const CAMINHO_DO_PAINEL = "/api/integracao/painel";
export const MAX_DIAS = 366;
export const TTL_FRESCO_MS = 5 * 60_000;
const TTL_VELHO_MS = 24 * 60 * 60_000; // por quanto tempo um resultado antigo ainda serve de reserva se o site cair
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_500_000;

export class ErroDoPainel extends Error {
  constructor(message: string, public status: number = 502) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// O contrato v1. Tolerante com o que sobra (campo novo do site não derruba a tela) e com o que falta (vira 0).
// ---------------------------------------------------------------------------

const n = z.number().finite().default(0);
const lista = <T extends z.ZodTypeAny>(t: T) => z.array(t).default([]);
const avisosDoCanal = z.object({ enviados: n, falhas: n, pulados: n }).passthrough().default({});

export const painelSchema = z
  .object({
    versao: z.literal(1),
    periodo: z.object({ de: z.string(), ate: z.string() }),
    geradoEm: z.string(),
    vendas: z
      .object({
        faturamentoCents: n,
        pedidosPagos: n,
        ticketMedioCents: n,
        freteCents: n,
        descontos: z.object({ comboCents: n, cupomCents: n, indicacaoCents: n, cashbackCents: n }).passthrough().default({}),
      })
      .passthrough()
      .default({}),
    funil: z.object({ pedidosIniciados: n, pagos: n, aguardandoPagamento: n, cancelados: n, conversaoBps: n }).passthrough().default({}),
    carrinhoAbandonado: z
      .object({ lembrete1Enviados: n, lembrete2Enviados: n, pedidosLembrados: n, recuperados: n, valorRecuperadoCents: n })
      .passthrough()
      .default({}),
    statusAtual: z.object({ pagoAguardandoSeparacao: n, emSeparacao: n, enviado: n }).passthrough().default({}),
    produtos: z
      .object({
        maisVendidos: lista(z.object({ nome: z.string(), ingresso: z.coerce.boolean().default(false), quantidade: n, valorCents: n }).passthrough()),
        semEstoque: lista(z.string()),
      })
      .passthrough()
      .default({}),
    cupons: z
      .object({
        porCupom: lista(z.object({ codigo: z.string(), pedidos: n, descontoCents: n, faturamentoCents: n }).passthrough()),
        combo: z.object({ pedidos: n, descontoCents: n }).passthrough().default({}),
      })
      .passthrough()
      .default({}),
    indicacao: z
      .object({
        pedidos: n,
        valorCents: n,
        comissoesCents: n,
        topAfiliadas: lista(z.object({ codigo: z.string(), nome: z.string().default(""), pedidos: n, valorCents: n, comissaoCents: n }).passthrough()),
      })
      .passthrough()
      .default({}),
    clientes: z
      .object({ novasCadastradas: n, novasCabeleireiras: n, compradoras: n, compradorasNovas: n, compradorasRecorrentes: n })
      .passthrough()
      .default({}),
    avisos: z.object({ email: avisosDoCanal, whatsapp: avisosDoCanal }).passthrough().default({}),
    serieDiaria: lista(z.object({ dia: z.string(), faturamentoCents: n, pedidos: n }).passthrough()),
  })
  .passthrough();

export type PainelV1 = z.infer<typeof painelSchema>;

/** Valida o JSON do site contra o contrato. Mensagem curta, sem repetir o que o site mandou. */
export function lerPainel(bruto: unknown): PainelV1 {
  const versao = (bruto as { versao?: unknown } | null)?.versao;
  if (versao !== undefined && versao !== 1) throw new ErroDoPainel(`O site respondeu na versão ${String(versao)} do painel; esta tela entende a versão 1.`, 502);
  const r = painelSchema.safeParse(bruto);
  if (!r.success) throw new ErroDoPainel("O site respondeu em um formato que a tela não entende.", 502);
  return r.data;
}

// ---------------------------------------------------------------------------
// Período
// ---------------------------------------------------------------------------

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const meiaNoite = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** Confere de/ate: formato, datas que existem, de ≤ ate, no máximo 366 dias. Devolve o motivo ou null. */
export function motivoDePeriodoInvalido(de: string | null | undefined, ate: string | null | undefined): string | null {
  if (!de || !ate || !DIA.test(de) || !DIA.test(ate)) return "informe o período no formato AAAA-MM-DD";
  const a = meiaNoite(de);
  const b = meiaNoite(ate);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a.toISOString().slice(0, 10) !== de || b.toISOString().slice(0, 10) !== ate) return "data inexistente";
  if (a > b) return "a data inicial é depois da final";
  const dias = Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
  if (dias > MAX_DIAS) return `o período pode ter no máximo ${MAX_DIAS} dias`;
  return null;
}

// ---------------------------------------------------------------------------
// Endereço do site: só https, com nome de domínio. O servidor do Zap faz a chamada, então ele não pode ser usado
// para alcançar a rede interna (o endereço é cadastrado pelo Super Admin, mas a defesa não depende disso).
// ---------------------------------------------------------------------------

/** Endereços que nunca podem ser chamados: loopback, privados, link-local, CGNAT, multicast, reservados. */
export function enderecoPrivado(ip: string): boolean {
  const v = ip.trim().toLowerCase();
  const v4 = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (v.includes(":")) {
    return v === "::" || v === "::1" || /^f[cd][0-9a-f]{2}:/.test(v) || /^fe[89ab][0-9a-f]:/.test(v) || v.startsWith("ff");
  }
  return false;
}

/** Normaliza o endereço do site para "https://dominio" ou devolve o motivo de não servir. */
export function urlDoSite(entrada: string): { ok: true; base: string } | { ok: false; erro: string } {
  let u: URL;
  try {
    u = new URL(entrada.trim());
  } catch {
    return { ok: false, erro: "Endereço inválido. Exemplo: https://minhaloja.com.br" };
  }
  if (u.protocol !== "https:") return { ok: false, erro: "O endereço precisa começar com https://" };
  if (u.username || u.password) return { ok: false, erro: "O endereço não pode ter usuário nem senha." };
  if (u.port && u.port !== "443") return { ok: false, erro: "Use o endereço sem porta." };
  const host = u.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return { ok: false, erro: "Use o nome do site, e não o número de IP." };
  if (host === "localhost" || !host.includes(".") || /\.(local|localhost|internal|localdomain|lan|home|corp)$/.test(host)) return { ok: false, erro: "Esse endereço não é um site público." };
  return { ok: true, base: `https://${host}` };
}

export type Resolver = (host: string) => Promise<string[]>;

async function resolverPadrao(host: string): Promise<string[]> {
  const { lookup } = await import("node:dns/promises");
  return (await lookup(host, { all: true })).map((a) => a.address);
}

// ---------------------------------------------------------------------------
// Busca no site, com cache de 5 minutos e reserva quando o site cai
// ---------------------------------------------------------------------------

export type Origem = "site" | "cache" | "reserva";
export type ResultadoPainel = {
  dados: PainelV1;
  /** Quando estes números foram buscados no site (ms). */
  buscadoEm: number;
  origem: Origem;
  /** Só na "reserva": por que não deu para atualizar. */
  erro?: string;
};

type Entrada = { em: number; dados: PainelV1 };
const cache = new Map<string, Entrada>();
const emVoo = new Map<string, Promise<ResultadoPainel>>();

export function limparCacheDoPainel(): void {
  cache.clear();
  emVoo.clear();
}

type Opcoes = { fetchFn?: typeof fetch; resolver?: Resolver; agora?: () => number };

/** Uma chamada ao site, sem cache. Lança ErroDoPainel com mensagem para a pessoa (nunca com a chave). */
export async function chamarSite(cfg: { url: string; chave: string }, de: string, ate: string, o: Opcoes = {}): Promise<PainelV1> {
  const u = urlDoSite(cfg.url);
  if (!u.ok) throw new ErroDoPainel(u.erro, 400);
  const motivo = motivoDePeriodoInvalido(de, ate);
  if (motivo) throw new ErroDoPainel(motivo, 400);

  // Confere para onde o nome aponta AGORA, na hora de chamar.
  const host = new URL(u.base).hostname;
  let enderecos: string[];
  try {
    enderecos = await (o.resolver ?? resolverPadrao)(host);
  } catch {
    throw new ErroDoPainel("Não encontrei esse site na internet. Confira o endereço.", 502);
  }
  if (enderecos.length === 0 || enderecos.some(enderecoPrivado)) throw new ErroDoPainel("Esse endereço aponta para uma rede interna e não pode ser usado.", 400);

  const url = `${u.base}${CAMINHO_DO_PAINEL}?de=${de}&ate=${ate}`;
  let r: Response;
  try {
    r = await (o.fetchFn ?? fetch)(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${cfg.chave}`, Accept: "application/json" },
      redirect: "error", // um redirecionamento poderia levar a chave para outro endereço
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    const limite = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ErroDoPainel(limite ? "O site demorou demais para responder." : "O site não respondeu.", 504);
  }

  if (r.status === 401) throw new ErroDoPainel("O site recusou a chave (401). Confira a chave no cadastro da empresa.", 502);
  if (r.status === 400) throw new ErroDoPainel("O site recusou o período pedido.", 400);
  if (!r.ok) throw new ErroDoPainel(`O site respondeu com erro (${r.status}).`, 502);

  const texto = await r.text().catch(() => "");
  if (texto.length > MAX_BYTES) throw new ErroDoPainel("A resposta do site veio grande demais.", 502);
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErroDoPainel("O site respondeu em um formato que a tela não entende.", 502);
  }
  return lerPainel(json);
}

/**
 * Os números do período, com cache de 5 minutos por empresa e período. Se o site cair e houver um resultado
 * antigo (até 24 h), devolve esse resultado marcado como "reserva", com o motivo: a tela mostra "dados das HH:MM"
 * em vez de quebrar. Sem reserva, o erro sobe e a tela mostra só o aviso. Pedidos iguais ao mesmo tempo viram um.
 */
export async function buscarPainel(
  cfg: { tenantId: string; url: string; chave: string },
  de: string,
  ate: string,
  o: Opcoes = {}
): Promise<ResultadoPainel> {
  const agora = o.agora ?? Date.now;
  const chave = `${cfg.tenantId}|${de}|${ate}`;
  const guardado = cache.get(chave);
  if (guardado && agora() - guardado.em < TTL_FRESCO_MS) return { dados: guardado.dados, buscadoEm: guardado.em, origem: "cache" };

  const andando = emVoo.get(chave);
  if (andando) return andando;

  const p = (async (): Promise<ResultadoPainel> => {
    try {
      const dados = await chamarSite(cfg, de, ate, o);
      const em = agora();
      cache.set(chave, { em, dados });
      return { dados, buscadoEm: em, origem: "site" };
    } catch (e) {
      const velho = cache.get(chave);
      if (velho && agora() - velho.em < TTL_VELHO_MS) {
        return { dados: velho.dados, buscadoEm: velho.em, origem: "reserva", erro: e instanceof Error ? e.message : "O site não respondeu." };
      }
      throw e;
    } finally {
      emVoo.delete(chave);
    }
  })();
  emVoo.set(chave, p);
  return p;
}
