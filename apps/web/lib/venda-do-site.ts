import { prisma } from "@dilon-zap/db";
import type { PaymentMethod } from "@prisma/client";
import { totalDaVenda } from "./venda-do-site-total";
import { upsertContactByPhone } from "./contact-server";

/**
 * Venda paga da loja online virando pedido aqui, para o dinheiro entrar no Financeiro da Believe (pedido de
 * 18/11/2026). O site manda cada venda paga (e o estorno, se ela for cancelada ou reembolsada) para
 * POST /api/integracao/vendas.
 *
 * - O pedido nasce FECHADO e PAGO, com o recebimento no extrato (PIX, cartão ou boleto), a cliente como contato
 *   (achada pelo telefone) e os itens do site. Frete entra como um item avulso "Frete", para o total do pedido ser
 *   exatamente o que a cliente pagou; desconto (combo, cupom, indicação, cashback) vai no desconto do pedido.
 * - O ESTOQUE NÃO é baixado aqui. Ele vem por BaixaDoSite (lib/estoque-do-site.ts), que já trata o produto sem
 *   vínculo e o estorno. Baixar nos dois lugares descontaria duas vezes. Pelo mesmo motivo o pedido do site não
 *   pode ser cancelado pela tela (cancelarPedido recusa): o cancelamento no site manda o estorno de estoque e de
 *   valor juntos, pelas duas portas.
 * - Idempotente pela referência: VendaDoSite tem chave única, então repetir o envio devolve o mesmo pedido.
 */

export class ErroDeVendaDoSite extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type ItemDaVenda = { codigo: string; nome: string; quantidade: number; precoUnitCents: number };

export type VendaRecebida = {
  referencia: string;
  pedido?: string | null;
  cliente: { nome: string; telefone: string };
  itens: ItemDaVenda[];
  freteCents: number;
  descontoCents: number;
  totalCents: number;
  meio: "PIX" | "CARTAO" | "BOLETO";
  pagoEm?: Date | null;
};

const MEIO: Record<VendaRecebida["meio"], PaymentMethod> = { PIX: "PIX", CARTAO: "CARTAO", BOLETO: "BOLETO" };

const obs = (pedido: string | null) => `Venda no site${pedido ? ` — pedido ${pedido}` : ""}`;

export async function registrarVendaDoSite(tenantId: string, v: VendaRecebida) {
  const pedido = v.pedido?.trim() || null;
  const ja = await prisma.vendaDoSite.findUnique({
    where: { tenantId_referencia: { tenantId, referencia: v.referencia } },
    include: { order: { select: { id: true, numero: true } } },
  });
  if (ja) return { duplicada: true, orderId: ja.order.id, numero: ja.order.numero };

  const totais = totalDaVenda(v);
  if (totais.totalCents !== v.totalCents) {
    // O site e o Dilon Zap discordam do valor: melhor recusar a lançar um número que o extrato não explica.
    throw new ErroDeVendaDoSite(
      `total não confere: itens + frete − desconto = ${totais.totalCents}, mas o site mandou ${v.totalCents}`
    );
  }

  const digitos = v.cliente.telefone.replace(/\D/g, "");
  if (digitos.length < 10) throw new ErroDeVendaDoSite("telefone da cliente inválido");
  const { contact } = await upsertContactByPhone(tenantId, digitos, v.cliente.nome);

  const codigos = [...new Set(v.itens.map((i) => i.codigo))];
  const produtos = await prisma.product.findMany({
    where: { tenantId, codigoSite: { in: codigos } },
    select: { id: true, codigoSite: true },
  });
  const porCodigo = new Map(produtos.map((p) => [p.codigoSite!, p.id]));

  const agora = new Date();
  const pagoEm = v.pagoEm ?? agora;
  try {
    return await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          tenantId,
          contactId: contact.id,
          status: "FECHADO",
          paymentMethod: MEIO[v.meio],
          pago: true,
          pagoEm,
          fechadoEm: pagoEm,
          subtotalCents: totais.subtotalCents,
          descontoCents: totais.descontoCents,
          totalCents: totais.totalCents,
          observacao: obs(pedido),
          items: {
            create: [
              ...v.itens.map((i) => ({
                productId: porCodigo.get(i.codigo) ?? null,
                nomeProduto: i.nome,
                precoTabelaCents: i.precoUnitCents,
                precoUnitCents: i.precoUnitCents,
                quantidade: i.quantidade,
              })),
              ...(v.freteCents > 0
                ? [{ productId: null, nomeProduto: "Frete", precoTabelaCents: v.freteCents, precoUnitCents: v.freteCents, quantidade: 1 }]
                : []),
            ],
          },
        },
        select: { id: true, numero: true },
      });
      // Pago inteiro com saldo da carteira (total 0): o pedido existe, mas não entrou dinheiro.
      if (totais.totalCents > 0) {
        await tx.pagamento.create({
          data: {
            orderId: order.id,
            valorCents: totais.totalCents,
            meio: MEIO[v.meio],
            recebidoEm: pagoEm,
            observacao: obs(pedido),
          },
        });
      }
      await tx.vendaDoSite.create({ data: { tenantId, referencia: v.referencia, orderId: order.id } });
      return { duplicada: false, orderId: order.id, numero: order.numero };
    });
  } catch (e) {
    // Dois envios da mesma venda ao mesmo tempo: o índice único decide, e o segundo é só "já recebida".
    if ((e as { code?: string }).code === "P2002") {
      const r = await prisma.vendaDoSite.findUnique({
        where: { tenantId_referencia: { tenantId, referencia: v.referencia } },
        include: { order: { select: { id: true, numero: true } } },
      });
      if (r) return { duplicada: true, orderId: r.order.id, numero: r.order.numero };
    }
    throw e;
  }
}

/**
 * Cancelamento ou reembolso no site: o pedido daqui é cancelado e o que entrou volta como lançamento negativo,
 * por meio de pagamento, igual ao cancelarPedido. Não mexe no estoque (ver o aviso no topo).
 */
export async function estornarVendaDoSite(tenantId: string, referencia: string, pedido: string | null) {
  const venda = await prisma.vendaDoSite.findUnique({
    where: { tenantId_referencia: { tenantId, referencia } },
    include: { order: { include: { pagamentos: { select: { valorCents: true, meio: true } } } } },
  });
  if (!venda) return { semVenda: true as const };
  if (venda.estornadaEm || venda.order.status === "CANCELADO") return { duplicada: true as const, orderId: venda.order.id };

  const agora = new Date();
  const motivo = `Cancelada ou reembolsada no site${pedido ? ` — pedido ${pedido}` : ""}`;
  await prisma.$transaction(async (tx) => {
    const porMeio = new Map<string, number>();
    for (const p of venda.order.pagamentos) porMeio.set(p.meio ?? "", (porMeio.get(p.meio ?? "") ?? 0) + p.valorCents);
    for (const [meio, valor] of porMeio) {
      if (valor <= 0) continue;
      await tx.pagamento.create({
        data: {
          orderId: venda.order.id,
          valorCents: -valor,
          meio: (meio || undefined) as never,
          recebidoEm: agora,
          observacao: `Estorno — ${motivo}`.slice(0, 300),
        },
      });
    }
    await tx.order.update({
      where: { id: venda.order.id },
      data: { status: "CANCELADO", canceladoEm: agora, motivoCancelamento: motivo, canceladoPorNome: "Loja online", pago: false },
    });
    await tx.vendaDoSite.update({ where: { id: venda.id }, data: { estornadaEm: agora } });
  });
  return { duplicada: false as const, orderId: venda.order.id };
}
