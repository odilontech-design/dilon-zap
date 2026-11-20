import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { excluirContatosEmLote, motivoDeNaoExcluir } from "../../../apps/web/lib/contatos-lote";

/**
 * Exclusão de contatos em lote (reunião Believe, 06/11: limpar o CRM). O banco apaga em cascata pedidos, contas e
 * negociações junto com o contato, então o lote só pode apagar quem não tem nada disso.
 */

const zero = { orders: 0, contasReceber: 0, negociacoes: 0, receitasOticas: 0, ordensServico: 0, comprasDeVeiculo: 0, veiculosConsignados: 0 };

describe("motivo de não excluir (puro)", () => {
  test("sem vínculo nenhum pode excluir", () => {
    assert.equal(motivoDeNaoExcluir({ _count: zero, conversasAbertas: 0 }), null);
  });
  test("cada vínculo segura o contato", () => {
    assert.match(motivoDeNaoExcluir({ _count: { ...zero, orders: 1 }, conversasAbertas: 0 }) ?? "", /pedidos/);
    assert.match(motivoDeNaoExcluir({ _count: { ...zero, contasReceber: 1 }, conversasAbertas: 0 }) ?? "", /contas a receber/);
    assert.match(motivoDeNaoExcluir({ _count: { ...zero, negociacoes: 2 }, conversasAbertas: 0 }) ?? "", /negociação/);
    assert.match(motivoDeNaoExcluir({ _count: { ...zero, ordensServico: 1 }, conversasAbertas: 0 }) ?? "", /ordem de serviço/);
    assert.match(motivoDeNaoExcluir({ _count: { ...zero, receitasOticas: 1 }, conversasAbertas: 0 }) ?? "", /receita/);
    assert.match(motivoDeNaoExcluir({ _count: { ...zero, comprasDeVeiculo: 1 }, conversasAbertas: 0 }) ?? "", /veículo/);
    assert.match(motivoDeNaoExcluir({ _count: { ...zero, veiculosConsignados: 1 }, conversasAbertas: 0 }) ?? "", /veículo/);
    assert.match(motivoDeNaoExcluir({ _count: zero, conversasAbertas: 1 }) ?? "", /conversa em aberto/);
  });
});

describe("exclusão de contatos em lote (banco)", () => {
  let tenantId = "";
  let outroId = "";
  const ids: Record<string, string> = {};

  before(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: "lote-contatos", slug: "lote-contatos-teste" } })).id;
    outroId = (await prisma.tenant.create({ data: { name: "lote-outro", slug: "lote-contatos-outro" } })).id;
    const sessao = await prisma.whatsAppSession.create({ data: { tenantId, label: "Principal" } });
    const novo = async (chave: string, n: number, t = tenantId) => {
      ids[chave] = (await prisma.contact.create({ data: { tenantId: t, waJid: `55000000060${n}@s.whatsapp.net`, name: chave } })).id;
    };
    await novo("inativo", 1);
    await novo("inativo-com-conversa-fechada", 2);
    await novo("com-pedido", 3);
    await novo("com-conta", 4);
    await novo("conversa-aberta", 5);
    await novo("de-outra-empresa", 6, outroId);

    await prisma.conversation.create({ data: { tenantId, sessionId: sessao.id, contactId: ids["inativo-com-conversa-fechada"], status: "RESOLVED" } });
    await prisma.conversation.create({ data: { tenantId, sessionId: sessao.id, contactId: ids["conversa-aberta"], status: "OPEN" } });
    await prisma.order.create({ data: { tenantId, contactId: ids["com-pedido"] } });
    await prisma.contaReceber.create({ data: { tenantId, contactId: ids["com-conta"] } });
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, outroId] } } });
  });

  test("apaga só quem não tem pedido, conta nem conversa aberta, e diz o motivo dos que ficaram", async () => {
    const r = await excluirContatosEmLote(tenantId, Object.values(ids));

    // 2 apagados (o inativo e o que só tinha conversa fechada)
    assert.equal(r.excluidos, 2);
    assert.equal(await prisma.contact.count({ where: { id: { in: [ids["inativo"], ids["inativo-com-conversa-fechada"]] } } }), 0);

    // Os que têm vínculo continuam, com o pedido e a conta intactos.
    assert.equal(await prisma.contact.count({ where: { id: { in: [ids["com-pedido"], ids["com-conta"], ids["conversa-aberta"]] } } }), 3);
    assert.equal(await prisma.order.count({ where: { contactId: ids["com-pedido"] } }), 1);
    assert.equal(await prisma.contaReceber.count({ where: { contactId: ids["com-conta"] } }), 1);

    const motivos = Object.fromEntries(r.ignorados.map((i) => [i.id, i.motivo]));
    assert.match(motivos[ids["com-pedido"]], /pedidos/);
    assert.match(motivos[ids["com-conta"]], /contas a receber/);
    assert.match(motivos[ids["conversa-aberta"]], /conversa em aberto/);
  });

  test("id de outra empresa não é apagado: volta como não encontrado", async () => {
    // o contato da outra empresa continua lá depois do teste anterior
    assert.equal(await prisma.contact.count({ where: { id: ids["de-outra-empresa"] } }), 1);
    const r = await excluirContatosEmLote(tenantId, [ids["de-outra-empresa"]]);
    assert.equal(r.excluidos, 0);
    assert.equal(r.ignorados[0]?.motivo, "não encontrado");
    assert.equal(await prisma.contact.count({ where: { id: ids["de-outra-empresa"] } }), 1);
  });

  test("ids repetidos contam uma vez e lista vazia não apaga nada", async () => {
    const r = await excluirContatosEmLote(tenantId, [ids["com-pedido"], ids["com-pedido"]]);
    assert.equal(r.excluidos, 0);
    assert.equal(r.ignorados.length, 1);
    const vazio = await excluirContatosEmLote(tenantId, []);
    assert.deepEqual(vazio, { excluidos: 0, ignorados: [] });
  });
});
