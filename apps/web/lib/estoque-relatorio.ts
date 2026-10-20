import { prisma } from "@dilon-zap/db";
import type { StockMovementType } from "@prisma/client";

/**
 * Relatório de estoque (pedido da Franciele, financeiro da Believe, 20/10):
 * o que cada produto tinha no começo do período, o que entrou, o que saiu e
 * com quanto terminou — e a lista das movimentações, como no sistema antigo.
 *
 * O saldo final sai do saldo atual (Product.stockQty, que lib/stock mantém
 * igual à soma das movimentações) menos o que se mexeu depois do fim do
 * período. Assim o relatório fecha com a tela de Produtos mesmo para um item
 * cadastrado com saldo antes de existir o histórico.
 */

export const ROTULO_TIPO_MOV: Record<StockMovementType, string> = {
  COMPRA: "Compra",
  PRODUCAO: "Produção",
  DEVOLUCAO: "Devolução",
  AJUSTE: "Ajuste",
  VENDA: "Venda",
};

export type LinhaResumo = {
  productId: string;
  codigo: string | null;
  produto: string;
  categoria: string | null;
  ativo: boolean;
  precoCents: number;
  saldoInicial: number;
  compras: number;
  producao: number;
  devolucoes: number;
  ajustes: number;
  vendas: number; // positivo: unidades que saíram
  saldoFinal: number;
  valorFinalCents: number; // saldo final × preço de venda
};

export type LinhaMovimento = {
  id: string;
  data: string;
  codigo: string | null;
  produto: string;
  tipo: StockMovementType;
  quantidade: number;
  saldoDepois: number;
  motivo: string | null;
  por: string | null;
};

export type Periodo = { de: Date; ate: Date };

/** Soma das quantidades por produto e tipo, num intervalo. */
async function somasPorTipo(tenantId: string, createdAt: { gte?: Date; gt?: Date; lte?: Date }, productId?: string) {
  const grupos = await prisma.stockMovement.groupBy({
    by: ["productId", "tipo"],
    where: { tenantId, createdAt, ...(productId ? { productId } : {}) },
    _sum: { quantidade: true },
  });
  const mapa = new Map<string, Partial<Record<StockMovementType, number>>>();
  for (const g of grupos) {
    const linha = mapa.get(g.productId) ?? {};
    linha[g.tipo] = (linha[g.tipo] ?? 0) + (g._sum.quantidade ?? 0);
    mapa.set(g.productId, linha);
  }
  return mapa;
}

const total = (s: Partial<Record<StockMovementType, number>> | undefined) =>
  s ? Object.values(s).reduce((a, b) => a + (b ?? 0), 0) : 0;

export async function resumoDoEstoque(tenantId: string, periodo: Periodo, productId?: string): Promise<LinhaResumo[]> {
  const [produtos, noPeriodo, depois] = await Promise.all([
    prisma.product.findMany({
      where: { tenantId, tipo: "PRODUTO", ...(productId ? { id: productId } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, categoria: true, isActive: true, priceCents: true, stockQty: true },
    }),
    somasPorTipo(tenantId, { gte: periodo.de, lte: periodo.ate }, productId),
    somasPorTipo(tenantId, { gt: periodo.ate }, productId),
  ]);

  return produtos
    .map((p) => {
      const s = noPeriodo.get(p.id);
      const saldoFinal = p.stockQty - total(depois.get(p.id));
      const saldoInicial = saldoFinal - total(s);
      return {
        productId: p.id,
        codigo: p.sku,
        produto: p.name,
        categoria: p.categoria,
        ativo: p.isActive,
        precoCents: p.priceCents,
        saldoInicial,
        compras: s?.COMPRA ?? 0,
        producao: s?.PRODUCAO ?? 0,
        devolucoes: s?.DEVOLUCAO ?? 0,
        ajustes: s?.AJUSTE ?? 0,
        vendas: -(s?.VENDA ?? 0),
        saldoFinal,
        valorFinalCents: Math.max(saldoFinal, 0) * p.priceCents,
      };
    })
    // Produto desativado, sem saldo e sem movimento no período não diz nada.
    .filter((l) => l.ativo || l.saldoInicial !== 0 || l.saldoFinal !== 0 || total(noPeriodo.get(l.productId)) !== 0);
}

/** Teto da lista: o período de um ano da Believe cabe com folga. */
export const LIMITE_MOVIMENTOS = 5000;

export async function movimentosDoEstoque(
  tenantId: string,
  periodo: Periodo,
  filtro: { productId?: string; tipo?: StockMovementType }
): Promise<{ linhas: LinhaMovimento[]; cortado: boolean }> {
  const movs = await prisma.stockMovement.findMany({
    where: {
      tenantId,
      createdAt: { gte: periodo.de, lte: periodo.ate },
      ...(filtro.productId ? { productId: filtro.productId } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: LIMITE_MOVIMENTOS + 1,
    select: {
      id: true,
      createdAt: true,
      tipo: true,
      quantidade: true,
      saldoDepois: true,
      motivo: true,
      product: { select: { sku: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  return {
    cortado: movs.length > LIMITE_MOVIMENTOS,
    linhas: movs.slice(0, LIMITE_MOVIMENTOS).map((m) => ({
      id: m.id,
      data: m.createdAt.toISOString(),
      codigo: m.product.sku,
      produto: m.product.name,
      tipo: m.tipo,
      quantidade: m.quantidade,
      saldoDepois: m.saldoDepois,
      motivo: m.motivo,
      por: m.createdBy?.name ?? null,
    })),
  };
}

/* ------------------------------------------------------------------------ *
 * CSV para o Excel em português: ponto e vírgula, vírgula decimal e BOM —
 * sem o BOM o Excel abre os acentos quebrados.
 * ------------------------------------------------------------------------ */

function celula(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

export function csv(linhas: (string | number | null | undefined)[][]): string {
  return "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
}

export function csvDoResumo(linhas: LinhaResumo[]): string {
  return csv([
    ["Código", "Produto", "Categoria", "Situação", "Saldo inicial", "Compras", "Produção", "Devoluções", "Ajustes", "Vendas", "Saldo final", "Preço de venda", "Valor do saldo"],
    ...linhas.map((l) => [
      l.codigo, l.produto, l.categoria, l.ativo ? "Ativo" : "Desativado",
      l.saldoInicial, l.compras, l.producao, l.devolucoes, l.ajustes, l.vendas, l.saldoFinal,
      reais(l.precoCents), reais(l.valorFinalCents),
    ]),
  ]);
}

export function csvDosMovimentos(linhas: LinhaMovimento[]): string {
  return csv([
    ["Data", "Código", "Produto", "Tipo de operação", "Quantidade", "Saldo depois", "Motivo", "Lançado por"],
    ...linhas.map((l) => [dataHora(l.data), l.codigo, l.produto, ROTULO_TIPO_MOV[l.tipo], l.quantidade, l.saldoDepois, l.motivo, l.por]),
  ]);
}
