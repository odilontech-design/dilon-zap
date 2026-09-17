/**
 * Cobrança recorrente das mensalidades do Dilon Zap via Asaas — segunda
 * opção ao lado do Mercado Pago (ver lib/mercadopago.ts), pro cliente que
 * prefere boleto/PIX recorrente em vez de cartão só.
 *
 * A Asaas não tem um "link de autorização" pronto como o PreApproval do MP:
 * o fluxo aqui é criar um Customer (a Asaas exige CPF/CNPJ), criar uma
 * Subscription pra esse Customer com billingType "CREDIT_CARD", e mandar pro
 * cliente o link (invoiceUrl) da PRIMEIRA cobrança gerada — é nessa página
 * hospedada da Asaas que ele cadastra o cartão uma vez, e a Asaas cobra
 * sozinha a partir daí, exatamente como o link do Mercado Pago.
 *
 * Variáveis de ambiente necessárias:
 *   ASAAS_API_KEY -> chave da conta Asaas da Dilon Tech (a que recebe as
 *                    mensalidades). Sandbox em desenvolvimento, produção só
 *                    no deploy — ver .env.production.example.
 *   ASAAS_ENV     -> "sandbox" ou "production", escolhe a base da API.
 *
 * Sem SDK oficial maduro pra Node — tudo aqui é fetch direto contra a REST,
 * igual o authorized_payments do lado do Mercado Pago.
 */

function baseUrl() {
  return process.env.ASAAS_ENV === "production"
    ? "https://api.asaas.com/v3"
    : "https://api-sandbox.asaas.com/v3";
}

function headers() {
  return {
    "Content-Type": "application/json",
    // A Asaas autentica pelo header `access_token`, não Authorization Bearer.
    access_token: process.env.ASAAS_API_KEY as string,
  };
}

/**
 * Erro que carrega a mensagem que a Asaas de fato mandou (ex: "O valor mínimo
 * para cobranças via cartão de crédito é R$ 5,00"), separada do texto técnico
 * — é o que a rota devolve pro painel em vez de um "não deu pra gerar o link"
 * sem pista nenhuma do que corrigir.
 */
export class AsaasError extends Error {
  constructor(
    public readonly motivo: string,
    technicalMessage: string
  ) {
    super(technicalMessage);
  }
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { ...init, headers: { ...headers(), ...init?.headers } });
  if (!res.ok) {
    const corpo = await res.text().catch(() => "");
    // A Asaas devolve { errors: [{ description }] } nas validações — é essa
    // frase que faz sentido pra quem está preenchendo o formulário no painel.
    // Sem parsear, sobrava só o JSON cru truncado.
    const motivo =
      (() => {
        try {
          return JSON.parse(corpo)?.errors?.[0]?.description as string | undefined;
        } catch {
          return undefined;
        }
      })() ?? `a Asaas recusou (HTTP ${res.status})`;
    throw new AsaasError(motivo, `Asaas: ${path} respondeu ${res.status} — ${corpo.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

type AsaasCustomer = { id: string };
type AsaasSubscription = { id: string; status: string };
type AsaasPayment = {
  id: string;
  status: string; // "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | ...
  value: number;
  dueDate: string;
  paymentDate: string | null;
  invoiceUrl: string;
  subscription: string | null;
};

/**
 * Acha o Customer pelo e-mail (a Asaas não tem upsert nativo) ou cria um
 * novo. Reconsultar em vez de guardar só o id evita duplicar Customer se o
 * superadmin gerar o link de novo depois de trocar o e-mail de cobrança.
 */
async function acharOuCriarCustomer(params: { name: string; email: string; cpfCnpj: string }) {
  const existentes = await asaasFetch<{ data: AsaasCustomer[] }>(
    `/customers?email=${encodeURIComponent(params.email)}`
  );
  if (existentes.data.length > 0) return existentes.data[0].id;

  const criado = await asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({ name: params.name, email: params.email, cpfCnpj: params.cpfCnpj.replace(/\D/g, "") }),
  });
  return criado.id;
}

/**
 * Cria o Customer (se preciso) e a Subscription, e devolve o link da primeira
 * cobrança — é esse link que o superadmin manda pro cliente autorizar.
 */
export async function createAsaasSubscriptionCheckout(params: {
  tenantName: string;
  amountCents: number;
  cycleDay: number;
  payerEmail: string;
  payerDocument: string;
}) {
  const customerId = await acharOuCriarCustomer({
    name: params.tenantName,
    email: params.payerEmail,
    cpfCnpj: params.payerDocument,
  });

  // nextDueDate precisa ser uma data futura (hoje não vale) — se o dia do
  // ciclo já passou este mês, a primeira cobrança nasce pro dia certo do mês
  // que vem; senão nasce ainda este mês.
  const hoje = new Date();
  let proximoVencimento = new Date(hoje.getFullYear(), hoje.getMonth(), params.cycleDay);
  if (proximoVencimento <= hoje) {
    proximoVencimento = new Date(hoje.getFullYear(), hoje.getMonth() + 1, params.cycleDay);
  }

  const subscription = await asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: customerId,
      billingType: "CREDIT_CARD",
      value: Number((params.amountCents / 100).toFixed(2)),
      nextDueDate: proximoVencimento.toISOString().slice(0, 10),
      cycle: "MONTHLY",
      description: `Dilon Zap — ${params.tenantName}`,
    }),
  });

  // A Subscription recém-criada já nasce com a primeira cobrança gerada —
  // busca ela pra pegar o invoiceUrl (a Subscription em si não tem link).
  const pagamentos = await asaasFetch<{ data: AsaasPayment[] }>(
    `/payments?subscription=${subscription.id}&limit=1`
  );
  const primeiraCobranca = pagamentos.data[0];
  if (!primeiraCobranca) {
    throw new Error("Asaas criou a assinatura mas não gerou a primeira cobrança — confira no painel deles");
  }

  return {
    id: subscription.id,
    customerId,
    status: subscription.status,
    checkoutUrl: primeiraCobranca.invoiceUrl,
  };
}

export async function getAsaasSubscription(id: string) {
  return asaasFetch<AsaasSubscription>(`/subscriptions/${id}`);
}

/** Reemite o link da cobrança mais recente ainda em aberto dessa assinatura. */
export async function getLatestCheckoutUrl(subscriptionId: string) {
  const pagamentos = await asaasFetch<{ data: AsaasPayment[] }>(
    `/payments?subscription=${subscriptionId}&limit=1`
  );
  return pagamentos.data[0]?.invoiceUrl ?? null;
}

/** Cancela a assinatura. Cobranças já geradas continuam existindo, só a próxima some. */
export async function cancelAsaasSubscription(id: string) {
  return asaasFetch<{ deleted: boolean }>(`/subscriptions/${id}`, { method: "DELETE" });
}

export async function getAsaasPayment(id: string) {
  return asaasFetch<AsaasPayment>(`/payments/${id}`);
}

/** Traduz o status que a Asaas manda pro que a tela mostra em português. */
export const ASAAS_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Cobrança automática ativa",
  EXPIRED: "Cobrança automática expirada",
  INACTIVE: "Cobrança automática cancelada",
};

/**
 * Pix Automático — terceira opção de cobrança recorrente, API separada da
 * Subscription de cartão acima (POST /v3/pix/automatic/authorizations, não
 * /v3/subscriptions). O pagador autoriza escaneando um QR code no PRÓPRIO
 * banco dele — diferente do cartão, aqui não existe link de checkout pra
 * mandar; o que a Dilon Tech manda é a IMAGEM do QR code (e o texto
 * copia-e-cola, como alternativa a escanear).
 *
 * Cada cobrança gerada por essa autorização (a primeira e as recorrentes)
 * cria uma Payment normal por baixo dos panos, e os eventos de sempre
 * (PAYMENT_RECEIVED/PAYMENT_CONFIRMED) disparam do mesmo jeito — não é uma
 * lógica de "virou paga" nova, é a mesma. O que muda é como achar a QUAL
 * assinatura aquele pagamento pertence: um pagamento de Pix Automático não
 * necessariamente vem com `payment.subscription` preenchido (esse campo é
 * do mundo das Subscriptions de cartão/boleto/PIX comum), então o webhook
 * (ver route.ts) usa o evento PIX_AUTOMATIC_RECURRING_PAYMENT_INSTRUCTION_CREATED
 * — que chega ANTES do pagamento em si, com o paymentId já nele — pra
 * pré-gravar a fatura como PENDING, e só atualiza pra PAID quando o
 * PAYMENT_RECEIVED chega depois pra aquele mesmo id.
 */
/**
 * Descrição da autorização de Pix Automático. Diferente da Subscription de
 * cartão (que aceita texto livre, inclusive "—"), o campo do Pix vai
 * literalmente dentro do BR Code — texto do padrão do Banco Central, sem
 * travessão e com no máximo 35 caracteres. Corta o nome da empresa, não o
 * "Dilon Zap - " na frente: é a parte que identifica de quem é a cobrança
 * pra quem olha o QR no banco.
 */
function descricaoPix(nomeDaEmpresa: string) {
  return `Dilon Zap - ${nomeDaEmpresa}`.slice(0, 35);
}

type AsaasPixAuthorization = {
  id: string;
  status: string; // "CREATED" | "ACTIVE" | "CANCELLED" | "REFUSED" | "EXPIRED"
  encodedImage: string; // QR code em base64 (PNG)
  payload: string; // QR code em texto, copia-e-cola
};

/**
 * Cria o Customer (se preciso) e a autorização de Pix Automático, e devolve
 * o QR code da primeira cobrança + consentimento — é essa imagem que o
 * superadmin manda pro cliente escanear no banco dele.
 */
export async function createPixAutomaticAuthorization(params: {
  subscriptionId: string; // vira o contractId — é o que identifica a autorização do nosso lado
  tenantName: string;
  amountCents: number;
  payerEmail: string;
  payerDocument: string;
}) {
  const customerId = await acharOuCriarCustomer({
    name: params.tenantName,
    email: params.payerEmail,
    cpfCnpj: params.payerDocument,
  });

  const valor = Number((params.amountCents / 100).toFixed(2));
  const authorization = await asaasFetch<AsaasPixAuthorization>("/pix/automatic/authorizations", {
    method: "POST",
    body: JSON.stringify({
      customerId,
      contractId: params.subscriptionId,
      frequency: "MONTHLY",
      startDate: new Date().toISOString().slice(0, 10),
      value: valor,
      description: descricaoPix(params.tenantName),
      // SUBSCRIPTION: a Asaas gera sozinha as cobranças dos meses seguintes.
      // Com MANUAL, seríamos nós quem teria que criar cada cobrança na mão —
      // o oposto do que "cobra sozinha todo mês" pede.
      paymentCreationMode: "SUBSCRIPTION",
      immediateQrCode: {
        // 24h pro cliente escanear e autorizar. Passado isso sem pagar, a
        // autorização vira REFUSED e precisa ser recriada do zero — não tem
        // "reemitir o mesmo QR" como tem o link do cartão.
        expirationSeconds: 86400,
        originalValue: valor,
        description: descricaoPix(params.tenantName),
      },
    }),
  });

  return { id: authorization.id, customerId, status: authorization.status, encodedImage: authorization.encodedImage, payload: authorization.payload };
}

export async function getPixAuthorization(id: string) {
  return asaasFetch<AsaasPixAuthorization>(`/pix/automatic/authorizations/${id}`);
}

export async function cancelPixAuthorization(id: string) {
  return asaasFetch<AsaasPixAuthorization>(`/pix/automatic/authorizations/${id}`, { method: "DELETE" });
}

export const ASAAS_PIX_STATUS_LABEL: Record<string, string> = {
  CREATED: "Aguardando o cliente escanear o QR code",
  ACTIVE: "Cobrança automática (Pix) ativa",
  CANCELLED: "Cobrança automática (Pix) cancelada",
  REFUSED: "QR code expirou sem ser escaneado",
  EXPIRED: "Cobrança automática (Pix) expirada",
};
