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
  /** Quando o cliente combinou de pagar. Só usado quando `pago` é falso. */
  vencimento?: Date | null;
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

      // Serviço passa direto: não tem saldo pra baixar nem extrato pra
      // registrar. Sem esta linha, vender uma consultoria criaria uma
      // movimentação de VENDA e levaria o "estoque" dela a -1, -2, -3 — um
      // número que não quer dizer nada e que apareceria vermelho na tela de
      // produtos, como se algo estivesse errado no cadastro.
      const cadastro = await tx.product.findUnique({
        where: { id: item.productId },
        select: { tipo: true },
      });
      if (cadastro?.tipo === "SERVICO") continue;

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

    // Pedido que fecha pago já nasce com o recebimento no extrato. Marcar só
    // a flag deixaria o histórico mentindo por omissão: o pedido apareceria
    // quitado e o extrato, vazio — e aí "quanto entrou em setembro" daria
    // menos do que entrou de verdade.
    //
    // Criado aqui dentro, e não chamando registrarPagamento(), porque aquela
    // função abre a própria transação: chamada de dentro desta aninharia
    // transação, e o rollback do fechamento não desfaria o pagamento. Mesmo
    // motivo da baixa de estoque logo acima.
    if (input.pago && totais.totalCents > 0) {
      await tx.pagamento.create({
        data: {
          orderId: pedido.id,
          valorCents: totais.totalCents,
          meio: input.paymentMethod,
          recebidoEm: agora,
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
        // Prazo só faz sentido em pedido que fecha devendo. Em PIX ou cartão
        // o dinheiro já entrou, e uma data de vencimento ali confundiria a
        // lista de recebíveis com algo que não é dívida.
        vencimento: input.pago ? null : (input.vencimento ?? null),
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
  // Traz os pagamentos junto em vez de somar totalCents: com pagamento
  // parcial, somar o total do pedido diria que o cliente deve 200 quando ele
  // já pagou 140. Enquanto `pago` era sim/não os dois davam no mesmo — agora
  // não dão mais, e esta função é a que a ficha do contato mostra.
  const pedidos = await prisma.order.findMany({
    where: { tenantId, contactId, status: "FECHADO", pago: false },
    select: { totalCents: true, pagamentos: { select: { valorCents: true } } },
  });

  const totalCents = pedidos.reduce(
    (soma, p) => soma + p.totalCents - p.pagamentos.reduce((s, x) => s + x.valorCents, 0),
    0
  );
  return { totalCents, pedidos: pedidos.length };
}
