import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";

/** O que as telas da revenda precisam saber: quem pode vender, quem sou eu, se vejo custo. */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;

  const [usuarios, tenant] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId: user.tenantId, deactivatedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { timezone: true } }),
  ]);
  return NextResponse.json({ eu: user.id, gerencia: ehGerencia(user.role), timezone: tenant.timezone, vendedores: usuarios });
}
