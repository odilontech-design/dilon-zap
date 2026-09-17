/**
 * Cobrança recorrente das mensalidades do Dilon Zap via Mercado Pago
 * (Assinaturas / PreApproval) — diferente de um checkout de compra única: o
 * pagador autoriza uma vez, num link, e o Mercado Pago cobra o cartão sozinho
 * todo mês a partir daí, avisando por webhook.
 *
 * Variável de ambiente necessária:
 *   MP_ACCESS_TOKEN -> access token de PRODUÇÃO da conta MP da Dilon Tech
 *                       (a que recebe as mensalidades, não a de cada cliente)
 *
 * A API de assinaturas não é toda coberta pelo SDK oficial — o client de
 * PreApproval cobre criar/buscar/atualizar, mas não existe wrapper pro
 * endpoint de "pagamento de uma cobrança específica" (authorized_payments),
 * então essa parte usa fetch direto contra a API REST.
 */
import { MercadoPagoConfig, PreApproval } from "mercadopago";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN as string,
});

function baseUrl() {
  return process.env.NEXTAUTH_URL as string;
}

/**
 * Cria o link de autorização da cobrança recorrente. O cliente abre esse link
 * uma vez, cadastra o cartão, e a assinatura fica "authorized" — cobrando
 * sozinha todo mês a partir daí.
 *
 * `external_reference` é o id da Subscription no nosso banco: é por ele que o
 * webhook encontra de volta qual tenant cobrar, então tem que ser único e
 * estável — nunca o id do tenant (a Subscription pode ser recriada).
 */
export async function createSubscriptionCheckout(params: {
  subscriptionId: string;
  tenantName: string;
  amountCents: number;
  payerEmail: string;
}) {
  const preApproval = new PreApproval(client);

  const result = await preApproval.create({
    body: {
      reason: `Dilon Zap — ${params.tenantName}`,
      external_reference: params.subscriptionId,
      payer_email: params.payerEmail,
      back_url: `${baseUrl()}/admin/tenants`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: Number((params.amountCents / 100).toFixed(2)),
        currency_id: "BRL",
      },
    },
  });

  return {
    id: result.id as string,
    initPoint: result.init_point as string,
    status: result.status as string,
  };
}

/** Busca o estado atual de uma assinatura direto no Mercado Pago. */
export async function getPreapproval(id: string) {
  const preApproval = new PreApproval(client);
  return preApproval.get({ id });
}

/**
 * Cancela a cobrança automática. Não mexe nas faturas já cobradas — só impede
 * a próxima. A empresa some do plano de auto-cobrança e volta a depender de
 * boleto/PIX manual, se continuar cliente.
 */
export async function cancelPreapproval(id: string) {
  const preApproval = new PreApproval(client);
  return preApproval.update({ id, body: { status: "cancelled" } });
}

/** Pausa (não cobra) sem cancelar de vez — dá pra retomar depois com `resumePreapproval`. */
export async function pausePreapproval(id: string) {
  const preApproval = new PreApproval(client);
  return preApproval.update({ id, body: { status: "paused" } });
}

export async function resumePreapproval(id: string) {
  const preApproval = new PreApproval(client);
  return preApproval.update({ id, body: { status: "authorized" } });
}

/**
 * Detalhe de UMA cobrança da assinatura (o que o webhook
 * `subscription_authorized_payment` aponta). Sem wrapper no SDK — chama a
 * REST direto.
 */
export async function getAuthorizedPayment(id: string) {
  const res = await fetch(`https://api.mercadopago.com/authorized_payments/${id}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`Mercado Pago: authorized_payments/${id} respondeu ${res.status}`);
  }
  return res.json() as Promise<{
    id: number;
    preapproval_id: string;
    status: string; // "approved" | "pending" | "rejected" | ...
    transaction_amount: number;
    type: string; // "recurring" | "punctual" | ...
    date_created: string;
  }>;
}

/** Traduz o status do Mercado Pago pra o que a tela mostra em português. */
export const MP_STATUS_LABEL: Record<string, string> = {
  pending: "Aguardando autorização do cliente",
  authorized: "Cobrança automática ativa",
  paused: "Cobrança automática pausada",
  cancelled: "Cobrança automática cancelada",
};
