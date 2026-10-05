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
 * Instante em que começou o mês corrente no fuso da empresa.
 *
 * Não dá pra usar meia-noite UTC: o container roda em UTC e o Brasil é UTC-3,
 * então "início do mês" em UTC é o dia 31 às 21h daqui — e todo recebimento
 * das últimas três horas do mês passado entraria no total deste mês.
 */
function inicioDoMesNoFuso(agora: Date, tz: string): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")!.value);
  const mes = Number(partes.find((p) => p.type === "month")!.value);

  // Meia-noite "ingênua" do dia 1, corrigida pelo deslocamento do fuso naquele
  // instante — assim vale também pra quem usa um fuso com horário de verão.
  const ingenuo = Date.UTC(ano, mes - 1, 1);
  const referencia = new Date(ingenuo);
  const deslocamento =
    new Date(referencia.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(referencia.toLocaleString("en-US", { timeZone: tz })).getTime();
  return new Date(ingenuo + deslocamento);
}

/** Quanto entrou no caixa no mês corrente, no fuso da empresa. */
export async function recebidoNoMes(tenantId: string, timezone: string, agora = new Date()) {
  const soma = await prisma.pagamento.aggregate({
    where: { order: { tenantId }, recebidoEm: { gte: inicioDoMesNoFuso(agora, timezone) } },
    _sum: { valorCents: true },
  });
  // Estorno entra como valor negativo e abate — é o número do caixa, não o
  // de quantas vezes alguém clicou em registrar.
  return soma._sum.valorCents ?? 0;
}

/**
 * Histórico de recebimentos: o que já entrou, do mais recente pro mais antigo.
 *
 * A tela de A receber mostra só quem deve, e o pedido some dela quando é
 * quitado — some junto a prova de que foi pago. Este histórico é o outro lado:
 * lista os pagamentos registrados, com o pedido e o cliente de cada um.
 */
export async function listarHistoricoRecebido(tenantId: string, desde: Date, limite = 300) {
  const pagamentos = await prisma.pagamento.findMany({
    where: { order: { tenantId }, recebidoEm: { gte: desde } },
    orderBy: { recebidoEm: "desc" },
    take: limite,
    select: {
      id: true,
      valorCents: true,
      recebidoEm: true,
      meio: true,
      observacao: true,
      order: {
        select: {
          id: true,
          numero: true,
          totalCents: true,
          pago: true,
          conversationId: true,
          contact: { select: { id: true, name: true, waJid: true, phoneNumber: true } },
        },
      },
    },
  });

  return pagamentos.map((p) => ({
    id: p.id,
    valorCents: p.valorCents,
    recebidoEm: p.recebidoEm,
    meio: p.meio,
    observacao: p.observacao,
    numero: p.order.numero,
    orderId: p.order.id,
    totalCents: p.order.totalCents,
    // Quitado de vez ou foi só uma parcela: muda como a linha é lida.
    quitado: p.order.pago,
    conversationId: p.order.conversationId,
    contato: p.order.contact,
  }));
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
