import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { guardaFinanceiro } from "@/lib/guarda-financeiro";
import { achaOuCriaFornecedor, ErroDePagar } from "@/lib/contas-pagar";

/** Fornecedores da empresa (busca por nome). Alimenta o filtro e a conta nova. */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  const fornecedores = await prisma.fornecedor.findMany({
    where: { tenantId: user.tenantId, ativo: true, ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { nome: "asc" },
    take: 30,
    select: { id: true, nome: true, telefone: true },
  });
  return NextResponse.json(fornecedores);
}

const schema = z.object({
  nome: z.string().trim().min(1).max(120),
  telefone: z.string().trim().max(30).optional(),
  documento: z.string().trim().max(30).optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "informe o nome do fornecedor" }, { status: 400 });

  try {
    const f = await achaOuCriaFornecedor(prisma, user.tenantId, { nome: parsed.data.nome });
    if (parsed.data.telefone || parsed.data.documento) {
      await prisma.fornecedor.update({
        where: { id: f.id },
        data: { ...(parsed.data.telefone ? { telefone: parsed.data.telefone } : {}), ...(parsed.data.documento ? { documento: parsed.data.documento } : {}) },
      });
    }
    return NextResponse.json(f, { status: 201 });
  } catch (e) {
    if (e instanceof ErroDePagar) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
