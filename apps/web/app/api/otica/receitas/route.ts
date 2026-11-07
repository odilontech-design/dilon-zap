import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";

/**
 * Receitas de um cliente, a mais nova primeiro. É o que a nova OS oferece para
 * reaproveitar quando o cliente volta com a mesma receita.
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const contactId = new URL(req.url).searchParams.get("contactId");
  if (!contactId) return NextResponse.json({ error: "contactId é obrigatório" }, { status: 400 });

  const receitas = await prisma.receitaOtica.findMany({
    where: { tenantId: user.tenantId, contactId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return NextResponse.json(receitas);
}
