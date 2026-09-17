import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { createPixAutomaticAuthorization, AsaasError } from "@/lib/asaas";

const bodySchema = z.object({
  billingEmail: z.string().email("e-mail inválido"),
  billingDocument: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 11 || v.length === 14, "CPF ou CNPJ inválido"),
});

/**
 * POST /api/admin/tenants/[id]/subscription/asaas-pix-checkout
 * Cria a autorização de Pix Automático e devolve o QR code — diferente do
 * cartão, não existe "reemitir o mesmo link" aqui (ver comentário em
 * lib/asaas.ts): o QR expira, e se expirar tem que criar outra autorização.
 * Por isso esta rota não tem GET — só POST.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, include: { subscription: true } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });
  if (!tenant.subscription) {
    return NextResponse.json({ error: "configure o plano (valor e vencimento) antes de gerar a cobrança automática" }, {
      status: 400,
    });
  }
  if (tenant.subscription.asaasPixAuthorizationStatus === "ACTIVE") {
    return NextResponse.json({ error: "já existe uma cobrança automática (Pix) ativa — cancele antes de gerar outra" }, {
      status: 409,
    });
  }

  let authorization;
  try {
    authorization = await createPixAutomaticAuthorization({
      subscriptionId: tenant.subscription.id,
      tenantName: tenant.name,
      amountCents: tenant.subscription.amountCents,
      payerEmail: parsed.data.billingEmail,
      payerDocument: parsed.data.billingDocument,
    });
  } catch (error) {
    const motivo = error instanceof AsaasError ? error.motivo : "erro inesperado ao falar com a Asaas";
    return NextResponse.json({ error: motivo }, { status: 502 });
  }

  const subscription = await prisma.subscription.update({
    where: { id: tenant.subscription.id },
    data: {
      billingEmail: parsed.data.billingEmail,
      billingDocument: parsed.data.billingDocument,
      asaasCustomerId: authorization.customerId,
      asaasPixAuthorizationId: authorization.id,
      asaasPixAuthorizationStatus: authorization.status,
    },
  });

  await logAudit({
    actor: admin,
    action: "subscription.asaas_pix_checkout_criado",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { authorizationId: authorization.id, billingEmail: parsed.data.billingEmail },
  });

  return NextResponse.json({ encodedImage: authorization.encodedImage, payload: authorization.payload, subscription });
}
