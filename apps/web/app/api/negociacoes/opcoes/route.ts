import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { origensDoTenant } from "@/lib/origens";

/**
 * GET /api/negociacoes/opcoes — o que os formulários de negociação precisam
 * fora do quadro (Inbox, ficha do contato): a lista de origens, as pessoas
 * que podem ser responsáveis, quem está logado. Abrir negociação não
 * exige dados; o valor é cobrado só a partir da etapa de orçamento.
 */
export async function GET() {
  const user = await requireUser();
  const [origens, usuarios] = await Promise.all([
    origensDoTenant(user.tenantId),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, deactivatedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return NextResponse.json({ exigirDados: false, origens, usuarios, meuId: user.id });
}
