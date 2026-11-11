import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/ponto-db";
import { gravarPagamento } from "@/lib/cobranca";
import type { PagamentoAsaas } from "@/lib/asaas";

export const dynamic = "force-dynamic";

/**
 * Webhook de cobranças do Asaas para o Dilon Ponto.
 *
 * Cadastre no Asaas (Integrações > Webhooks) a URL
 * https://<domínio do ponto>/api/webhooks/asaas com um token próprio, igual ao
 * PONTO_ASAAS_WEBHOOK_TOKEN. A conta é a mesma do Zap, então chegam aqui
 * também os pagamentos do Zap: sem assinatura do Ponto correspondente, o
 * evento é ignorado com 200 (erro faria o Asaas reenviar para sempre).
 *
 * Todo evento PAYMENT_* é tratado do mesmo jeito: grava o estado atual do
 * pagamento. Assim criação, atualização, vencimento, pagamento e estorno
 * caem no mesmo caminho, e evento repetido não faz mal.
 */
export async function POST(req: Request) {
  const esperado = process.env.PONTO_ASAAS_WEBHOOK_TOKEN || process.env.ASAAS_WEBHOOK_TOKEN;
  if (!esperado || req.headers.get("asaas-access-token") !== esperado) {
    return NextResponse.json({ error: "token inválido" }, { status: 401 });
  }

  let corpo: { event?: string; payment?: PagamentoAsaas } | null = null;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ recebido: true, ignorado: "corpo inválido" });
  }
  const evento = corpo?.event ?? "";
  const pagamento = corpo?.payment;
  if (!evento.startsWith("PAYMENT_") || !pagamento?.id) return NextResponse.json({ recebido: true, ignorado: evento });

  try {
    const empresa = pagamento.subscription
      ? await prisma.empresa.findUnique({ where: { asaasSubscriptionId: pagamento.subscription }, select: { id: true } })
      : null;
    if (!empresa) return NextResponse.json({ recebido: true, ignorado: "não é do Ponto" });
    await gravarPagamento(empresa.id, pagamento, evento === "PAYMENT_DELETED");
  } catch (err) {
    // Erro nosso (banco fora): 500 faz o Asaas tentar de novo mais tarde.
    console.error("[webhook asaas ponto]", evento, err);
    return NextResponse.json({ error: "falha ao gravar" }, { status: 500 });
  }
  return NextResponse.json({ recebido: true });
}
