import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";

// Lista da tela Grupos: só os ativos, com mensagem mais recente primeiro.
//
// Sem a regra de visibilidade do Inbox de propósito: grupo é da equipe
// inteira, sempre — não tem responsável nem setor.
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "GRUPOS");
  if (bloqueio) return bloqueio;

  const conversas = await prisma.conversation.findMany({
    where: { tenantId: user.tenantId, contact: { grupo: true, grupoAtivadoEm: { not: null } } },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      contact: {
        select: {
          id: true,
          name: true,
          waJid: true,
          phoneNumber: true,
          avatarUrl: true,
          lastStatusAt: true,
          grupoParticipantes: true,
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true, direction: true, createdAt: true, autorNome: true },
      },
      _count: { select: { messages: { where: { direction: "INBOUND", readAt: null } } } },
    },
  });

  // Mesmo corte da lista do Inbox: a prévia é uma linha só.
  const PREVIEW_MAX = 120;
  return NextResponse.json(
    conversas.map(({ _count, messages, ...c }) => ({
      ...c,
      messages: messages.map((m) => ({ ...m, body: m.body.slice(0, PREVIEW_MAX) })),
      unreadCount: _count.messages,
    }))
  );
}
