import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { abrirFicha, apagarFicha, fichasDaNegociacao } from "@/lib/ficha-financiamento";

/**
 * Fichas de financiamento da negociação (vindas do site). Sem ?ficha: a lista, sem dados.
 * Com ?ficha=<id>: a ficha aberta (cada abertura vai para a auditoria). Apagar é da gestão.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const n = await prisma.negociacao.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });
  const id = new URL(req.url).searchParams.get("ficha");
  if (!id) return NextResponse.json({ fichas: await fichasDaNegociacao(user.tenantId, n.id), podeApagar: ehGerencia(user.role) });
  const ficha = await abrirFicha(user.tenantId, n.id, id);
  if (!ficha) return NextResponse.json({ error: "ficha não encontrada (pode já ter sido apagada)" }, { status: 404 });
  await logAudit({ actor: user, action: "negociacao.ficha.ver", metadata: { negociacaoId: n.id, fichaId: id } });
  return NextResponse.json(ficha, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão apaga a ficha" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("ficha") ?? "";
  if (!(await apagarFicha(user.tenantId, params.id, id))) return NextResponse.json({ error: "ficha não encontrada" }, { status: 404 });
  await logAudit({ actor: user, action: "negociacao.ficha.apagar", metadata: { negociacaoId: params.id, fichaId: id } });
  return NextResponse.json({ ok: true });
}
