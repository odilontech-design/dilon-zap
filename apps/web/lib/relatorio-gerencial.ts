import { Prisma } from "@prisma/client";
import { prisma } from "@dilon-zap/db";
import { resumoDoAReceber, pendenciasPorContato } from "@/lib/contas-receber";
import { resumoAPagar } from "@/lib/contas-pagar";
import { caixaAberto, dadosDoCaixa } from "@/lib/caixa";
import {
  janelaDoMes,
  LIMITE_ESTOQUE_BAIXO,
  progressoDaMeta,
  ticketMedio,
  variacaoPercentual,
} from "@/lib/gerencial-calculos";

/**
 * Painel gerencial (Believe, 20/11): vendas e meta, financeiro, funil e
 * estoque/site, do mês em horário de Brasília. Só leitura.
 *
 * Cada seção é independente: se uma consulta falhar, as outras continuam
 * aparecendo e a que falhou vem como null com o aviso — um painel que some
 * inteiro porque um número deu erro é pior que um com um quadro faltando.
 */

async function secao<T>(nome: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[gerencial] seção ${nome} falhou:`, (e as Error).message);
    return null;
  }
}

type Janela = ReturnType<typeof janelaDoMes>;

async function vendas(tenantId: string, j: Janela, metaCents: number | null) {
  const fechado = (de: Date, ate: Date) => ({ tenantId, status: "FECHADO" as const, fechadoEm: { gte: de, lt: ate } });
  const [atual, anterior, porConsultora, delSite] = await Promise.all([
    prisma.order.aggregate({ where: fechado(j.inicio, j.fim), _sum: { totalCents: true }, _count: true }),
    prisma.order.aggregate({ where: fechado(j.inicioAnterior, j.inicio), _sum: { totalCents: true }, _count: true }),
    prisma.order.groupBy({
      by: ["createdById"],
      where: fechado(j.inicio, j.fim),
      _sum: { totalCents: true },
      _count: true,
      orderBy: { _sum: { totalCents: "desc" } },
    }),
    prisma.order.aggregate({
      where: { ...fechado(j.inicio, j.fim), vendaDoSite: { estornadaEm: null } },
      _sum: { totalCents: true },
      _count: true,
    }),
  ]);

  const ids = porConsultora.map((c) => c.createdById).filter((x): x is string => !!x);
  const usuarios = ids.length
    ? await prisma.user.findMany({ where: { id: { in: ids }, tenantId }, select: { id: true, name: true } })
    : [];
  const nome = new Map(usuarios.map((u) => [u.id, u.name]));

  const totalCents = atual._sum.totalCents ?? 0;
  const totalAnteriorCents = anterior._sum.totalCents ?? 0;
  return {
    totalCents,
    pedidos: atual._count,
    ticketMedioCents: ticketMedio(totalCents, atual._count),
    anterior: {
      totalCents: totalAnteriorCents,
      pedidos: anterior._count,
      variacaoPercentual: variacaoPercentual(totalCents, totalAnteriorCents),
    },
    meta: progressoDaMeta(totalCents, metaCents, j.diaDoMes, j.diasNoMes),
    porConsultora: porConsultora.map((c) => ({
      nome: c.createdById ? (nome.get(c.createdById) ?? "Ex-usuário") : "Sem consultora",
      totalCents: c._sum.totalCents ?? 0,
      pedidos: c._count,
    })),
    doSite: { totalCents: delSite._sum.totalCents ?? 0, pedidos: delSite._count },
  };
}

async function financeiro(tenantId: string, j: Janela) {
  const [aReceber, aPagar, caixa, recebidoNoMes, comLimite] = await Promise.all([
    resumoDoAReceber(tenantId, {}),
    resumoAPagar(tenantId, {}),
    caixaAberto(tenantId).then(async (c) => {
      if (!c) return null;
      const d = await dadosDoCaixa(tenantId, c.id);
      return d ? { abertoEm: c.abertoEm, esperadoDinheiroCents: d.resumo.esperadoDinheiroCents, totalRecebidoCents: d.resumo.totalRecebidoCents } : null;
    }),
    prisma.pagamento.aggregate({
      where: {
        recebidoEm: { gte: j.inicio, lt: j.fim },
        OR: [{ order: { tenantId } }, { conta: { tenantId } }],
      },
      _sum: { valorCents: true },
    }),
    prisma.contact.findMany({
      where: { tenantId, limiteCreditoCents: { not: null } },
      select: { id: true, limiteCreditoCents: true },
    }),
  ]);

  const pendencias = comLimite.length
    ? await pendenciasPorContato(tenantId, { contactIds: comLimite.map((c) => c.id) })
    : new Map();
  let limiteTotal = 0;
  let usadoTotal = 0;
  let acimaDoLimite = 0;
  for (const c of comLimite) {
    const usado = pendencias.get(c.id)?.saldoCents ?? 0;
    limiteTotal += c.limiteCreditoCents ?? 0;
    usadoTotal += usado;
    if (usado > (c.limiteCreditoCents ?? 0)) acimaDoLimite += 1;
  }

  return {
    aReceber,
    aPagar,
    recebidoNoMesCents: recebidoNoMes._sum.valorCents ?? 0,
    caixa,
    credito: { contatos: comLimite.length, limiteCents: limiteTotal, usadoCents: usadoTotal, acimaDoLimite },
  };
}

async function funil(tenantId: string, j: Janela) {
  // A cópia do pós-venda não é negociação nova: continua a de origem (mesma regra dos relatórios de CRM).
  const base = { tenantId, duplicadaDeId: null };
  const [abertas, ganhas, perdidas, motivos] = await Promise.all([
    prisma.negociacao.aggregate({ where: { ...base, status: "ABERTA" }, _sum: { valorCents: true }, _count: true }),
    prisma.negociacao.aggregate({
      where: { ...base, status: "GANHA", fechadaEm: { gte: j.inicio, lt: j.fim } },
      _sum: { valorCents: true },
      _count: true,
    }),
    prisma.negociacao.aggregate({
      where: { ...base, status: "PERDIDA", fechadaEm: { gte: j.inicio, lt: j.fim } },
      _sum: { valorCents: true },
      _count: true,
    }),
    prisma.negociacao.groupBy({
      by: ["motivoPerdaId"],
      where: { ...base, status: "PERDIDA", fechadaEm: { gte: j.inicio, lt: j.fim } },
      _count: true,
      orderBy: { _count: { motivoPerdaId: "desc" } },
      take: 5,
    }),
  ]);

  const idsMotivo = motivos.map((m) => m.motivoPerdaId).filter((x): x is string => !!x);
  const nomes = idsMotivo.length
    ? await prisma.motivoDePerda.findMany({ where: { id: { in: idsMotivo }, tenantId }, select: { id: true, nome: true } })
    : [];
  const nomeDoMotivo = new Map(nomes.map((m) => [m.id, m.nome]));

  const fechadas = ganhas._count + perdidas._count;
  return {
    abertas: { quantidade: abertas._count, valorCents: abertas._sum.valorCents ?? 0 },
    ganhasNoMes: { quantidade: ganhas._count, valorCents: ganhas._sum.valorCents ?? 0 },
    perdidasNoMes: { quantidade: perdidas._count, valorCents: perdidas._sum.valorCents ?? 0 },
    // Das negociações encerradas no mês, quantas foram ganhas.
    taxaDeGanhoPercentual: fechadas > 0 ? Math.round((ganhas._count / fechadas) * 100) : null,
    motivosDePerda: motivos.map((m) => ({
      nome: m.motivoPerdaId ? (nomeDoMotivo.get(m.motivoPerdaId) ?? "—") : "Sem motivo informado",
      quantidade: m._count,
    })),
  };
}

async function estoque(tenantId: string, j: Janela) {
  const produtos = { tenantId, isActive: true, tipo: "PRODUTO" as const };
  const [esgotados, baixos, listaBaixos, maisVendidos] = await Promise.all([
    prisma.product.count({ where: { ...produtos, stockQty: { lte: 0 } } }),
    prisma.product.count({ where: { ...produtos, stockQty: { gt: 0, lte: LIMITE_ESTOQUE_BAIXO } } }),
    prisma.product.findMany({
      where: { ...produtos, stockQty: { lte: LIMITE_ESTOQUE_BAIXO } },
      orderBy: [{ stockQty: "asc" }, { name: "asc" }],
      take: 10,
      select: { id: true, name: true, stockQty: true },
    }),
    prisma.$queryRaw<{ nome: string; quantidade: bigint; totalCents: bigint }[]>(Prisma.sql`
      SELECT oi."nomeProduto" AS nome, sum(oi."quantidade") AS quantidade, sum(oi."quantidade" * oi."precoUnitCents") AS "totalCents"
      FROM "OrderItem" oi JOIN "Order" o ON o."id" = oi."orderId"
      WHERE o."tenantId" = ${tenantId} AND o."status" = 'FECHADO' AND o."fechadoEm" >= ${j.inicio} AND o."fechadoEm" < ${j.fim}
      GROUP BY oi."nomeProduto"
      ORDER BY sum(oi."quantidade") DESC, sum(oi."quantidade" * oi."precoUnitCents") DESC
      LIMIT 8`),
  ]);

  return {
    esgotados,
    baixos,
    limiteBaixo: LIMITE_ESTOQUE_BAIXO,
    listaBaixos,
    maisVendidos: maisVendidos.map((p) => ({ nome: p.nome, quantidade: Number(p.quantidade), totalCents: Number(p.totalCents) })),
  };
}

export async function montarGerencial(tenantId: string, agora = new Date()) {
  const j = janelaDoMes(agora);
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metaVendasMesCents: true } });
  const metaCents = tenant?.metaVendasMesCents ?? null;

  const [v, f, n, e] = await Promise.all([
    secao("vendas", () => vendas(tenantId, j, metaCents)),
    secao("financeiro", () => financeiro(tenantId, j)),
    secao("funil", () => funil(tenantId, j)),
    secao("estoque", () => estoque(tenantId, j)),
  ]);

  return {
    mes: j.mes,
    diaDoMes: j.diaDoMes,
    diasNoMes: j.diasNoMes,
    metaCents,
    vendas: v,
    financeiro: f,
    funil: n,
    estoque: e,
  };
}

export type Gerencial = Awaited<ReturnType<typeof montarGerencial>>;
