import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { listarPedidos } from "../../../apps/web/lib/pedidos-lista";

/** Filtro de pedidos por vendedor(a) (reunião Believe, 06/11): quem criou o pedido. */

let tenantId = "";
let outroTenantId = "";
let ana = "";
let bia = "";
let usuarioDeOutraEmpresa = "";

const SELECT = { id: true, createdById: true } as const;
const ids = async (vendedor?: string | null) =>
  (await listarPedidos(tenantId, { vendedor }, SELECT)).pedidos.map((p) => p.createdById ?? "sem").sort();

describe("filtro de pedidos por vendedor", () => {
  // Hooks dentro do describe: os testes dividem o mesmo banco, e a limpeza tem de ocorrer quando ESTE bloco termina.
  before(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: "pedidos-vend", slug: "pedidos-vendedor-teste" } })).id;
    outroTenantId = (await prisma.tenant.create({ data: { name: "pedidos-vend-b", slug: "pedidos-vendedor-teste-b" } })).id;
    ana = (await prisma.user.create({ data: { tenantId, email: "ana@pedidos.teste", name: "Ana", role: "AGENT", passwordHash: "x" } })).id;
    bia = (await prisma.user.create({ data: { tenantId, email: "bia@pedidos.teste", name: "Bia", role: "AGENT", passwordHash: "x" } })).id;
    usuarioDeOutraEmpresa = (await prisma.user.create({ data: { tenantId: outroTenantId, email: "cris@pedidos.teste", name: "Cris", role: "AGENT", passwordHash: "x" } })).id;
    const contato = await prisma.contact.create({ data: { tenantId, waJid: "5500000008001@s.whatsapp.net", phoneNumber: "5500000008001", name: "Cliente Pedidos" } });
    for (const createdById of [ana, ana, bia, null]) {
      await prisma.order.create({ data: { tenantId, contactId: contato.id, createdById } });
    }
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, outroTenantId] } } });
  });

  test("sem filtro traz os pedidos de todos", async () => {
    assert.deepEqual(await ids(), [ana, ana, bia, "sem"].sort());
    assert.deepEqual(await ids(""), [ana, ana, bia, "sem"].sort());
  });

  test("por vendedora traz só os pedidos que ela criou, e os totais acompanham", async () => {
    assert.deepEqual(await ids(ana), [ana, ana]);
    assert.deepEqual(await ids(bia), [bia]);
    const r = await listarPedidos(tenantId, { vendedor: ana }, SELECT);
    assert.equal(r.totais.quantidade, 2);
  });

  test('"sem" traz os pedidos sem criador', async () => {
    assert.deepEqual(await ids("sem"), ["sem"]);
  });

  test("id de usuário de outra empresa não traz nada", async () => {
    assert.deepEqual(await ids(usuarioDeOutraEmpresa), []);
  });

  test("combina com os demais filtros", async () => {
    const r = await listarPedidos(tenantId, { vendedor: ana, status: "CANCELADO" }, SELECT);
    assert.equal(r.pedidos.length, 0);
  });
});
