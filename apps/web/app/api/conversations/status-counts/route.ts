import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

// Só a contagem por status (pro badge nas abas do Inbox) — separado de
// /api/reports/summary porque aquele endpoint é pesado (amostra de 50
// conversas com histórico completo) e esse aqui precisa ser leve pra dar
// pra pollar com frequência junto da lista de conversas.
export async function GET() {
  const user = await requireUser();

  const counts = await prisma.conversation.groupBy({
    by: ["status"],
    where: { tenantId: user.tenantId },
    _count: true,
  });

  const statusMap = { OPEN: 0, PENDING: 0, RESOLVED: 0 };
  for (const row of counts) statusMap[row.status] = row._count;

  return NextResponse.json(statusMap);
}
