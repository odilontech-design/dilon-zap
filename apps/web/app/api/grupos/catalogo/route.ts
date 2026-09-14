import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";

// Todos os grupos que o número conhece, ativos ou não — é a lista de
// "Gerenciar grupos", de onde a equipe escolhe quais acompanhar.
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "GRUPOS");
  if (bloqueio) return bloqueio;

  const grupos = await prisma.contact.findMany({
    where: { tenantId: user.tenantId, grupo: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      waJid: true,
      phoneNumber: true,
      avatarUrl: true,
      lastStatusAt: true,
      grupoAtivadoEm: true,
      grupoParticipantes: true,
    },
  });

  return NextResponse.json(grupos);
}
