import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigeNegociacaoCompleta, origensDoTenant } from "@/lib/origens";

/**
 * GET /api/negociacoes/opcoes — o que os formulários de negociação precisam
 * fora do quadro (Inbox, ficha do contato): a lista de origens, as pessoas
 * que podem ser responsáveis, quem está logado e se a empresa exige
 * responsável, valor e origem em toda negociação nova.
 */
export async function GET() {
  const user = await requireUser();
  const [exigirDados, origens, usuarios] = await Promise.all([
    exigeNegociacaoCompleta(user.tenantId),
    origensDoTenant(user.tenantId),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, deactivatedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return NextResponse.json({ exigirDados, origens, usuarios, meuId: user.id });
}
