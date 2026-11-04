import { prisma } from "@dilon-zap/db";
import { lerNfe, ErroDeNota, type NotaLida } from "@/lib/nfe";
import { movimentarNaTransacao } from "@/lib/stock";
import { criarContaPagar } from "@/lib/contas-pagar";
import { validarCategoria } from "@/lib/categorias-financeiras";

/**
 * Importação da nota de compra: dá entrada no estoque dos itens ligados a um
 * produto do catálogo (com o custo da nota) e, se pedido, lança as duplicatas
 * no A pagar. Tudo numa transação: ou a nota entra inteira, ou não entra.
 */

export { ErroDeNota };

export type Previa = NotaLida & {
  jaImportadaEm: string | null;
  itens: (NotaLida["itens"][number] & { sugestaoProductId: string | null })[];
  produtos: { id: string; nome: string; sku: string | null; estoque: number }[];
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export async function previaDaNota(tenantId: string, xml: string): Promise<Previa> {
  const nota = lerNfe(xml);
  const [ja, produtos] = await Promise.all([
    prisma.notaFiscalEntrada.findUnique({ where: { tenantId_chave: { tenantId, chave: nota.chave } }, select: { importadaEm: true } }),
    prisma.product.findMany({
      where: { tenantId, tipo: "PRODUTO", isActive: true },
      select: { id: true, name: true, sku: true, stockQty: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Sugestão de produto: código do fornecedor ou código de barras no SKU, ou
  // o mesmo nome. A pessoa confere e troca na tela.
  const porSku = new Map(produtos.filter((p) => p.sku).map((p) => [norm(p.sku!), p.id]));
  const porNome = new Map(produtos.map((p) => [norm(p.name), p.id]));
  const itens = nota.itens.map((i) => ({
    ...i,
    sugestaoProductId: porSku.get(norm(i.codigo)) ?? (i.ean ? porSku.get(i.ean) : undefined) ?? porNome.get(norm(i.descricao)) ?? null,
  }));

  return {
    ...nota,
    itens,
    jaImportadaEm: ja?.importadaEm.toISOString() ?? null,
    produtos: produtos.map((p) => ({ id: p.id, nome: p.name, sku: p.sku, estoque: p.stockQty })),
  };
}

export type DecisaoDeImportacao = {
  xml: string;
  /** Um por item da nota que vai para o estoque; os que não vêm são ignorados. */
  itens: { n: number; productId: string; quantidade: number }[];
  contaPagar: null | { categoriaId: string | null; parcelas: { vencimento: Date; valorCents: number }[] };
};

export async function importarNota(tenantId: string, userId: string, d: DecisaoDeImportacao) {
  // Os valores saem do XML de novo, no servidor: a tela só diz qual item é
  // qual produto e quantas unidades entram.
  const nota = lerNfe(d.xml);
  const porN = new Map(nota.itens.map((i) => [i.n, i]));
  if (d.itens.length === 0 && !d.contaPagar) throw new ErroDeNota("escolha pelo menos um item para o estoque ou lance a conta a pagar");
  for (const i of d.itens) {
    if (!porN.has(i.n)) throw new ErroDeNota(`o item ${i.n} não está na nota`);
    if (!Number.isInteger(i.quantidade) || i.quantidade <= 0) throw new ErroDeNota(`quantidade inválida no item ${i.n}`);
  }
  if (new Set(d.itens.map((i) => i.n)).size !== d.itens.length) throw new ErroDeNota("item da nota repetido");

  const ids = [...new Set(d.itens.map((i) => i.productId))];
  const produtos = await prisma.product.findMany({ where: { id: { in: ids }, tenantId, tipo: "PRODUTO" }, select: { id: true, sku: true } });
  if (produtos.length !== ids.length) throw new ErroDeNota("produto inválido");

  return prisma.$transaction(
    async (tx) => {
      const ja = await tx.notaFiscalEntrada.findUnique({ where: { tenantId_chave: { tenantId, chave: nota.chave } }, select: { id: true } });
      if (ja) throw new ErroDeNota("esta nota já foi importada");

      const motivo = `NF ${nota.numero} · ${nota.emitente.nome}`.slice(0, 200);
      for (const i of d.itens) {
        const item = porN.get(i.n)!;
        await movimentarNaTransacao(tx, {
          tenantId,
          productId: i.productId,
          tipo: "COMPRA",
          quantidade: i.quantidade,
          motivo,
          createdById: userId,
          // Custo por unidade que entrou: se a nota vem em caixa e entram 24
          // unidades, o custo da linha é dividido por 24, não por 2.
          custoUnitCents: Math.round(item.custoTotalCents / i.quantidade),
        });
      }

      // Produto sem SKU ganha o código do fornecedor, para a próxima nota já
      // vir ligada sozinha. Só se o código não for de outro produto.
      for (const i of d.itens) {
        const p = produtos.find((x) => x.id === i.productId);
        const codigo = porN.get(i.n)!.codigo.trim();
        if (!p || p.sku || !codigo) continue;
        const ocupado = await tx.product.findFirst({ where: { tenantId, sku: codigo }, select: { id: true } });
        if (!ocupado) {
          await tx.product.update({ where: { id: p.id }, data: { sku: codigo } });
          p.sku = codigo;
        }
      }

      let contaPagarId: string | null = null;
      if (d.contaPagar) {
        const parcelas = d.contaPagar.parcelas;
        if (parcelas.length === 0) throw new ErroDeNota("informe o vencimento da conta a pagar");
        const conta = await criarContaPagar(tx, {
          tenantId,
          fornecedorNome: nota.emitente.nome,
          descricao: `NF ${nota.numero}`,
          categoriaId: await validarCategoria(tx, tenantId, d.contaPagar.categoriaId, "DESPESA"),
          forma: "BOLETO",
          userId,
          plano: {
            totalCents: parcelas.reduce((s, p) => s + p.valorCents, 0),
            numParcelas: parcelas.length,
            periodicidade: "MENSAL",
            primeiroVencimento: parcelas[0].vencimento,
          },
          parcelasManuais: parcelas,
        });
        contaPagarId = conta.id;
      }

      await tx.notaFiscalEntrada.create({
        data: {
          tenantId,
          chave: nota.chave,
          numero: nota.numero,
          serie: nota.serie,
          emitenteNome: nota.emitente.nome,
          emitenteCnpj: nota.emitente.cnpj,
          emitidaEm: nota.emitidaEm ? new Date(nota.emitidaEm) : null,
          valorCents: nota.valorCents,
          itensLancados: d.itens.length,
          contaPagarId,
          importadaPorId: userId,
        },
      });

      return { numero: nota.numero, itensLancados: d.itens.length, contaPagarId };
    },
    { timeout: 30_000 }
  );
}
