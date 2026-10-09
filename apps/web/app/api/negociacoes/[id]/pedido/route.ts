import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ErroDeNegocio, gerarPedido } from "@/lib/negociacoes";

/** Gera o rascunho de pedido a partir dos itens da negociação. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PEDIDOS");
  if (bloqueio) return bloqueio;

  const n = await prisma.negociacao.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, contactId: true },
  });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  try {
    const pedido = await gerarPedido(n, user.tenantId, user);
    return NextResponse.json(pedido, { status: 201 });
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
