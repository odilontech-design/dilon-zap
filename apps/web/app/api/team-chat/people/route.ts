import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

/**
 * Colegas com quem dá pra abrir uma conversa direta: todo usuário ativo da
 * empresa, menos eu. Não filtra por setor — o ponto da conversa direta é
 * justamente falar com quem está em outro setor.
 */
export async function GET() {
  const user = await requireUser();
  const pessoas = await prisma.user.findMany({
    where: { tenantId: user.tenantId, deactivatedAt: null, id: { not: user.id } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(pessoas);
}
