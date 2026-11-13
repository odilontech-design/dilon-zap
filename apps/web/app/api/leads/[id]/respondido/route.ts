import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";

/** Marca o lead como respondido (para o relógio do tempo de resposta). Qualquer pessoa da equipe. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  const r = await prisma.leadPortal.updateMany({ where: { id: params.id, tenantId: user.tenantId, respondidoEm: null }, data: { respondidoEm: new Date() } });
  return NextResponse.json({ ok: true, atualizado: r.count });
}
