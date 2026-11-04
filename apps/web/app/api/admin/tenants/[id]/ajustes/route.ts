import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

/**
 * Ajustes da empresa que antes só mudavam direto no banco: quem enxerga as
 * conversas e como o pedido se chama nas telas. Só a Dilon Tech mexe.
 */
const schema = z.object({
  conversasAbertasATodos: z.boolean().optional(),
  restringirFilaGeral: z.boolean().optional(),
  termoPedido: z.enum(["Pedido", "Orçamento"]).optional(),
  pedidosSoGerencia: z.boolean().optional(),
  negociacaoCompleta: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, conversasAbertasATodos: true, restringirFilaGeral: true, termoPedido: true, pedidosSoGerencia: true, negociacaoCompleta: true },
  });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  const atualizado = await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      ...(d.conversasAbertasATodos !== undefined ? { conversasAbertasATodos: d.conversasAbertasATodos } : {}),
      ...(d.restringirFilaGeral !== undefined ? { restringirFilaGeral: d.restringirFilaGeral } : {}),
      ...(d.pedidosSoGerencia !== undefined ? { pedidosSoGerencia: d.pedidosSoGerencia } : {}),
      ...(d.negociacaoCompleta !== undefined ? { negociacaoCompleta: d.negociacaoCompleta } : {}),
      // "Pedido" é o padrão: guarda nulo, para o padrão poder mudar no código.
      ...(d.termoPedido !== undefined ? { termoPedido: d.termoPedido === "Pedido" ? null : d.termoPedido } : {}),
    },
    select: { conversasAbertasATodos: true, restringirFilaGeral: true, termoPedido: true, pedidosSoGerencia: true, negociacaoCompleta: true },
  });

  await logAudit({
    actor: admin,
    action: "tenant.ajustes",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: {
      de: {
        conversasAbertasATodos: tenant.conversasAbertasATodos,
        restringirFilaGeral: tenant.restringirFilaGeral,
        termoPedido: tenant.termoPedido,
        pedidosSoGerencia: tenant.pedidosSoGerencia,
        negociacaoCompleta: tenant.negociacaoCompleta,
      },
      para: atualizado,
    },
  });

  return NextResponse.json(atualizado);
}
