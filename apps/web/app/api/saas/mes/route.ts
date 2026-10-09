import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { exigirRecurso } from "@/lib/plano";

const inteiro = z.number().int().min(0).max(10_000_000_000);

const schema = z.object({
  mes: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  visitantes: inteiro,
  investimentoCents: inteiro,
  cancelamentos: inteiro,
  mrrCanceladoCents: inteiro,
  /** null apaga o ponto de partida deste mês. */
  mrrInicialCents: inteiro.nullable(),
});

/** Grava o que foi digitado à mão para um mês (cria ou substitui). */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão informa estes dados" }, { status: 403 });
  const bloqueio = await exigirRecurso(user, "FUNIL_SAAS");
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const { mes, ...dados } = parsed.data;

  await prisma.metricaMensal.upsert({
    where: { tenantId_mes: { tenantId: user.tenantId, mes } },
    update: dados,
    create: { tenantId: user.tenantId, mes, ...dados },
  });
  return NextResponse.json({ ok: true });
}
