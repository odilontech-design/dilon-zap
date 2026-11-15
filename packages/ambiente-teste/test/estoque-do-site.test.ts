import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { pendenciasDoSite, registrarBaixaDoSite, vincularCodigoDoSite } from "../../../apps/web/lib/estoque-do-site";

/**
 * Believe, 15/11/2026: toda venda do site baixa o estoque no Dilon Zap. Vínculo pelo código do site no produto,
 * sem baixar duas vezes, sem perder a venda de produto ainda não vinculado, e estorno devolvendo o que baixou.
 */

describe("venda do site baixando o estoque", () => {
  let tenantId = "";
  let outroTenant = "";
  let shampoo = "";
  let mascara = "";
  const saldo = async (id: string) => (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQty;

  before(async () => {
    const mk = async () => {
      const s = `site-${Math.random().toString(36).slice(2)}`;
      return (await prisma.tenant.create({ data: { name: s, slug: s } })).id;
    };
    tenantId = await mk();
    outroTenant = await mk();
    shampoo = (await prisma.product.create({ data: { tenantId, name: "Shampoo Ouse 300mL", priceCents: 1000, codigoSite: "ouse-shampoo", stockQty: 0 } })).id;
    mascara = (await prisma.product.create({ data: { tenantId, name: "Máscara Ouse 300g", priceCents: 1000, stockQty: 0 } })).id;
    // Mesmo código em outra empresa não pode ser achado.
    await prisma.product.create({ data: { tenantId: outroTenant, name: "Shampoo Ouse", priceCents: 1000, codigoSite: "ouse-mascara" } });
  });
  after(async () => {
    for (const t of [tenantId, outroTenant]) {
      await prisma.baixaDoSite.deleteMany({ where: { tenantId: t } });
      await prisma.stockMovement.deleteMany({ where: { tenantId: t } });
      await prisma.product.deleteMany({ where: { tenantId: t } });
      await prisma.tenant.delete({ where: { id: t } });
    }
  });

  test("venda baixa o produto vinculado e deixa pendente o que não tem vínculo", async () => {
    const r = await registrarBaixaDoSite(tenantId, {
      referencia: "believe-pedido-1",
      tipo: "VENDA",
      pedido: "#1",
      itens: [
        { codigo: "ouse-shampoo", nome: "Shampoo Ouse", quantidade: 2 },
        { codigo: "ouse-mascara", nome: "Máscara Ouse", quantidade: 1 },
      ],
    });
    assert.equal(r.baixados, 1);
    assert.deepEqual(r.pendentes, [{ codigo: "ouse-mascara", nome: "Máscara Ouse", quantidade: 1 }]);
    assert.equal(await saldo(shampoo), -2);
    const mov = await prisma.stockMovement.findFirstOrThrow({ where: { productId: shampoo } });
    assert.equal(mov.tipo, "VENDA");
    assert.match(mov.motivo ?? "", /Venda no site — pedido #1/);
  });

  test("a mesma venda repetida não baixa de novo", async () => {
    const r = await registrarBaixaDoSite(tenantId, { referencia: "believe-pedido-1", tipo: "VENDA", itens: [{ codigo: "ouse-shampoo", nome: "x", quantidade: 2 }] });
    assert.equal(r.duplicada, true);
    assert.equal(await saldo(shampoo), -2);
  });

  test("pendência aparece e é baixada ao vincular o código", async () => {
    assert.deepEqual((await pendenciasDoSite(tenantId)).map((p) => [p.codigo, p.quantidade, p.pedidos]), [["ouse-mascara", 1, ["#1"]]]);
    const r = await vincularCodigoDoSite(tenantId, mascara, "ouse-mascara");
    assert.equal(r.baixadasAgora, 1);
    assert.equal(await saldo(mascara), -1);
    assert.equal((await pendenciasDoSite(tenantId)).length, 0);
  });

  test("código já usado em outro produto é recusado", async () => {
    await assert.rejects(vincularCodigoDoSite(tenantId, mascara, "ouse-shampoo"), /já está no produto/);
  });

  test("estorno devolve exatamente o que a venda baixou, uma vez só", async () => {
    const r = await registrarBaixaDoSite(tenantId, { referencia: "believe-pedido-1", tipo: "ESTORNO", pedido: "#1" , itens: [] });
    assert.equal(r.baixados, 2);
    assert.equal(await saldo(shampoo), 0);
    assert.equal(await saldo(mascara), 0);
    const de_novo = await registrarBaixaDoSite(tenantId, { referencia: "believe-pedido-1", tipo: "ESTORNO", itens: [] });
    assert.equal(de_novo.duplicada, true);
    assert.equal(await saldo(shampoo), 0);
  });

  test("estorno de venda desconhecida não mexe em nada", async () => {
    const r = await registrarBaixaDoSite(tenantId, { referencia: "believe-pedido-99", tipo: "ESTORNO", itens: [] });
    assert.equal((r as { semVenda?: boolean }).semVenda, true);
  });
});
