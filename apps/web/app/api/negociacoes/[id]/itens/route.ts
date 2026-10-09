import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ErroDeNegocio, salvarItens } from "@/lib/negociacoes";

const itemSchema = z.object({
  productId: z.string().nullable().optional(),
  nomeProduto: z.string().trim().min(1).max(120),
  precoTabelaCents: z.number().int().min(0).max(10_000_000_000),
  precoUnitCents: z.number().int().min(0).max(10_000_000_000),
  quantidade: z.number().int().min(1).max(9999),
  cobranca: z.enum(["UNICA", "MENSAL"]).default("UNICA"),
});

const schema = z.object({ itens: z.array(itemSchema).max(100) });

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const n = await prisma.negociacao.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });

  const itens = await prisma.negociacaoItem.findMany({ where: { negociacaoId: n.id }, orderBy: { id: "asc" } });
  return NextResponse.json(itens);
}

/** Troca a lista de itens inteira e recalcula valor e MRR da negociação. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const n = await prisma.negociacao.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true, status: true } });
  if (!n) return NextResponse.json({ error: "negociação não encontrada" }, { status: 404 });
  // Proposta fechada não muda de valor por baixo dos indicadores.
  if (n.status !== "ABERTA") return NextResponse.json({ error: "reabra a negociação para editar os itens" }, { status: 409 });

  try {
    await salvarItens(n.id, user.tenantId, parsed.data.itens);
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
