import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { registrarMovimento } from "@/lib/stock";
import { logAudit } from "@/lib/audit";

// Quem mexe no estoque: Responsável e Financeiro. A consultora consulta o
// saldo (vai precisar ao montar pedido) mas não lança entrada nem ajuste.
function podeMexer(role: string) {
  return role === "OWNER" || role === "FINANCEIRO";
}

/** Extrato do produto: as últimas movimentações, da mais recente pra trás. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const produto = await prisma.product.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, name: true, stockQty: true },
  });
  if (!produto) return NextResponse.json({ error: "not found" }, { status: 404 });

  const movimentos = await prisma.stockMovement.findMany({
    where: { productId: produto.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      tipo: true,
      quantidade: true,
      motivo: true,
      saldoDepois: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json({ produto, movimentos });
}

const bodySchema = z.object({
  tipo: z.enum(["COMPRA", "PRODUCAO", "DEVOLUCAO", "AJUSTE"]),
  // VENDA não entra aqui de propósito: saída por venda é consequência de
  // fechar um pedido, não algo que se lança à mão. Deixar disponível seria
  // convidar a dar baixa por fora e o estoque parar de bater com as vendas.
  quantidade: z.number().int(),
  motivo: z.string().trim().max(200).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (!podeMexer(user.role)) return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { tipo, quantidade, motivo } = parsed.data;
  if (quantidade === 0) return NextResponse.json({ error: "quantidade não pode ser zero" }, { status: 400 });
  if (tipo !== "AJUSTE" && quantidade < 0) {
    return NextResponse.json({ error: "quantidade deve ser positiva — para tirar do estoque, use Ajuste" }, { status: 400 });
  }

  const produto = await prisma.product.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, name: true },
  });
  if (!produto) return NextResponse.json({ error: "not found" }, { status: 404 });

  const r = await registrarMovimento({
    tenantId: user.tenantId,
    productId: produto.id,
    tipo,
    quantidade,
    motivo,
    createdById: user.id,
  });

  await logAudit({
    actor: user,
    action: "stock.movement",
    metadata: { productId: produto.id, produto: produto.name, tipo, quantidade, saldo: r?.saldo },
  });

  return NextResponse.json({ saldo: r?.saldo ?? 0 }, { status: 201 });
}
