import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { fecharPedido } from "@/lib/orders";
import { logAudit } from "@/lib/audit";

function ehFinanceiro(role: string) {
  return role === "OWNER" || role === "FINANCEIRO";
}

const itemSchema = z.object({
  productId: z.string().nullable().optional(),
  nomeProduto: z.string().trim().min(1).max(120),
  precoTabelaCents: z.number().int().min(0),
  precoUnitCents: z.number().int().min(0),
  quantidade: z.number().int().min(1).max(9999),
});

const patchSchema = z.object({
  acao: z.enum(["salvarItens", "enviarAoFinanceiro", "fechar", "cancelar", "marcarPago"]),
  itens: z.array(itemSchema).max(100).optional(),
  observacao: z.string().trim().max(500).optional(),
  descontoCents: z.number().int().min(0).optional(),
  paymentMethod: z.enum(["PIX", "CARTAO", "BOLETO", "FIADO"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const pedido = await prisma.order.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, numero: true, status: true, contactId: true },
  });
  if (!pedido) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { acao } = parsed.data;

  // Fechar, cancelar e marcar pago são do financeiro. Montar e enviar são de
  // quem atende — é a divisão real do fluxo da Believe.
  if (["fechar", "cancelar", "marcarPago"].includes(acao) && !ehFinanceiro(user.role)) {
    return NextResponse.json({ error: "só o financeiro pode fazer isso" }, { status: 403 });
  }

  if (pedido.status === "FECHADO" && acao !== "marcarPago") {
    return NextResponse.json({ error: "pedido já fechado" }, { status: 400 });
  }
  if (pedido.status === "CANCELADO") {
    return NextResponse.json({ error: "pedido cancelado" }, { status: 400 });
  }

  if (acao === "salvarItens") {
    const itens = parsed.data.itens ?? [];
    // Troca a lista inteira em vez de diferenciar item a item: a tela edita o
    // pedido como um bloco, e reconciliar adição/remoção/alteração renderia
    // um monte de caso de borda pra economizar nada.
    await prisma.$transaction([
      prisma.orderItem.deleteMany({ where: { orderId: pedido.id } }),
      ...(itens.length > 0
        ? [prisma.orderItem.createMany({ data: itens.map((i) => ({ ...i, orderId: pedido.id })) })]
        : []),
      prisma.order.update({
        where: { id: pedido.id },
        data: { observacao: parsed.data.observacao ?? undefined },
      }),
    ]);
    return NextResponse.json({ ok: true });
  }

  if (acao === "enviarAoFinanceiro") {
    const qtdItens = await prisma.orderItem.count({ where: { orderId: pedido.id } });
    if (qtdItens === 0) {
      return NextResponse.json({ error: "adicione pelo menos um item antes de enviar" }, { status: 400 });
    }
    await prisma.order.update({
      where: { id: pedido.id },
      data: { status: "AGUARDANDO_FINANCEIRO", enviadoAoFinanceiroEm: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  if (acao === "cancelar") {
    await prisma.order.update({
      where: { id: pedido.id },
      data: { status: "CANCELADO", canceladoEm: new Date() },
    });
    await logAudit({ actor: user, action: "order.cancel", metadata: { numero: pedido.numero } });
    return NextResponse.json({ ok: true });
  }

  if (acao === "marcarPago") {
    await prisma.order.update({
      where: { id: pedido.id },
      data: { pago: true, pagoEm: new Date() },
    });
    await logAudit({ actor: user, action: "order.paid", metadata: { numero: pedido.numero } });
    return NextResponse.json({ ok: true });
  }

  // fechar
  if (!parsed.data.paymentMethod) {
    return NextResponse.json({ error: "escolha a forma de pagamento" }, { status: 400 });
  }

  // PIX e cartão saem pagos na hora. Boleto e fiado ficam a receber — é o que
  // faz o saldo devedor do cliente existir.
  const pagoNaHora = parsed.data.paymentMethod === "PIX" || parsed.data.paymentMethod === "CARTAO";

  try {
    const r = await fecharPedido({
      orderId: pedido.id,
      tenantId: user.tenantId,
      userId: user.id,
      paymentMethod: parsed.data.paymentMethod,
      descontoCents: parsed.data.descontoCents ?? 0,
      pago: pagoNaHora,
      observacao: parsed.data.observacao,
    });

    if (!r.jaEstavaFechado) {
      await logAudit({
        actor: user,
        action: "order.close",
        metadata: {
          numero: pedido.numero,
          total: r.pedido.totalCents,
          pagamento: parsed.data.paymentMethod,
        },
      });
    }

    return NextResponse.json({ ok: true, jaEstavaFechado: r.jaEstavaFechado, total: r.pedido.totalCents });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
