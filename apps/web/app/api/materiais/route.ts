import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirAlgumRecurso } from "@/lib/plano";

/**
 * GET /api/materiais — produtos que têm descrição, material ou foto, pro
 * seletor "Enviar material" da conversa. Só os ativos: serviço desativado não
 * deveria mais ser oferecido a cliente.
 *
 * Empresa só com Pedidos (sem a biblioteca) também usa: é por aqui que a
 * consultora manda a foto do produto do catálogo.
 */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirAlgumRecurso(user, ["MATERIAIS", "PEDIDOS"]);
  if (bloqueio) return bloqueio;

  const produtos = await prisma.product.findMany({
    where: {
      tenantId: user.tenantId,
      isActive: true,
      OR: [{ descricao: { not: null } }, { materiais: { some: {} } }, { fotoKey: { not: null } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      categoria: true,
      descricao: true,
      priceCents: true,
      fotoKey: true,
      materiais: {
        orderBy: { criadoEm: "asc" },
        select: { id: true, titulo: true, mediaType: true, fileName: true, duracaoSegundos: true },
      },
    },
  });
  return NextResponse.json(produtos);
}
