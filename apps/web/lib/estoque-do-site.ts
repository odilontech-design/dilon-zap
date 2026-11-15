import { prisma } from "@dilon-zap/db";
import type { Prisma } from "@prisma/client";
import { movimentarNaTransacao } from "./stock";

/**
 * Venda da loja online baixando o estoque daqui (pedido da Believe, 15/11/2026).
 *
 * O site manda cada venda paga (e o estorno, se ela for cancelada ou reembolsada) para
 * POST /api/integracao/estoque. Cada linha acha o produto pelo `codigoSite` (o slug do produto no site) e vira
 * uma movimentação VENDA (ou DEVOLUCAO no estorno), pela mesma porta de escrita do estoque de sempre.
 *
 * - A mesma venda não baixa duas vezes: BaixaDoSite tem chave única por referência e tipo.
 * - Linha de produto ainda não vinculado não se perde: fica pendente e é baixada quando a gestão informa o código
 *   do site no cadastro do produto (vincularCodigoDoSite).
 * - O estorno devolve exatamente o que a venda baixou (e nos mesmos produtos), mesmo que o vínculo mude depois.
 */

export class ErroDeEstoqueDoSite extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export type LinhaRecebida = { codigo: string; nome: string; quantidade: number };
type LinhaGuardada = LinhaRecebida & { productId: string | null; aplicadoEm: string | null };

const motivoDe = (tipo: "VENDA" | "ESTORNO", pedido: string | null) =>
  tipo === "VENDA" ? `Venda no site${pedido ? ` — pedido ${pedido}` : ""}` : `Estorno de venda no site${pedido ? ` — pedido ${pedido}` : ""}`;

export async function registrarBaixaDoSite(
  tenantId: string,
  b: { referencia: string; tipo: "VENDA" | "ESTORNO"; pedido?: string | null; itens: LinhaRecebida[] }
) {
  const pedido = b.pedido?.trim() || null;
  const ja = await prisma.baixaDoSite.findUnique({ where: { tenantId_referencia_tipo: { tenantId, referencia: b.referencia, tipo: b.tipo } } });
  if (ja) return { duplicada: true, ...resumo(ja.itens as LinhaGuardada[]) };

  try {
    return await prisma.$transaction(async (tx) => {
      let linhas: LinhaGuardada[];
      if (b.tipo === "VENDA") {
        const codigos = [...new Set(b.itens.map((i) => i.codigo))];
        const produtos = await tx.product.findMany({
          where: { tenantId, codigoSite: { in: codigos } },
          select: { id: true, codigoSite: true, tipo: true },
        });
        const porCodigo = new Map(produtos.filter((p) => p.tipo === "PRODUTO").map((p) => [p.codigoSite!, p.id]));
        linhas = b.itens.map((i) => ({ ...i, productId: porCodigo.get(i.codigo) ?? null, aplicadoEm: null }));
      } else {
        // Estorno: devolve o que a venda baixou, nos mesmos produtos. O que nunca foi baixado não volta.
        const venda = await tx.baixaDoSite.findUnique({ where: { tenantId_referencia_tipo: { tenantId, referencia: b.referencia, tipo: "VENDA" } } });
        if (!venda) return { semVenda: true, baixados: 0, pendentes: [] as LinhaRecebida[] };
        const vendidas = venda.itens as LinhaGuardada[];
        linhas = vendidas.filter((l) => l.aplicadoEm && l.productId).map((l) => ({ ...l, aplicadoEm: null }));
        // Linhas da venda que ainda estavam pendentes deixam de ficar: a venda foi desfeita.
        if (venda.pendentes > 0) {
          await tx.baixaDoSite.update({
            where: { id: venda.id },
            data: { pendentes: 0, itens: vendidas.map((l) => (l.aplicadoEm ? l : { ...l, productId: null })) as unknown as Prisma.InputJsonValue },
          });
        }
      }

      const agora = new Date().toISOString();
      for (const l of linhas) {
        if (!l.productId) continue;
        await movimentarNaTransacao(tx, {
          tenantId,
          productId: l.productId,
          tipo: b.tipo === "VENDA" ? "VENDA" : "DEVOLUCAO",
          quantidade: l.quantidade,
          motivo: motivoDe(b.tipo, pedido),
        });
        l.aplicadoEm = agora;
      }
      const pendentes = b.tipo === "VENDA" ? linhas.filter((l) => !l.productId).length : 0;
      await tx.baixaDoSite.create({
        data: { tenantId, referencia: b.referencia, tipo: b.tipo, pedido, itens: linhas as unknown as Prisma.InputJsonValue, pendentes },
      });
      return { duplicada: false, ...resumo(linhas) };
    });
  } catch (e) {
    // Dois envios da mesma venda ao mesmo tempo: o índice único decide, e o segundo é só "já recebida".
    if ((e as { code?: string }).code === "P2002") {
      const r = await prisma.baixaDoSite.findUnique({ where: { tenantId_referencia_tipo: { tenantId, referencia: b.referencia, tipo: b.tipo } } });
      if (r) return { duplicada: true, ...resumo(r.itens as LinhaGuardada[]) };
    }
    throw e;
  }
}

function resumo(linhas: LinhaGuardada[]) {
  return {
    baixados: linhas.filter((l) => l.aplicadoEm).length,
    pendentes: linhas.filter((l) => !l.productId).map(({ codigo, nome, quantidade }) => ({ codigo, nome, quantidade })),
  };
}

/** Vendas do site com linhas sem produto vinculado, agrupadas por código: o que a gestão precisa vincular. */
export async function pendenciasDoSite(tenantId: string) {
  const baixas = await prisma.baixaDoSite.findMany({
    where: { tenantId, tipo: "VENDA", pendentes: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const porCodigo = new Map<string, { codigo: string; nome: string; quantidade: number; pedidos: string[] }>();
  for (const b of baixas) {
    for (const l of b.itens as LinhaGuardada[]) {
      if (l.productId) continue;
      const g = porCodigo.get(l.codigo) ?? { codigo: l.codigo, nome: l.nome, quantidade: 0, pedidos: [] };
      g.quantidade += l.quantidade;
      if (b.pedido && !g.pedidos.includes(b.pedido)) g.pedidos.push(b.pedido);
      porCodigo.set(l.codigo, g);
    }
  }
  return [...porCodigo.values()].sort((a, b) => a.nome.localeCompare(b.nome));
}

/**
 * Grava (ou limpa) o código do site de um produto e baixa as vendas do site que esperavam esse vínculo.
 * Devolve quantas linhas pendentes foram baixadas agora.
 */
export async function vincularCodigoDoSite(tenantId: string, productId: string, codigo: string | null, userId?: string) {
  const c = codigo?.trim() || null;
  return prisma.$transaction(async (tx) => {
    const produto = await tx.product.findFirst({ where: { id: productId, tenantId }, select: { id: true, tipo: true } });
    if (!produto) throw new ErroDeEstoqueDoSite("produto não encontrado", 404);
    if (c) {
      const outro = await tx.product.findFirst({ where: { tenantId, codigoSite: c, NOT: { id: productId } }, select: { name: true } });
      if (outro) throw new ErroDeEstoqueDoSite(`O código "${c}" já está no produto "${outro.name}".`, 409);
    }
    await tx.product.update({ where: { id: productId }, data: { codigoSite: c } });
    if (!c || produto.tipo !== "PRODUTO") return { baixadasAgora: 0 };

    let baixadasAgora = 0;
    const baixas = await tx.baixaDoSite.findMany({ where: { tenantId, tipo: "VENDA", pendentes: { gt: 0 } } });
    for (const b of baixas) {
      const linhas = b.itens as LinhaGuardada[];
      let mudou = false;
      for (const l of linhas) {
        if (l.productId || l.codigo !== c) continue;
        await movimentarNaTransacao(tx, {
          tenantId,
          productId,
          tipo: "VENDA",
          quantidade: l.quantidade,
          motivo: `${motivoDe("VENDA", b.pedido)} (baixada ao vincular o código)`,
          createdById: userId,
        });
        l.productId = productId;
        l.aplicadoEm = new Date().toISOString();
        baixadasAgora++;
        mudou = true;
      }
      if (mudou) {
        await tx.baixaDoSite.update({
          where: { id: b.id },
          data: { itens: linhas as unknown as Prisma.InputJsonValue, pendentes: linhas.filter((l) => !l.productId).length },
        });
      }
    }
    return { baixadasAgora };
  });
}
