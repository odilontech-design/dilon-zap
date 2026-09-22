import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";

/**
 * GET /api/materiais — produtos que têm descrição ou material, pro seletor
 * "Enviar material" da conversa. Só os ativos: serviço desativado não deveria
 * mais ser oferecido a cliente.
 */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "MATERIAIS");
  if (bloqueio) return bloqueio;

  const produtos = await prisma.product.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true,
      OR: [{ descricao: { not: null } }, { materiais: { some: {} } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      categoria: true,
      descricao: true,
      materiais: {
        orderBy: { criadoEm: "asc" },
        select: { id: true, titulo: true, mediaType: true, fileName: true, duracaoSegundos: true },
      },
    },
  });
  return NextResponse.json(produtos);
}
