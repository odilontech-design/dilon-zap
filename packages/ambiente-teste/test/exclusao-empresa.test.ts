import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { excluirEmpresaNoBanco, impactoDaExclusao } from "../../../apps/web/lib/excluir-empresa";

/**
 * Excluir uma empresa pelo painel admin: a cascata do banco leva tudo, as quatro relações RESTRICT do schema não
 * travam a exclusão, e os impeditivos (cobrança ativa, ERP, SUPERADMIN, própria empresa) seguram o que precisa.
 */

let tenantId = "";
let outroId = "";
let adminTenantId = "";

describe("exclusão de empresa", () => {
  // Hooks dentro do describe: os testes rodam todos no mesmo processo e no mesmo banco, então a limpeza
  // precisa acontecer quando ESTE bloco termina, não no fim da execução (outros testes contam contatos e sessões).
  before(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: "excluir-a", slug: "exclusao-teste-a" } })).id;
    outroId = (await prisma.tenant.create({ data: { name: "excluir-b", slug: "exclusao-teste-b" } })).id;
    adminTenantId = (await prisma.tenant.create({ data: { name: "excluir-admin", slug: "exclusao-teste-admin" } })).id;

    await prisma.user.create({ data: { tenantId, email: "dono@exclusao.teste", name: "Dono Teste", role: "OWNER", passwordHash: "x" } });
    await prisma.whatsAppSession.create({ data: { tenantId, label: "Principal" } });
    await prisma.subscription.create({ data: { tenantId, status: "TRIAL", amountCents: 0, cycleDay: 5 } });
    const contato = await prisma.contact.create({ data: { tenantId, waJid: "5500000009001@s.whatsapp.net", phoneNumber: "5500000009001", name: "Cliente Teste" } });
    const funil = await prisma.funil.create({ data: { tenantId, nome: "Funil Teste" } });
    const etapa = await prisma.stage.create({ data: { tenantId, funilId: funil.id, name: "Etapa", position: 0 } });
    await prisma.negociacao.create({
      data: { tenantId, contactId: contato.id, funilId: funil.id, stageId: etapa.id, titulo: "Negociação", valorCents: 0, recorrencia: "UNICA", valorMensalCents: 0 },
    });
    const fornecedor = await prisma.fornecedor.create({ data: { tenantId, nome: "Fornecedor Teste" } });
    await prisma.contaPagar.create({ data: { tenantId, fornecedorId: fornecedor.id } });
    const perfil = await prisma.sdrIcp.create({ data: { tenantId, nome: "Perfil Teste" } });
    await prisma.sdrCampanha.create({ data: { tenantId, nome: "Campanha Teste", icpId: perfil.id } });

    // Dados de outra empresa: não podem sumir junto.
    await prisma.contact.create({ data: { tenantId: outroId, waJid: "5500000009002@s.whatsapp.net", phoneNumber: "5500000009002", name: "Outra Empresa" } });
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, outroId, adminTenantId] } } });
    await prisma.auditLog.deleteMany({ where: { targetTenantId: tenantId } });
  });

  test("o schema só tem as relações RESTRICT que a exclusão já trata", async () => {
    const linhas = await prisma.$queryRawUnsafe<{ nome: string }[]>(
      `select conname as nome from pg_constraint where contype = 'f' and confdeltype = 'r' order by 1`
    );
    assert.deepEqual(linhas.map((l) => l.nome), [
      "ContaPagar_fornecedorId_fkey",
      "Negociacao_funilId_fkey",
      "Negociacao_stageId_fkey",
      "SdrCampanha_tenantId_icpId_fkey",
    ]);
  });

  test("o resumo conta o que será apagado e não aponta impeditivo numa empresa comum", async () => {
    const i = await impactoDaExclusao(tenantId, adminTenantId);
    assert.ok(i);
    assert.equal(i.usuarios, 1);
    assert.equal(i.sessoes, 1);
    assert.equal(i.contatos, 1);
    assert.deepEqual(i.impeditivos, []);
  });

  test("a empresa de quem opera o painel não pode ser excluída", async () => {
    const i = await impactoDaExclusao(tenantId, tenantId);
    assert.equal(i?.impeditivos.length, 1);
  });

  test("cobrança automática ativa e ERP vinculado impedem; cancelada libera", async () => {
    const t = (await prisma.tenant.create({ data: { name: "excluir-cobranca", slug: "exclusao-teste-cobranca" } })).id;
    try {
      const sub = await prisma.subscription.create({ data: { tenantId: t, status: "ACTIVE", amountCents: 100, cycleDay: 5, asaasSubscriptionId: "sub_teste" } });
      assert.equal((await impactoDaExclusao(t, adminTenantId))?.impeditivos.length, 1);
      await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELED" } });
      assert.equal((await impactoDaExclusao(t, adminTenantId))?.impeditivos.length, 0);
    } finally {
      await prisma.tenant.delete({ where: { id: t } });
    }
  });

  test("usuário SUPERADMIN impede", async () => {
    const t = (await prisma.tenant.create({ data: { name: "excluir-super", slug: "exclusao-teste-super" } })).id;
    try {
      await prisma.user.create({ data: { tenantId: t, email: "super@exclusao.teste", name: "Super", role: "SUPERADMIN", passwordHash: "x" } });
      assert.equal((await impactoDaExclusao(t, adminTenantId))?.impeditivos.length, 1);
    } finally {
      await prisma.tenant.delete({ where: { id: t } });
    }
  });

  test("apaga a empresa com funil, negociação, conta a pagar e campanha, e só ela", async () => {
    await excluirEmpresaNoBanco(tenantId);
    assert.equal(await prisma.tenant.count({ where: { id: tenantId } }), 0);
    for (const modelo of ["user", "contact", "whatsAppSession", "funil", "stage", "negociacao", "fornecedor", "contaPagar", "sdrIcp", "sdrCampanha", "subscription"] as const) {
      const n = await (prisma[modelo] as unknown as { count: (a: unknown) => Promise<number> }).count({ where: { tenantId } });
      assert.equal(n, 0, `sobrou registro em ${modelo}`);
    }
    assert.equal(await prisma.contact.count({ where: { tenantId: outroId } }), 1, "a outra empresa foi afetada");
    assert.equal(await impactoDaExclusao(tenantId, adminTenantId), null);
  });
});
