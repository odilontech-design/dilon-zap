import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

// Só a contagem por status (pro badge nas abas do Inbox) — separado de
// /api/reports/summary porque aquele endpoint é pesado (amostra de 50
// conversas com histórico completo) e esse aqui precisa ser leve pra dar
// pra pollar com frequência junto da lista de conversas.
export async function GET() {
  const user = await requireUser();
  const visiveis = { tenantId: user.tenantId, contact: { grupo: false }, ...(await conversationVisibilityWhere(user, { listagem: true })) };

  const [counts, ...naoLidas] = await Promise.all([
    prisma.conversation.groupBy({
      by: ["status"],
      // Os badges são das abas do Inbox, e grupo não aparece no Inbox.
      where: visiveis,
      _count: true,
    }),
    // Mensagens não lidas por aba — é o número que as abas mostram, como na
    // tela de Grupos (pedido da Guttierres, 13/10). O total de conversas
    // continua indo junto, para quem quiser.
    ...(["OPEN", "PENDING", "RESOLVED"] as const).map((status) =>
      prisma.message.count({ where: { direction: "INBOUND", readAt: null, conversation: { ...visiveis, status } } })
    ),
  ]);

  const statusMap = { OPEN: 0, PENDING: 0, RESOLVED: 0 };
  for (const row of counts) statusMap[row.status] = row._count;

  return NextResponse.json({
    ...statusMap,
    naoLidas: { OPEN: naoLidas[0], PENDING: naoLidas[1], RESOLVED: naoLidas[2] },
  });
}
