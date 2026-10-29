import { prisma, type Prisma } from "@dilon-zap/db";

/**
 * Lista de pedidos da tela Pedidos, com busca, filtros e totais que fecham
 * (Believe, 23/10: a soma da tela não batia).
 *
 * O que estava errado: o aviso "a receber" somava o TOTAL de todo pedido
 * fechado não quitado — num Recorrente com entrada paga, contava a entrada
 * como se faltasse — e só olhava os 100 mais recentes. Aqui o recebido de
 * cada pedido é a soma dos pagamentos ligados a ele (direto ou pela conta do
 * A receber que ele gerou), e os totais são de TODOS os pedidos do filtro.
 */

export type FiltroPedidos = {
  status?: string | null;
  q?: string | null;
  de?: Date;
  ate?: Date;
  forma?: string | null;
  pagamento?: "pago" | "aberto" | null;
};

const LIMITE = 200;

function onde(tenantId: string, f: FiltroPedidos): Prisma.OrderWhereInput {
  const termo = f.q?.trim();
  const numero = termo && /^#?\d+$/.test(termo) ? Number(termo.replace("#", "")) : null;
  // Fechado filtra pela data do fechamento; os outros, pela criação.
  const campoData = f.status === "FECHADO" ? "fechadoEm" : f.status === "CANCELADO" ? "canceladoEm" : "createdAt";
  return {
    tenantId,
    ...(f.status ? { status: f.status as never } : { status: { not: "CANCELADO" } }),
    ...(f.forma ? { paymentMethod: f.forma as never } : {}),
    ...(f.de || f.ate ? { [campoData]: { ...(f.de ? { gte: f.de } : {}), ...(f.ate ? { lte: f.ate } : {}) } } : {}),
    ...(termo
      ? {
          OR: [
            ...(numero !== null ? [{ numero }] : []),
            { contact: { name: { contains: termo, mode: "insensitive" as const } } },
            { contact: { phoneNumber: { contains: termo.replace(/\D/g, "") || termo } } },
            { items: { some: { nomeProduto: { contains: termo, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
}

/** Recebido por pedido: pagamentos do pedido + os da conta que ele gerou, sem contar duas vezes. */
async function recebidoPorPedido(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const pagamentos = await prisma.pagamento.findMany({
    where: { OR: [{ orderId: { in: ids } }, { conta: { orderId: { in: ids } } }] },
    select: { id: true, valorCents: true, orderId: true, conta: { select: { orderId: true } } },
  });
  const mapa = new Map<string, number>();
  for (const p of pagamentos) {
    const dono = p.orderId ?? p.conta?.orderId;
    if (dono) mapa.set(dono, (mapa.get(dono) ?? 0) + p.valorCents);
  }
  return mapa;
}

export async function listarPedidos<S extends Prisma.OrderSelect>(tenantId: string, f: FiltroPedidos, select: S) {
  const where = onde(tenantId, f);

  const [pedidos, todos] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: LIMITE, select }),
    // Para os totais: só o necessário de TODOS os que batem com o filtro.
    // subtotalCents só é gravado no fechamento: antes disso o valor é a soma dos
    // itens (Believe, 29/10: rascunhos apareciam zerados no total).
    prisma.order.findMany({ where, select: { id: true, status: true, totalCents: true, pago: true, items: { select: { precoUnitCents: true, quantidade: true } } } }),
  ]);

  const fechados = todos.filter((p) => p.status === "FECHADO");
  const recebido = await recebidoPorPedido(fechados.map((p) => p.id));

  // Filtro "pago / em aberto" depende do recebido, então é aplicado aqui — e
  // os totais seguem o mesmo recorte que a lista mostra.
  const saldo = (id: string, total: number, pago: boolean) => (pago ? 0 : Math.max(0, total - (recebido.get(id) ?? 0)));
  const passa = (p: { id: string; status: string; totalCents: number; pago: boolean }) =>
    !f.pagamento || (p.status === "FECHADO" && (f.pagamento === "pago" ? saldo(p.id, p.totalCents, p.pago) === 0 : saldo(p.id, p.totalCents, p.pago) > 0));
  const filtrados = todos.filter(passa);

  let totalCents = 0;
  let recebidoCents = 0;
  let aReceberCents = 0;
  let qtdAReceber = 0;
  for (const p of filtrados) {
    // Rascunho e aguardando ainda não têm total fechado: vale o subtotal dos itens.
    totalCents += p.status === "FECHADO" ? p.totalCents : p.items.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0);
  }
  for (const p of filtrados.filter((x) => x.status === "FECHADO")) {
    // Pedido marcado como pago (Pix, cartão, dinheiro no ato) vale como recebido.
    const r = p.pago ? p.totalCents : Math.min(recebido.get(p.id) ?? 0, p.totalCents);
    recebidoCents += r;
    const falta = p.totalCents - r;
    if (falta > 0) {
      aReceberCents += falta;
      qtdAReceber++;
    }
  }

  const lista = (pedidos as unknown as ({ id: string; status: string; totalCents: number; pago: boolean } & Record<string, unknown>)[]).filter(passa);

  return {
    pedidos: lista.map((p) => ({
      ...p,
      recebidoCents: p.status === "FECHADO" ? (p.pago ? p.totalCents : Math.min(recebido.get(p.id) ?? 0, p.totalCents)) : 0,
      saldoCents: p.status === "FECHADO" ? saldo(p.id, p.totalCents, p.pago) : 0,
    })),
    totais: {
      quantidade: filtrados.length,
      mostrando: Math.min(lista.length, LIMITE),
      totalCents,
      recebidoCents,
      aReceberCents,
      qtdAReceber,
    },
  };
}
