import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { temVisaoLivreDoTenant } from "@/lib/conversation-access";

/**
 * Os canais que este usuário enxerga: Geral (sempre) + os setores de que faz
 * parte (todos, se for Responsável/superadmin). Um canal É um Setor — ver
 * lib/team-chat.ts.
 */
export async function GET() {
  const user = await requireUser();

  const setores = await prisma.setor.findMany({
    where: {
      tenantId: user.tenantId,
      ativo: true,
      // Responsável e superadmin veem todos; os demais só onde são membro.
      ...(temVisaoLivreDoTenant(user.role) ? {} : { membros: { some: { userId: user.id } } }),
    },
    select: { id: true, nome: true, cor: true },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json([{ setorId: null, nome: "Geral", cor: null }, ...setores.map((s) => ({ setorId: s.id, nome: s.nome, cor: s.cor }))]);
}
