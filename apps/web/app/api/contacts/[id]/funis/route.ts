import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { garantirFunilPadrao } from "@/lib/funis";

/**
 * GET /api/contacts/[id]/funis — cada funil ativo da empresa, com as etapas e
 * a negociação em andamento deste contato nele (se houver). É o que a ficha e
 * o painel do Inbox mostram em "Etapa": antes só existia o funil principal, e
 * classificar uma conversa num segundo funil não tinha como.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const contato = await prisma.contact.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!contato) return NextResponse.json({ error: "contato não encontrado" }, { status: 404 });
  await garantirFunilPadrao(user.tenantId);

  const [funis, abertas] = await Promise.all([
    prisma.funil.findMany({
      where: { tenantId: user.tenantId, arquivadoEm: null },
      orderBy: [{ padrao: "desc" }, { position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        nome: true,
        padrao: true,
        etapas: { orderBy: { position: "asc" }, select: { id: true, name: true, color: true } },
      },
    }),
    prisma.negociacao.findMany({
      where: { contactId: contato.id, status: "ABERTA" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, funilId: true, stageId: true },
    }),
  ]);

  return NextResponse.json(
    funis.map((f) => ({
      ...f,
      // Mais de uma aberta no mesmo funil: vale a mais recente, a mesma que a
      // ficha move ao trocar a etapa.
      negociacao: abertas.find((n) => n.funilId === f.id) ?? null,
    }))
  );
}
