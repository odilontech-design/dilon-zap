import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { fichaMesclada, SELECT_FICHA, type FichaDoContato } from "../../../apps/worker/src/mesclar-campos";
import { mesclar } from "../../../apps/worker/src/reconcile-contacts";
import { salvarContato } from "../../../apps/web/lib/salvar-contato";

/**
 * Dois defeitos do relato da Believe (10/11, "sumiram os dados de algumas clientes"):
 * a junção de contatos duplicados jogava fora a ficha e o financeiro do duplicado, e a ficha não avisava
 * quando a gravação falhava.
 */

const vazia: FichaDoContato = {
  name: null, nameManual: false, documento: null, endereco: null, email: null, nascimento: null, rgIe: null, cep: null,
  logradouro: null, numeroEndereco: null, complemento: null, bairro: null, cidade: null, uf: null, nomeNoRecibo: null,
  notes: null, notesUpdatedAt: null,
};

describe("ficha mesclada (puro)", () => {
  test("o que o sobrevivente já tem manda; o que falta vem do duplicado", () => {
    const vive = { ...vazia, name: "Taisa", email: "vive@x.com" };
    const morre = { ...vazia, name: "Outro", email: "morre@x.com", documento: "123.456.789-00", cep: "20000-000", cidade: "Rio" };
    const r = fichaMesclada(vive, morre);
    assert.equal(r.name, "Taisa");
    assert.equal(r.email, "vive@x.com");
    assert.equal(r.documento, "123.456.789-00");
    assert.equal(r.cep, "20000-000");
    assert.equal(r.cidade, "Rio");
  });

  test("campo em branco (só espaços) no sobrevivente conta como vazio", () => {
    const r = fichaMesclada({ ...vazia, documento: "  " }, { ...vazia, documento: "111" });
    assert.equal(r.documento, "111");
  });

  test("nome digitado por uma pessoa vence o do WhatsApp", () => {
    const r = fichaMesclada({ ...vazia, name: "Nome do zap" }, { ...vazia, name: "Nome certo", nameManual: true });
    assert.equal(r.name, "Nome certo");
    assert.equal(r.nameManual, true);
  });

  test("sobrevivente sem nome herda o do duplicado", () => {
    assert.equal(fichaMesclada(vazia, { ...vazia, name: "Maria" }).name, "Maria");
  });

  test("anotações diferentes ficam as duas; iguais ou só uma não duplicam", () => {
    const duas = fichaMesclada({ ...vazia, notes: "compra às quintas" }, { ...vazia, notes: "prefere cartão" });
    assert.ok(duas.notes?.includes("compra às quintas") && duas.notes.includes("prefere cartão"));
    assert.equal(fichaMesclada({ ...vazia, notes: "igual" }, { ...vazia, notes: "igual" }).notes, "igual");
    assert.equal(fichaMesclada(vazia, { ...vazia, notes: "só no duplicado" }).notes, "só no duplicado");
    assert.equal(fichaMesclada({ ...vazia, notes: "só no vivo" }, vazia).notes, "só no vivo");
  });

  test("o SELECT cobre todos os campos da ficha", () => {
    assert.deepEqual(Object.keys(SELECT_FICHA).sort(), Object.keys(vazia).sort());
  });
});

describe("salvarContato: avisa quando não gravou", () => {
  const resposta = (corpo: unknown, init: { status?: number; tipo?: string } = {}) =>
    new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), {
      status: init.status ?? 200,
      headers: { "content-type": init.tipo ?? "application/json" },
    });

  test("gravou: ok", async () => {
    const r = await salvarContato("c1", { documento: "1" }, async () => resposta({ id: "c1" }));
    assert.deepEqual(r, { ok: true });
  });

  test("sessão expirada (HTML do login com status 200) não conta como salvo", async () => {
    const r = await salvarContato("c1", {}, async () => resposta("<html>login</html>", { tipo: "text/html" }));
    assert.equal(r.ok, false);
    assert.match((r as { erro: string }).erro, /sessão expirou/);
  });

  test("erro do servidor com mensagem mostra a mensagem", async () => {
    const r = await salvarContato("c1", {}, async () => resposta({ error: "data de aniversário inválida" }, { status: 400 }));
    assert.deepEqual(r, { ok: false, erro: "data de aniversário inválida" });
  });

  test("erro sem mensagem em texto usa o texto padrão", async () => {
    const r = await salvarContato("c1", {}, async () => resposta({ error: { fieldErrors: {} } }, { status: 400 }));
    assert.deepEqual(r, { ok: false, erro: "Não foi possível salvar." });
  });

  test("falha de rede não lança, devolve o aviso", async () => {
    const r = await salvarContato("c1", {}, async () => {
      throw new TypeError("Failed to fetch");
    });
    assert.equal(r.ok, false);
    assert.match((r as { erro: string }).erro, /Sem conexão/);
  });

  test("manda PATCH para o contato certo", async () => {
    let chamada: { url: string; metodo?: string } | null = null;
    await salvarContato("abc", { email: "a@b.com" }, async (url, init) => {
      chamada = { url, metodo: init.method };
      return resposta({});
    });
    assert.deepEqual(chamada, { url: "/api/contacts/abc", metodo: "PATCH" });
  });
});

describe("junção de contatos duplicados (banco)", () => {
  let tenantId = "";

  before(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: "juncao-a", slug: "juncao-contatos-teste" } })).id;
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  test("a ficha, os pedidos e as contas do duplicado passam para o sobrevivente", async () => {
    const sessao = await prisma.whatsAppSession.create({ data: { tenantId, label: "Principal" } });
    const vive = await prisma.contact.create({
      data: { tenantId, waJid: "5500000008001@s.whatsapp.net", phoneNumber: "5500000008001", name: "Taisa" },
    });
    const morre = await prisma.contact.create({
      data: {
        tenantId,
        waJid: "197788000000001@lid",
        name: "Taisa lid",
        documento: "111.222.333-44",
        email: "taisa@exemplo.com",
        cep: "21000-000",
        cidade: "Rio de Janeiro",
        notes: "cliente antiga",
      },
    });
    await prisma.conversation.create({ data: { tenantId, sessionId: sessao.id, contactId: vive.id } });
    await prisma.conversation.create({ data: { tenantId, sessionId: sessao.id, contactId: morre.id } });
    const pedido = await prisma.order.create({ data: { tenantId, contactId: morre.id } });
    const conta = await prisma.contaReceber.create({ data: { tenantId, contactId: morre.id } });

    const candidato = async (id: string) => {
      const c = await prisma.contact.findUniqueOrThrow({
        where: { id },
        select: { id: true, tenantId: true, waJid: true, phoneNumber: true, avatarUrl: true, stageId: true, dealValueCents: true, ...SELECT_FICHA },
      });
      return c;
    };

    await mesclar(await candidato(vive.id), await candidato(morre.id));

    const depois = await prisma.contact.findUniqueOrThrow({ where: { id: vive.id } });
    assert.equal(depois.documento, "111.222.333-44");
    assert.equal(depois.email, "taisa@exemplo.com");
    assert.equal(depois.cep, "21000-000");
    assert.equal(depois.cidade, "Rio de Janeiro");
    assert.equal(depois.notes, "cliente antiga");
    assert.equal(depois.name, "Taisa");

    assert.equal(await prisma.contact.count({ where: { id: morre.id } }), 0);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } })).contactId, vive.id);
    assert.equal((await prisma.contaReceber.findUniqueOrThrow({ where: { id: conta.id } })).contactId, vive.id);
    assert.equal(await prisma.conversation.count({ where: { contactId: vive.id } }), 1);
  });
});
