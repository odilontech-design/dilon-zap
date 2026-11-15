import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { acharContatoPorLid } from "../../../apps/web/lib/contact-server";
import { limitesDoPeriodo, rotuloDaReferencia } from "../../../apps/web/lib/painel-whatsapps";

/**
 * Believe, 14/11/2026: a mensagem da régua do site criou um contato novo para quem já conversava com a empresa,
 * porque o contato antigo estava salvo como @lid (com o telefone em phoneNumber) e a busca só olhava o waJid.
 * E o detalhe dos WhatsApps do site na aba Site: rótulo pela referência e limites do período em Brasília.
 */

describe("contato escondido atrás de @lid", () => {
  let tenantA = "";
  let tenantB = "";
  before(async () => {
    const mk = () => { const s = `lid-${Math.random().toString(36).slice(2)}`; return prisma.tenant.create({ data: { name: s, slug: s } }); };
    tenantA = (await mk()).id;
    tenantB = (await mk()).id;
    await prisma.contact.createMany({
      data: [
        { tenantId: tenantA, waJid: "214215805677602@lid", phoneNumber: "5521967411481", name: "Felipe Cerqueira" },
        { tenantId: tenantA, waJid: "999@lid", phoneNumber: null, name: "Sem telefone" },
        { tenantId: tenantA, waJid: "5521900000000@s.whatsapp.net", name: "Número comum" },
      ],
    });
  });
  after(async () => {
    await prisma.contact.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  });

  test("acha o contato @lid pelo telefone real", async () => {
    const c = await acharContatoPorLid(tenantA, ["5521967411481"]);
    assert.equal(c?.name, "Felipe Cerqueira");
  });
  test("não acha em outra empresa nem número desconhecido", async () => {
    assert.equal(await acharContatoPorLid(tenantB, ["5521967411481"]), null);
    assert.equal(await acharContatoPorLid(tenantA, ["5511000000000"]), null);
  });
  test("só olha contatos @lid", async () => {
    assert.equal(await acharContatoPorLid(tenantA, ["5521900000000"]), null);
  });
});

describe("detalhe dos WhatsApps do site", () => {
  test("rótulo pela referência da régua", () => {
    assert.deepEqual(rotuloDaReferencia("believe-pedido-19-pago-1794709439239"), { tipo: "Pagamento confirmado", pedido: "19" });
    assert.deepEqual(rotuloDaReferencia("believe-pedido-7-novo_evento-1"), { tipo: "novo evento", pedido: "7" });
  });
  test("referência fora do padrão não quebra", () => {
    assert.deepEqual(rotuloDaReferencia("abc"), { tipo: "Mensagem do site", pedido: null });
    assert.deepEqual(rotuloDaReferencia(null), { tipo: "Mensagem do site", pedido: null });
  });
  test("período em Brasília: do dia 00:00 (03:00Z) até o fim do último dia", () => {
    const { inicio, fim } = limitesDoPeriodo("2026-11-14", "2026-11-14");
    assert.equal(inicio.toISOString(), "2026-11-14T03:00:00.000Z");
    assert.equal(fim.toISOString(), "2026-11-15T03:00:00.000Z");
  });
});
