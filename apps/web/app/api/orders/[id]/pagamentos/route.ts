import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { registrarPagamento } from "@/lib/receivables";
import { logAudit } from "@/lib/audit";

const corpoSchema = z.object({
  // Em centavos. Negativo é estorno — permitido de propósito, e é o único
  // jeito de desfazer um recebimento sem apagar o histórico.
  valorCents: z.number().int().refine((v) => v !== 0, "valor não pode ser zero"),
  meio: z.enum(["PIX", "CARTAO", "BOLETO", "FIADO"]).optional(),
  // Quando o dinheiro entrou, que nem sempre é quando foi lançado.
  recebidoEm: z.string().datetime().optional(),
  observacao: z.string().trim().max(300).optional(),
});

function ehFinanceiro(role: string) {
  return role === "OWNER" || role === "FINANCEIRO";
}

/** Extrato de recebimentos do pedido. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "CONTAS_RECEBER");
  if (bloqueio) return bloqueio;

  const pedido = await prisma.order.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: {
      totalCents: true,
      vencimento: true,
      pago: true,
      pagamentos: {
        orderBy: { recebidoEm: "asc" },
        select: {
          id: true,
          valorCents: true,
          meio: true,
          recebidoEm: true,
          observacao: true,
          createdBy: { select: { name: true } },
        },
      },
    },
  });
  if (!pedido) return NextResponse.json({ error: "pedido não encontrado" }, { status: 404 });

  const recebido = pedido.pagamentos.reduce((s, p) => s + p.valorCents, 0);

  return NextResponse.json({
    totalCents: pedido.totalCents,
    recebidoCents: recebido,
    saldoCents: pedido.totalCents - recebido,
    vencimento: pedido.vencimento,
    pago: pedido.pago,
    pagamentos: pedido.pagamentos,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "CONTAS_RECEBER");
  if (bloqueio) return bloqueio;
  if (!ehFinanceiro(user.role)) {
    return NextResponse.json({ error: "só o financeiro pode registrar recebimento" }, { status: 403 });
  }

  const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const r = await registrarPagamento({
      orderId: params.id,
      tenantId: user.tenantId,
      valorCents: parsed.data.valorCents,
      meio: parsed.data.meio,
      recebidoEm: parsed.data.recebidoEm ? new Date(parsed.data.recebidoEm) : undefined,
      observacao: parsed.data.observacao,
      userId: user.id,
    });

    await logAudit({
      actor: user,
      action: "pedido.pagamento",
      metadata: { orderId: params.id, valorCents: parsed.data.valorCents, quitado: r.quitado },
    });

    return NextResponse.json(r);
  } catch (e) {
    // As recusas de registrarPagamento são de negócio ("valor maior que o
    // saldo", "pedido não fechado") e a pessoa precisa LER o motivo pra
    // corrigir. Um 500 genérico faria ela tentar de novo igual.
    const msg = e instanceof Error ? e.message : "não deu pra registrar";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
