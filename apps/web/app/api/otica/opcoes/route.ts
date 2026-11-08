import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";

/**
 * O que as telas da ótica precisam para os campos de escolha: laboratórios
 * ativos (com o prazo, para sugerir a previsão) e a equipe (consultor).
 */
export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const [laboratorios, equipe, tenant] = await Promise.all([
    prisma.laboratorio.findMany({
      where: { tenantId: user.tenantId, ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, prazoDias: true },
    }),
    prisma.user.findMany({
      where: { tenantId: user.tenantId, role: { not: "SUPERADMIN" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: { timezone: true } }),
  ]);
  // O fuso da loja: as datas da tela são lidas e mostradas no relógio dela.
  return NextResponse.json({ laboratorios, equipe, eu: user.id, timezone: tenant.timezone, gestao: ehGerencia(user.role) });
}
