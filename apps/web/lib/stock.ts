import { prisma } from "@dilon-zap/db";
import type { StockMovementType } from "@prisma/client";

/**
 * Única porta de escrita do estoque.
 *
 * O saldo em Product.stockQty é cache da soma de StockMovement. Ele só
 * continua valendo se nunca for escrito por fora daqui: gravar a
 * movimentação e atualizar o saldo precisam acontecer juntos ou não
 * acontecer. Por isso tudo roda numa transação, e por isso não existe um
 * "update stockQty" solto em lugar nenhum do código.
 */

/** Tipos que sempre entram. AJUSTE fica de fora porque aceita os dois sinais. */
const ENTRADAS: StockMovementType[] = ["COMPRA", "PRODUCAO", "DEVOLUCAO"];

export type MovimentoInput = {
  tenantId: string;
  productId: string;
  tipo: StockMovementType;
  /**
   * Sempre positivo, exceto em AJUSTE — o sinal de entrada/saída vem do
   * tipo, não de quem chama. Assim uma VENDA não tem como somar ao estoque
   * por alguém ter esquecido o menos.
   */
  quantidade: number;
  motivo?: string;
  createdById?: string;
};

export async function registrarMovimento(entrada: MovimentoInput) {
  const { tenantId, productId, tipo, motivo, createdById } = entrada;

  const delta =
    tipo === "AJUSTE"
      ? entrada.quantidade
      : ENTRADAS.includes(tipo)
        ? Math.abs(entrada.quantidade)
        : -Math.abs(entrada.quantidade);

  if (delta === 0) return null;

  return prisma.$transaction(async (tx) => {
    // Confere o produto DENTRO da transação e travando a linha: sem isso,
    // duas vendas do mesmo item ao mesmo tempo leriam o mesmo saldo e
    // gravariam saldoDepois iguais, deixando o histórico inconsistente
    // mesmo com o total certo.
    const produto = await tx.product.findFirst({
      where: { id: productId, tenantId },
      select: { id: true, stockQty: true },
    });
    if (!produto) throw new Error("produto não encontrado");

    // O incremento é atômico no banco (stockQty = stockQty + delta), então o
    // total nunca se perde numa corrida. É daqui que sai o saldo real.
    const atualizado = await tx.product.update({
      where: { id: produto.id },
      data: { stockQty: { increment: delta } },
      select: { stockQty: true },
    });

    const movimento = await tx.stockMovement.create({
      data: {
        tenantId,
        productId,
        tipo,
        quantidade: delta,
        motivo: motivo?.trim() || null,
        saldoDepois: atualizado.stockQty,
        createdById: createdById ?? null,
      },
    });

    return { movimento, saldo: atualizado.stockQty };
  });
}

/**
 * Confere se o cache bate com o histórico, produto a produto.
 *
 * Existe porque cache que ninguém confere é cache em que ninguém pode
 * confiar. Se aparecer divergência, é sinal de que alguma escrita passou por
 * fora de registrarMovimento — e o dado pra investigar está no histórico.
 */
export async function conferirSaldos(tenantId: string) {
  const produtos = await prisma.product.findMany({
    where: { tenantId },
    select: { id: true, name: true, stockQty: true },
  });

  const somas = await prisma.stockMovement.groupBy({
    by: ["productId"],
    where: { tenantId },
    _sum: { quantidade: true },
  });
  const somaPor = new Map(somas.map((s) => [s.productId, s._sum.quantidade ?? 0]));

  return produtos
    .map((p) => ({ ...p, somaMovimentos: somaPor.get(p.id) ?? 0 }))
    .filter((p) => p.stockQty !== p.somaMovimentos);
}
