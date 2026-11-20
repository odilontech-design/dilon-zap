import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { painelCentralDeLeads } from "@/lib/central-leads";
import { novoTokenDeEmail } from "@/lib/lead-email";

async function gestao() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return { bloqueio };
  if (!ehGerencia(user.role)) return { bloqueio: NextResponse.json({ error: "só a gestão cuida da central de leads" }, { status: 403 }) };
  return { user };
}

const urlBase = (req: Request) => process.env.NEXTAUTH_URL || new URL(req.url).origin;

export async function GET(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await painelCentralDeLeads(user.tenantId, urlBase(req)));
}

/** Gera o endereço de entrada (ou troca por outro: o encaminhamento antigo para de valer). */
export async function POST() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  await novoTokenDeEmail(user.tenantId);
  return NextResponse.json({ ok: true });
}

/** Liga ou desliga a distribuição dos leads novos entre os vendedores. */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = z.object({ distribuirLeads: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  await prisma.veiculosConfig.upsert({ where: { tenantId: user.tenantId }, create: { tenantId: user.tenantId, distribuirLeads: parsed.data.distribuirLeads }, update: { distribuirLeads: parsed.data.distribuirLeads } });
  return NextResponse.json({ ok: true });
}
