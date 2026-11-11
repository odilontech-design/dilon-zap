/**
 * Cliente mínimo da API do Asaas para as mensalidades do Dilon Ponto.
 *
 * Mesma conta Asaas da Dilon Tech que cobra o Zap (ASAAS_API_KEY,
 * ASAAS_ENV). O código é uma cópia enxuta de apps/web/lib/asaas.ts porque um
 * app não importa de dentro de outro; se um terceiro produto precisar, vale
 * extrair para um pacote.
 *
 * Diferença em relação ao Zap: aqui a assinatura é por BOLETO (o plano
 * Essencial promete "pagamento via boleto bancário"). A página da cobrança do
 * Asaas também oferece Pix para quem preferir.
 *
 * PONTO_ASAAS_URL troca a base da API. Serve para apontar para um servidor
 * falso nos testes; em produção, deixe vazio.
 */

function baseUrl() {
  if (process.env.PONTO_ASAAS_URL) return process.env.PONTO_ASAAS_URL.replace(/\/$/, "");
  return process.env.ASAAS_ENV === "production" ? "https://api.asaas.com/v3" : "https://api-sandbox.asaas.com/v3";
}

export function asaasConfigurado(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}

/** Erro com a frase que o Asaas mandou (ex.: "CPF/CNPJ inválido"), para mostrar na tela. */
export class ErroAsaas extends Error {
  constructor(readonly motivo: string, tecnico: string) {
    super(tecnico);
  }
}

async function chamar<T>(caminho: string, init?: RequestInit): Promise<T> {
  if (!asaasConfigurado()) throw new ErroAsaas("cobrança não configurada (ASAAS_API_KEY)", "ASAAS_API_KEY vazia");
  const res = await fetch(`${baseUrl()}${caminho}`, {
    ...init,
    headers: { "Content-Type": "application/json", access_token: process.env.ASAAS_API_KEY!, ...init?.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    let motivo = `o Asaas recusou (HTTP ${res.status})`;
    try {
      motivo = JSON.parse(corpo)?.errors?.[0]?.description ?? motivo;
    } catch {
      // corpo não é JSON
    }
    throw new ErroAsaas(motivo, `Asaas ${caminho} → ${res.status}: ${corpo.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

export interface PagamentoAsaas {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  subscription?: string | null;
  externalReference?: string | null;
  deleted?: boolean;
}

/** Acha o cliente pelo CNPJ (é a empresa que paga) ou cria. */
export async function acharOuCriarCliente(p: { nome: string; cnpj: string; email: string; empresaId: string }): Promise<string> {
  const achados = await chamar<{ data: Array<{ id: string }> }>(`/customers?cpfCnpj=${p.cnpj}`);
  if (achados.data.length > 0) return achados.data[0].id;
  const criado = await chamar<{ id: string }>("/customers", {
    method: "POST",
    body: JSON.stringify({ name: p.nome, cpfCnpj: p.cnpj, email: p.email, externalReference: `ponto:${p.empresaId}` }),
  });
  return criado.id;
}

/** Assinatura mensal por boleto. A primeira cobrança nasce junto, com vencimento em `primeiroVencimento`. */
export async function criarAssinaturaBoleto(p: {
  clienteId: string;
  valorCentavos: number;
  primeiroVencimento: string;
  descricao: string;
  empresaId: string;
}): Promise<string> {
  const assinatura = await chamar<{ id: string }>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: p.clienteId,
      billingType: "BOLETO",
      value: Number((p.valorCentavos / 100).toFixed(2)),
      nextDueDate: p.primeiroVencimento,
      cycle: "MONTHLY",
      description: p.descricao,
      // Identifica de quem é a cobrança no webhook, que é o mesmo da conta
      // inteira (Zap e Ponto recebem os eventos um do outro).
      externalReference: `ponto:${p.empresaId}`,
    }),
  });
  return assinatura.id;
}

export async function pagamentosDaAssinatura(assinaturaId: string): Promise<PagamentoAsaas[]> {
  const r = await chamar<{ data: PagamentoAsaas[] }>(`/payments?subscription=${assinaturaId}&limit=100`);
  return r.data;
}

/** Linha digitável do boleto (para copiar e pagar no app do banco). */
export async function linhaDigitavel(pagamentoId: string): Promise<string | null> {
  try {
    const r = await chamar<{ identificationField?: string }>(`/payments/${pagamentoId}/identificationField`);
    return r.identificationField ?? null;
  } catch {
    // Boleto ainda sendo registrado no banco: a linha aparece um pouco depois.
    return null;
  }
}
