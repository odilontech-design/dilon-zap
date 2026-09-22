import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";

/**
 * DELETE /api/products/[id]/materiais/[materialId] — tira da biblioteca.
 *
 * NÃO apaga o arquivo do armazenamento, de propósito: as mensagens que já
 * foram enviadas com ele continuam apontando pra ele, e apagar faria o
 * documento sumir das conversas antigas.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string; materialId: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "MATERIAIS");
  if (bloqueio) return bloqueio;
  if (user.role !== "OWNER" && user.role !== "FINANCEIRO") {
    return NextResponse.json({ error: "sem permissão" }, { status: 403 });
  }

  const apagado = await prisma.produtoMaterial.deleteMany({
    where: { id: params.materialId, productId: params.id, tenantId: user.tenantId },
  });
  if (apagado.count === 0) return NextResponse.json({ error: "material não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
