import { prisma } from "@dilon-zap/db";
import type { PaymentMethod } from "@prisma/client";

/**
 * Regras do pedido que não podem morar numa rota.
 *
 * Fechar pedido faz três coisas ao mesmo tempo: congela os totais, baixa o
 * estoque de cada item e marca o pedido como fechado. Se qualquer uma
 * acontecer sem as outras, o sistema fica mentindo — estoque baixado num
 * pedido que não fechou, ou pedido fechado sem baixar estoque. Por isso tudo
 * numa transação só, e por isso aqui e não espalhado.
 */

export function calcularTotais(
  itens: { precoUnitCents: number; quantidade: number }[],
  descontoCents: number
) {
  const subtotalCents = itens.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0);
  // Desconto nunca deixa o total negativo: um desconto digitado errado
  // viraria "a empresa deve ao cliente" no relatório.
  const desconto = Math.min(Math.max(descontoCents, 0), subtotalCents);
  return { subtotalCents, descontoCents: desconto, totalCents: subtotalCents - desconto };
}

export type FecharInput = {
  orderId: string;
  tenantId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  descontoCents: number;
  /** PIX e cartão saem pagos na hora; boleto e fiado ficam a receber. */
  pago: boolean;
  observacao?: string;
};

export async function fecharPedido(input: FecharInput) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.order.findFirst({
      where: { id: input.orderId, tenantId: input.tenantId },
      include: { items: true },
    });
    if (!pedido) throw new Error("pedido não encontrado");

    // A trava contra baixa dupla. Sem ela, dois cliques no botão Fechar (ou
    // um clique e um retry do navegador) tirariam o estoque duas vezes — e
    // como a segunda baixa é uma movimentação legítima no histórico, ninguém
    // descobriria pelo extrato que houve duplicidade.
    if (pedido.status === "FECHADO") {
      return { jaEstavaFechado: true, pedido };
    }
    if (pedido.status === "CANCELADO") throw new Error("pedido cancelado não pode ser fechado");
    if (pedido.items.length === 0) throw new Error("pedido sem itens");

    const totais = calcularTotais(pedido.items, input.descontoCents);
    const agora = new Date();

    // Baixa de estoque item a item. Repete a lógica de registrarMovimento
    // aqui dentro em vez de chamá-la porque aquela função abre a própria
    // transação — chamar de dentro desta aninharia transação, e o rollback
    // do pedido não desfaria a baixa.
    for (const item of pedido.items) {
      if (!item.productId) continue; // item avulso, digitado à mão

      const produto = await tx.product.update({
        where: { id: item.productId },
        data: { stockQty: { decrement: item.quantidade } },
        select: { stockQty: true },
      });

      await tx.stockMovement.create({
        data: {
          tenantId: input.tenantId,
          productId: item.productId,
          tipo: "VENDA",
          quantidade: -item.quantidade,
          motivo: `Pedido #${pedido.numero}`,
          saldoDepois: produto.stockQty,
          createdById: input.userId,
        },
      });
    }

    const atualizado = await tx.order.update({
      where: { id: pedido.id },
      data: {
        status: "FECHADO",
        paymentMethod: input.paymentMethod,
        pago: input.pago,
        pagoEm: input.pago ? agora : null,
        subtotalCents: totais.subtotalCents,
        descontoCents: totais.descontoCents,
        totalCents: totais.totalCents,
        observacao: input.observacao?.trim() || pedido.observacao,
        closedById: input.userId,
        fechadoEm: agora,
      },
      include: { items: true },
    });

    return { jaEstavaFechado: false, pedido: atualizado };
  });
}

/**
 * Quanto o cliente deve: soma dos pedidos fechados e não pagos.
 *
 * É o "fiado" do Smart POS. Calculado na hora a partir dos pedidos, e não
 * guardado como saldo no contato: saldo denormalizado exige que todo caminho
 * que muda pagamento lembre de atualizá-lo, e o dia em que um caminho
 * esquecer, o número fica errado sem avisar.
 */
export async function saldoDevedor(tenantId: string, contactId: string) {
  const r = await prisma.order.aggregate({
    where: { tenantId, contactId, status: "FECHADO", pago: false },
    _sum: { totalCents: true },
    _count: true,
  });
  return { totalCents: r._sum.totalCents ?? 0, pedidos: r._count };
}
