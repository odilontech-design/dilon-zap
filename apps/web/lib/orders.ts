import { prisma } from "@dilon-zap/db";
import type { PaymentMethod } from "@prisma/client";
import { estornarNaConta, garantirContaDoPedido, receberNaConta, reparcelarConta } from "@/lib/contas-receber";

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
  /** Competência cobrada ("Setembro/2026"), pro texto do recibo. */
  mesReferencia?: string;
  /**
   * Parcelamento combinado na hora (fiado da Believe): entrada + N parcelas
   * semanais, quinzenais ou mensais. Sem isto, o pedido devendo vira uma
   * parcela só, com o vencimento informado.
   */
  parcelamento?: {
    entradaCents: number;
    /** A entrada foi paga agora, no balcão: entra como recebimento. */
    entradaPaga: boolean;
    entradaMeio?: PaymentMethod;
    numParcelas: number;
    periodicidade: "SEMANAL" | "QUINZENAL" | "MENSAL";
    primeiroVencimento: Date;
  } | null;
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
        select: { tipo: true, custoCents: true },
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
          // Custo de agora: é o que entra no CMV deste mês, mesmo que mude depois.
          custoUnitCents: cadastro?.custoCents ?? null,
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
        mesReferencia: input.mesReferencia?.trim() || pedido.mesReferencia,
        closedById: input.userId,
        fechadoEm: agora,
      },
      include: { items: true },
    });

    // Pedido que fecha devendo vira uma conta a receber (uma parcela, com o
    // vencimento combinado). É dela que o A receber lê e que se reparcela.
    if (!input.pago && totais.totalCents > 0) {
      const conta = await garantirContaDoPedido(tx, pedido.id, input.userId);

      const plano = input.parcelamento;
      if (plano) {
        // A conta nasce com uma parcela do total; o plano a refaz como entrada +
        // parcelas. Tudo na mesma transação do fechamento: se o plano for
        // inválido (entrada maior que o total, por exemplo), o pedido não fecha
        // pela metade.
        await reparcelarConta(tx, {
          tenantId: input.tenantId,
          contaId: conta.id,
          entradaCents: plano.entradaCents || undefined,
          vencimentoEntrada: agora,
          numParcelas: plano.numParcelas,
          periodicidade: plano.periodicidade,
          primeiroVencimento: plano.primeiroVencimento,
        });

        if (plano.entradaPaga && plano.entradaMeio && plano.entradaCents > 0) {
          const entrada = await tx.parcela.findFirst({ where: { contaId: conta.id, tipo: "ENTRADA" }, select: { id: true } });
          await receberNaConta(tx, {
            tenantId: input.tenantId,
            contaId: conta.id,
            parcelaId: entrada?.id,
            valorCents: plano.entradaCents,
            // Sem forma informada a entrada não é dada como recebida (ver a rota).
            meio: plano.entradaMeio,
            recebidoEm: agora,
            observacao: "Entrada paga no fechamento",
            userId: input.userId,
          });
        }
      }
    }

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

/* ------------------------------------------------------------------------ *
 * Cancelar (e refazer) pedido — inclusive já fechado
 * ------------------------------------------------------------------------ */

export type CancelarInput = {
  orderId: string;
  tenantId: string;
  userId: string;
  userName: string;
  motivo: string;
  /** "Editar" um pedido fechado: cancela este e cria uma cópia para ajustar e fechar de novo. */
  refazer?: boolean;
};

/**
 * Cancela o pedido desfazendo o que o fechamento fez (pedido da Believe,
 * reunião de 14/10 — o pedido errado da cliente não tinha como sair):
 *
 * - estoque: devolve cada produto vendido, com movimentação DEVOLUCAO no
 *   extrato (serviço não tem estoque);
 * - financeiro: o que foi recebido entra como estorno (lançamento negativo,
 *   nunca apagando o que já aconteceu) e a conta a receber é cancelada.
 *
 * Com `refazer`, nasce uma cópia aguardando o financeiro, com os mesmos itens
 * e condição — é o "editar pedido fechado": ajusta, fecha de novo, e o
 * estoque e o financeiro saem certos. Tudo numa transação só.
 */
export async function cancelarPedido(input: CancelarInput) {
  const motivo = input.motivo.trim();
  if (motivo.length < 3) throw new Error("explique o motivo do cancelamento");

  return prisma.$transaction(async (tx) => {
    const pedido = await tx.order.findFirst({
      where: { id: input.orderId, tenantId: input.tenantId },
      include: {
        items: true,
        conta: { select: { id: true, canceladaEm: true } },
        pagamentos: { select: { valorCents: true, meio: true, contaId: true } },
      },
    });
    if (!pedido) throw new Error("pedido não encontrado");
    if (pedido.status === "CANCELADO") throw new Error("este pedido já está cancelado");

    const agora = new Date();
    const resumo = { itensDevolvidos: 0, estornadoCents: 0 };

    if (pedido.status === "FECHADO") {
      // Estoque de volta.
      for (const item of pedido.items) {
        if (!item.productId) continue;
        const cadastro = await tx.product.findUnique({ where: { id: item.productId }, select: { tipo: true, custoCents: true } });
        if (!cadastro || cadastro.tipo === "SERVICO") continue;
        // A devolução desfaz o CMV da venda: usa o custo com que ela saiu.
        const venda = await tx.stockMovement.findFirst({
          where: { productId: item.productId, tipo: "VENDA", motivo: `Pedido #${pedido.numero}` },
          orderBy: { createdAt: "desc" },
          select: { custoUnitCents: true },
        });
        const produto = await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantidade } },
          select: { stockQty: true },
        });
        await tx.stockMovement.create({
          data: {
            tenantId: input.tenantId,
            productId: item.productId,
            tipo: "DEVOLUCAO",
            quantidade: item.quantidade,
            motivo: `Cancelamento do pedido #${pedido.numero}`,
            saldoDepois: produto.stockQty,
            custoUnitCents: venda?.custoUnitCents ?? cadastro.custoCents ?? null,
            createdById: input.userId,
          },
        });
        resumo.itensDevolvidos += item.quantidade;
      }

      const observacaoEstorno = `Estorno — pedido #${pedido.numero} cancelado: ${motivo}`.slice(0, 300);

      if (pedido.conta && !pedido.conta.canceladaEm) {
        // Venda a prazo: estorna o recebido na conta e cancela as parcelas.
        const recebido = pedido.pagamentos.filter((p) => p.contaId).reduce((s, p) => s + p.valorCents, 0);
        if (recebido > 0) {
          await estornarNaConta(tx, {
            tenantId: input.tenantId,
            contaId: pedido.conta.id,
            valorCents: recebido,
            observacao: observacaoEstorno,
            userId: input.userId,
          });
          resumo.estornadoCents += recebido;
        }
        await tx.parcela.updateMany({ where: { contaId: pedido.conta.id, canceladaEm: null }, data: { canceladaEm: agora } });
        await tx.contaReceber.update({ where: { id: pedido.conta.id }, data: { canceladaEm: agora } });
      } else {
        // Pago na hora: o recebimento volta como lançamento negativo, por meio
        // de pagamento — assim o caixa do dia confere (dinheiro devolvido sai
        // da gaveta; PIX e cartão ficam no extrato).
        const porMeio = new Map<string, number>();
        for (const p of pedido.pagamentos.filter((x) => !x.contaId)) {
          const chave = p.meio ?? "";
          porMeio.set(chave, (porMeio.get(chave) ?? 0) + p.valorCents);
        }
        for (const [meio, valor] of porMeio) {
          if (valor <= 0) continue;
          await tx.pagamento.create({
            data: {
              orderId: pedido.id,
              valorCents: -valor,
              meio: (meio || undefined) as never,
              recebidoEm: agora,
              observacao: observacaoEstorno,
              createdById: input.userId,
            },
          });
          resumo.estornadoCents += valor;
        }
      }
    }

    await tx.order.update({
      where: { id: pedido.id },
      data: {
        status: "CANCELADO",
        canceladoEm: agora,
        motivoCancelamento: motivo,
        canceladoPorNome: input.userName,
        pago: false,
      },
    });

    let copia: { id: string; numero: number } | null = null;
    if (input.refazer) {
      copia = await tx.order.create({
        data: {
          tenantId: input.tenantId,
          contactId: pedido.contactId,
          conversationId: pedido.conversationId,
          createdById: input.userId,
          negociacaoId: pedido.negociacaoId,
          status: "AGUARDANDO_FINANCEIRO",
          enviadoAoFinanceiroEm: agora,
          paymentMethod: pedido.paymentMethod,
          planoEntradaCents: pedido.planoEntradaCents,
          planoNumParcelas: pedido.planoNumParcelas,
          planoPeriodicidade: pedido.planoPeriodicidade,
          planoPrimeiroVencimento: pedido.planoPrimeiroVencimento,
          observacao: pedido.observacao,
          mesReferencia: pedido.mesReferencia,
          descontoCents: pedido.descontoCents,
          refeitoDeNumero: pedido.numero,
          items: {
            create: pedido.items.map((i) => ({
              productId: i.productId,
              nomeProduto: i.nomeProduto,
              precoTabelaCents: i.precoTabelaCents,
              precoUnitCents: i.precoUnitCents,
              quantidade: i.quantidade,
            })),
          },
        },
        select: { id: true, numero: true },
      });
    }

    return { ...resumo, copia, eraFechado: pedido.status === "FECHADO" };
  });
}
