import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";

/**
 * Fila de autocadastros. Pendentes primeiro, porque é o que exige ação; as
 * decididas ficam embaixo como histórico de quem já passou por aqui.
 */
export async function GET(req: Request) {
  await requireSuperAdmin();

  const status = new URL(req.url).searchParams.get("status");
  const where = status === "PENDENTE" ? { status: "PENDENTE" as const } : {};

  const solicitacoes = await prisma.solicitacaoDeAcesso.findMany({
    where,
    orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
    take: 200,
    select: {
      id: true,
      nome: true,
      empresa: true,
      email: true,
      telefone: true,
      documento: true,
      status: true,
      motivo: true,
      criadoEm: true,
      decididoEm: true,
      decididoPor: { select: { name: true } },
      tenant: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(solicitacoes);
}
