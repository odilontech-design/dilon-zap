import { prisma } from "@dilon-zap/db";
import type { PaymentMethod } from "@prisma/client";
import { saldoDoPedido, faixaDeVencimento, diasDeAtraso, precisaLembrarHoje } from "@dilon-zap/receivables";
import type { Faixa } from "@dilon-zap/receivables";

// Reexportados pra quem já importa daqui (rotas de API, a tela, o teste
// manual) não precisar saber que a matemática pura mudou de endereço.
export { saldoDoPedido, faixaDeVencimento, diasDeAtraso, precisaLembrarHoje, mesmoDiaCalendario } from "@dilon-zap/receivables";
export type { Faixa };

/**
 * Contas a receber: quem deve, quanto e há quanto tempo.
 *
 * A matemática pura (saldo, faixa, régua do acompanhamento) mora em
 * @dilon-zap/receivables, reexportada aqui — o worker precisa dela também
 * pra decidir o mesmo dia de aviso que esta tela mostra (ver
 * apps/worker/src/receivables-followup.ts). O que fica só aqui é o que toca
 * banco.
 *
 * Mesma arquitetura do estoque, e de propósito. `Order.pago` é CACHE da soma
 * de Pagamento — só continua valendo se nunca for escrito por fora daqui.
 * Gravar o recebimento e atualizar o pedido precisam acontecer juntos ou não
 * acontecer, então tudo roda em transação e não existe um `update({ pago })`
 * solto em lugar nenhum.
 */

export type PagamentoInput = {
  orderId: string;
  tenantId: string;
  valorCents: number;
  meio?: PaymentMethod;
  recebidoEm?: Date;
  observacao?: string;
  userId?: string;
};

export async function registrarPagamento(entrada: PagamentoInput) {
  if (entrada.valorCents === 0) throw new Error("valor não pode ser zero");

  return prisma.$transaction(async (tx) => {
    const pedido = await tx.order.findFirst({
      where: { id: entrada.orderId, tenantId: entrada.tenantId },
      select: { id: true, status: true, totalCents: true, pagamentos: { select: { valorCents: true } } },
    });
    if (!pedido) throw new Error("pedido não encontrado");

    // Só pedido fechado tem valor congelado. Receber por um rascunho seria
    // lançar dinheiro contra um total que ainda vai mudar.
    if (pedido.status !== "FECHADO") {
      throw new Error("só pedido fechado pode receber pagamento");
    }

    const saldoAntes = saldoDoPedido(pedido.totalCents, pedido.pagamentos);

    // Receber mais do que se deve quase sempre é dígito trocado (200 no lugar
    // de 20). Barrar aqui evita um saldo negativo que ninguém entende depois.
    // Estorno passa: é valor negativo, e o teto não se aplica a ele.
    if (entrada.valorCents > 0 && entrada.valorCents > saldoAntes) {
      throw new Error(
        `valor maior que o saldo devedor (faltam ${(saldoAntes / 100).toFixed(2)})`
      );
    }

    await tx.pagamento.create({
      data: {
        orderId: pedido.id,
        valorCents: entrada.valorCents,
        meio: entrada.meio,
        recebidoEm: entrada.recebidoEm ?? new Date(),
        observacao: entrada.observacao?.trim() || null,
        createdById: entrada.userId,
      },
    });

    const saldoDepois = saldoAntes - entrada.valorCents;
    const quitado = saldoDepois <= 0;

    // O cache anda junto, na mesma transação. pagoEm só existe enquanto está
    // quitado: um estorno que reabre a dívida tem que limpar a data também,
    // senão o pedido fica "pago em 12/09" devendo 60 reais.
    await tx.order.update({
      where: { id: pedido.id },
      data: { pago: quitado, pagoEm: quitado ? (entrada.recebidoEm ?? new Date()) : null },
    });

    return { saldoDepois, quitado };
  });
}

/**
 * Tudo que a empresa tem a receber, já com saldo e faixa de atraso.
 *
 * Calculado na hora a partir dos pedidos, e não guardado como saldo no
 * contato: saldo denormalizado exige que todo caminho que mexe em pagamento
 * lembre de atualizá-lo, e no dia em que um caminho esquecer o número fica
 * errado sem avisar.
 */
export async function listarRecebiveis(tenantId: string) {
  const pedidos = await prisma.order.findMany({
    where: { tenantId, status: "FECHADO", pago: false },
    select: {
      id: true,
      numero: true,
      totalCents: true,
      vencimento: true,
      fechadoEm: true,
      paymentMethod: true,
      contact: { select: { id: true, name: true, waJid: true, phoneNumber: true } },
      conversationId: true,
      pagamentos: { select: { valorCents: true } },
    },
    // Sem prazo vai pro fim: são os que ninguém combinou data, e cobrar quem
    // tem data marcada vencida rende mais do que cobrar quem nunca teve prazo.
    orderBy: [{ vencimento: { sort: "asc", nulls: "last" } }, { fechadoEm: "asc" }],
  });

  const agora = new Date();

  return pedidos.map((p) => {
    const saldoCents = saldoDoPedido(p.totalCents, p.pagamentos);
    const faixa = faixaDeVencimento(p.vencimento, agora);
    return {
      id: p.id,
      numero: p.numero,
      contato: p.contact,
      conversationId: p.conversationId,
      totalCents: p.totalCents,
      saldoCents,
      // Parcial é informação: "pagou 60 de 200" muda a conversa da cobrança.
      parcial: saldoCents > 0 && saldoCents < p.totalCents,
      vencimento: p.vencimento,
      faixa,
      diasAtraso: p.vencimento && faixa === "vencido" ? diasDeAtraso(p.vencimento, agora) : 0,
      paymentMethod: p.paymentMethod,
      // Mesmo dia em que o acompanhamento interno avisa o financeiro (ver
      // apps/worker/src/receivables-followup.ts) — pra quem está olhando a
      // tela na hora não precisar depender só do push pra saber o que
      // puxar primeiro.
      precisaAtencaoHoje: p.vencimento ? precisaLembrarHoje(p.vencimento, agora) : false,
    };
  });
}
