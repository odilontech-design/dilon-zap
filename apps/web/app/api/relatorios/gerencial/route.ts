import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { montarGerencial } from "@/lib/relatorio-gerencial";

/** Painel gerencial: números da empresa inteira, só para a gestão. */
export async function GET() {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão vê o painel gerencial" }, { status: 403 });
  return NextResponse.json(await montarGerencial(user.tenantId), { headers: { "Cache-Control": "no-store" } });
}

const metaSchema = z.object({
  // Centavos; null tira a meta.
  metaVendasMesCents: z.number().int().min(0).max(100_000_000_00).nullable(),
});

/** Define a meta de vendas do mês (a mesma para todos os meses até alguém mudar). */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão define a meta" }, { status: 403 });
  const parsed = metaSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "valor da meta inválido" }, { status: 400 });

  const antes = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { metaVendasMesCents: true } });
  await prisma.tenant.update({ where: { id: user.tenantId }, data: { metaVendasMesCents: parsed.data.metaVendasMesCents } });
  await logAudit({
    actor: user,
    action: "tenant.meta_vendas",
    metadata: { de: antes?.metaVendasMesCents ?? null, para: parsed.data.metaVendasMesCents },
  });
  return NextResponse.json({ ok: true });
}
