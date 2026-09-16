import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { filtrarHistoricoPorSetor } from "@/lib/historico-setor";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  // Confere que a conversa é do tenant logado (e visível pro papel dele)
  // antes de devolver qualquer coisa.
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mensagens = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { name: true } },
      quotedMessage: {
        select: { id: true, body: true, direction: true, mediaType: true, isDeleted: true, autorNome: true, sender: { select: { name: true } } },
      },
      reactions: { select: { id: true, emoji: true, fromMe: true } },
    },
  });

  // Isolamento de histórico entre setores: recurso ligado por empresa (hoje só
  // a Guttierres), e o Responsável sempre vê tudo — a barreira é só entre
  // setores/atendentes. Ver Tenant.isolarHistoricoPorSetor no schema.
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { isolarHistoricoPorSetor: true },
  });
  const semRestricao = !tenant.isolarHistoricoPorSetor || user.role === "OWNER" || user.role === "SUPERADMIN";
  if (semRestricao) {
    return NextResponse.json({ mensagens, marcadores: [] });
  }

  const [meusSetores, setores] = await Promise.all([
    prisma.setorMembro.findMany({ where: { userId: user.id }, select: { setorId: true } }),
    prisma.setor.findMany({ where: { tenantId: user.tenantId }, select: { id: true, nome: true } }),
  ]);
  const nomePorSetor = new Map(setores.map((s) => [s.id, s.nome]));

  const { visiveis, marcadores } = filtrarHistoricoPorSetor(
    mensagens,
    new Set(meusSetores.map((m) => m.setorId))
  );

  return NextResponse.json({
    mensagens: visiveis,
    marcadores: marcadores.map((m) => ({ antesDe: m.antesDe, setorNome: m.setorId ? (nomePorSetor.get(m.setorId) ?? null) : null })),
  });
}
