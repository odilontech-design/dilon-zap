import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { NOME_SUPORTE, usuarioDeSuporte } from "@/lib/suporte-chat";

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
  // O suporte da Dilon Tech fica à mão de todo usuário, no topo da lista, sem
  // ter usuário dentro de cada empresa. Quem já é da empresa dele não precisa.
  const suporte = await usuarioDeSuporte();
  if (suporte && user.role !== "SUPERADMIN" && suporte.tenantId !== user.tenantId) {
    return NextResponse.json([{ id: suporte.id, name: NOME_SUPORTE, suporte: true }, ...pessoas]);
  }
  return NextResponse.json(pessoas);
}
