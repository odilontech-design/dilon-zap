import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";

// A chave dos segredos guardados (a mesma dos portais), só para este arquivo.
process.env.PORTAIS_CHAVE = Buffer.alloc(32, 7).toString("base64");

import { prisma } from "@dilon-zap/db";
import {
  buscarPainel,
  chamarAvisos,
  chamarSite,
  enderecoPrivado,
  ErroDoPainel,
  lerPainel,
  limparCacheDoPainel,
  motivoDePeriodoInvalido,
  TTL_FRESCO_MS,
  urlDoSite,
} from "../../../apps/web/lib/painel-ecommerce";
import { lerConfigDoPainel, removerConfigDoPainel, resumoDaConfig, salvarConfigDoPainel } from "../../../apps/web/lib/painel-ecommerce-config";

/**
 * Painel "Site" da Believe (13/11): contrato v1 com o site, proteção do endereço, período, cache de 5 minutos,
 * reserva quando o site cai, e a chave guardada cifrada.
 */

const PAINEL = {
  versao: 1,
  periodo: { de: "2026-11-01", ate: "2026-11-13" },
  geradoEm: "2026-11-13T15:00:00-03:00",
  vendas: { faturamentoCents: 1830000, pedidosPagos: 31, ticketMedioCents: 59000, freteCents: 120000, descontos: { comboCents: 5000, cupomCents: 7000, indicacaoCents: 9000, cashbackCents: 1000 } },
  funil: { pedidosIniciados: 60, pagos: 31, aguardandoPagamento: 20, cancelados: 9, conversaoBps: 5167 },
  carrinhoAbandonado: { lembrete1Enviados: 20, lembrete2Enviados: 12, pedidosLembrados: 20, recuperados: 6, valorRecuperadoCents: 300000 },
  statusAtual: { pagoAguardandoSeparacao: 3, emSeparacao: 2, enviado: 4 },
  produtos: { maisVendidos: [{ nome: "Shampoo", ingresso: false, quantidade: 10, valorCents: 100000 }], semEstoque: ["Máscara 500g"] },
  cupons: { porCupom: [{ codigo: "BEM10", pedidos: 4, descontoCents: 7000, faturamentoCents: 200000 }], combo: { pedidos: 2, descontoCents: 5000 } },
  indicacao: { pedidos: 5, valorCents: 250000, comissoesCents: 25000, topAfiliadas: [{ codigo: "ANA", nome: "Salão da Ana", pedidos: 3, valorCents: 150000, comissaoCents: 15000 }] },
  clientes: { novasCadastradas: 12, novasCabeleireiras: 4, compradoras: 20, compradorasNovas: 8, compradorasRecorrentes: 12 },
  avisos: { email: { enviados: 40, falhas: 1, pulados: 2 }, whatsapp: { enviados: 30, falhas: 0, pulados: 0 } },
  serieDiaria: [
    { dia: "2026-11-01", faturamentoCents: 0, pedidos: 0 },
    { dia: "2026-11-02", faturamentoCents: 59000, pedidos: 1 },
  ],
};

const respostaJson = (corpo: unknown, status = 200) => new Response(typeof corpo === "string" ? corpo : JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
const publico = async () => ["203.0.113.10"];
const cfg = { tenantId: "t1", url: "https://believecosmeticos.com", chave: "chave-super-secreta-123" };

describe("contrato v1", () => {
  test("a resposta completa do site é aceita como veio", () => {
    const p = lerPainel(PAINEL);
    assert.equal(p.vendas.faturamentoCents, 1830000);
    assert.equal(p.funil.conversaoBps, 5167);
    assert.equal(p.indicacao.topAfiliadas[0].nome, "Salão da Ana");
    assert.equal(p.serieDiaria.length, 2);
  });
  test("seção que falta vira zero, e campo novo do site não derruba a tela", () => {
    const p = lerPainel({ versao: 1, periodo: PAINEL.periodo, geradoEm: PAINEL.geradoEm, campoNovoDoSite: { x: 1 }, vendas: { faturamentoCents: 100 } });
    assert.equal(p.vendas.faturamentoCents, 100);
    assert.equal(p.vendas.pedidosPagos, 0);
    assert.equal(p.avisos.email.falhas, 0);
    assert.deepEqual(p.serieDiaria, []);
  });
  test("outra versão do contrato é recusada com mensagem clara", () => {
    assert.throws(() => lerPainel({ ...PAINEL, versao: 2 }), /versão 2/);
  });
  test("formato que não é o contrato é recusado", () => {
    assert.throws(() => lerPainel({ versao: 1 }), ErroDoPainel);
    assert.throws(() => lerPainel("texto"), ErroDoPainel);
    assert.throws(() => lerPainel({ ...PAINEL, vendas: { faturamentoCents: "muito" } }), ErroDoPainel);
  });
});

describe("período", () => {
  test("período válido", () => {
    assert.equal(motivoDePeriodoInvalido("2026-11-01", "2026-11-13"), null);
    assert.equal(motivoDePeriodoInvalido("2026-11-13", "2026-11-13"), null);
  });
  test("366 dias vale e 367 não (de e até inclusivos)", () => {
    assert.equal(motivoDePeriodoInvalido("2025-11-14", "2026-11-14"), null); // 366 dias
    assert.match(motivoDePeriodoInvalido("2025-11-13", "2026-11-14") ?? "", /366/);
  });
  test("formato errado, data que não existe e ordem invertida", () => {
    assert.ok(motivoDePeriodoInvalido(null, "2026-11-13"));
    assert.ok(motivoDePeriodoInvalido("13/11/2026", "2026-11-13"));
    assert.match(motivoDePeriodoInvalido("2026-02-30", "2026-03-01") ?? "", /inexistente/);
    assert.match(motivoDePeriodoInvalido("2026-11-14", "2026-11-13") ?? "", /depois/);
  });
});

describe("endereço do site (o servidor faz a chamada)", () => {
  test("site público em https é aceito e normalizado", () => {
    assert.deepEqual(urlDoSite("https://believecosmeticos.com/"), { ok: true, base: "https://believecosmeticos.com" });
    assert.deepEqual(urlDoSite(" https://www.Loja.com.br/admin?x=1 "), { ok: true, base: "https://www.loja.com.br" });
  });
  test("http, IP, localhost, rede interna, usuário e porta são recusados", () => {
    for (const ruim of ["http://loja.com.br", "https://127.0.0.1", "https://10.0.0.5", "https://[::1]", "https://localhost", "https://servidor", "https://api.internal", "https://x.local", "https://user:senha@loja.com.br", "https://loja.com.br:8443", "nao-e-url"]) {
      assert.equal(urlDoSite(ruim).ok, false, ruim);
    }
  });
  test("endereços privados, de loopback, link-local e reservados", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) assert.equal(enderecoPrivado(ip), true, ip);
    for (const ip of ["203.0.113.10", "8.8.8.8", "172.32.0.1", "2606:4700::1"]) assert.equal(enderecoPrivado(ip), false, ip);
  });
});

describe("chamar o site", () => {
  test("pede o caminho certo, com o período e a chave no cabeçalho, sem seguir redirecionamento", async () => {
    let visto: { url: string; init: RequestInit } | null = null;
    const p = await chamarSite(cfg, "2026-11-01", "2026-11-13", {
      resolver: publico,
      fetchFn: async (url, init) => {
        visto = { url: String(url), init: init ?? {} };
        return respostaJson(PAINEL);
      },
    });
    assert.equal(p.versao, 1);
    assert.equal(visto!.url, "https://believecosmeticos.com/api/integracao/painel?de=2026-11-01&ate=2026-11-13");
    assert.equal((visto!.init.headers as Record<string, string>).Authorization, "Bearer chave-super-secreta-123");
    assert.equal(visto!.init.redirect, "error");
    assert.equal(visto!.init.method, "GET");
  });
  test("401 do site vira aviso de chave, 400 de período, 500 de erro, e nenhuma mensagem leva a chave", async () => {
    const tenta = (status: number) => chamarSite(cfg, "2026-11-01", "2026-11-13", { resolver: publico, fetchFn: async () => respostaJson({ error: "falha com chave-super-secreta-123" }, status) });
    await assert.rejects(tenta(401), /chave/);
    await assert.rejects(tenta(400), /período/);
    await assert.rejects(tenta(500), /erro \(500\)/);
    for (const s of [401, 400, 500]) {
      const e = (await tenta(s).catch((x) => x)) as Error;
      assert.equal(e.message.includes("chave-super-secreta-123"), false);
    }
  });
  test("site fora do ar e demora viram mensagens distintas", async () => {
    await assert.rejects(chamarSite(cfg, "2026-11-01", "2026-11-13", { resolver: publico, fetchFn: async () => { throw new TypeError("fetch failed"); } }), /não respondeu/);
    await assert.rejects(chamarSite(cfg, "2026-11-01", "2026-11-13", { resolver: publico, fetchFn: async () => { const e = new Error("t"); e.name = "TimeoutError"; throw e; } }), /demorou/);
  });
  test("resposta que não é JSON ou que passa do limite é recusada", async () => {
    await assert.rejects(chamarSite(cfg, "2026-11-01", "2026-11-13", { resolver: publico, fetchFn: async () => new Response("<html>", { status: 200 }) }), /formato/);
    await assert.rejects(chamarSite(cfg, "2026-11-01", "2026-11-13", { resolver: publico, fetchFn: async () => new Response("x".repeat(1_600_000), { status: 200 }) }), /grande demais/);
  });
  test("nome que aponta para rede interna não é chamado (a chave nem sai)", async () => {
    let chamou = false;
    await assert.rejects(
      chamarSite(cfg, "2026-11-01", "2026-11-13", { resolver: async () => ["10.0.0.7"], fetchFn: async () => { chamou = true; return respostaJson(PAINEL); } }),
      /rede interna/
    );
    assert.equal(chamou, false);
  });
  test("site que não existe no DNS, endereço ruim e período ruim", async () => {
    await assert.rejects(chamarSite(cfg, "2026-11-01", "2026-11-13", { resolver: async () => { throw new Error("ENOTFOUND"); }, fetchFn: async () => respostaJson(PAINEL) }), /Não encontrei/);
    await assert.rejects(chamarSite({ ...cfg, url: "http://loja.com.br" }, "2026-11-01", "2026-11-13", { resolver: publico }), /https/);
    await assert.rejects(chamarSite(cfg, "2026-11-13", "2026-11-01", { resolver: publico }), /depois/);
  });
});

describe("avisos da régua (e-mails do site)", () => {
  const AVISO = {
    id: "n1", quando: "2026-11-15T03:34:00.000Z", pedido: 19, evento: "pago", eventoRotulo: "Pagamento confirmado", canal: "EMAIL",
    status: "FALHOU", detalhe: "Invalid login", cliente: "Felipe", destino: "f@x.com", assunto: "Pedido #19 confirmado", texto: "Oi",
  };
  test("pede a rota de avisos com período e filtros, e lê a lista", async () => {
    let url = "";
    const r = await chamarAvisos(cfg, "2026-11-01", "2026-11-15", { canal: "EMAIL", status: "FALHOU" }, {
      resolver: publico,
      fetchFn: async (u) => { url = String(u); return respostaJson({ versao: 1, avisos: [AVISO] }); },
    });
    assert.equal(url, "https://believecosmeticos.com/api/integracao/avisos?de=2026-11-01&ate=2026-11-15&canal=EMAIL&status=FALHOU");
    assert.equal(r[0].detalhe, "Invalid login");
  });
  test("site sem a rota nova (404) e formato errado viram aviso claro", async () => {
    await assert.rejects(chamarAvisos(cfg, "2026-11-01", "2026-11-15", {}, { resolver: publico, fetchFn: async () => respostaJson({ error: "x" }, 404) }), /publicar a versão nova/);
    await assert.rejects(chamarAvisos(cfg, "2026-11-01", "2026-11-15", {}, { resolver: publico, fetchFn: async () => respostaJson({ versao: 1, avisos: [{ id: 1 }] }) }), /formato/);
  });
});

describe("cache de 5 minutos e reserva", () => {
  beforeEach(() => limparCacheDoPainel());

  test("a segunda consulta dentro de 5 minutos vem do cache, e depois disso busca de novo", async () => {
    let chamadas = 0;
    let agora = 1_000_000;
    const o = { resolver: publico, agora: () => agora, fetchFn: async () => { chamadas++; return respostaJson(PAINEL); } };
    const a = await buscarPainel(cfg, "2026-11-01", "2026-11-13", o);
    assert.equal(a.origem, "site");
    agora += TTL_FRESCO_MS - 1;
    assert.equal((await buscarPainel(cfg, "2026-11-01", "2026-11-13", o)).origem, "cache");
    assert.equal(chamadas, 1);
    agora += 2;
    assert.equal((await buscarPainel(cfg, "2026-11-01", "2026-11-13", o)).origem, "site");
    assert.equal(chamadas, 2);
  });
  test("o cache é por empresa e por período", async () => {
    let chamadas = 0;
    const o = { resolver: publico, fetchFn: async () => { chamadas++; return respostaJson(PAINEL); } };
    await buscarPainel(cfg, "2026-11-01", "2026-11-13", o);
    await buscarPainel({ ...cfg, tenantId: "t2" }, "2026-11-01", "2026-11-13", o);
    await buscarPainel(cfg, "2026-11-02", "2026-11-13", o);
    assert.equal(chamadas, 3);
  });
  test("site caiu depois de uma consulta boa: devolve a reserva com o motivo, em vez de quebrar", async () => {
    let agora = 1_000_000;
    let fora = false;
    const o = { resolver: publico, agora: () => agora, fetchFn: async () => (fora ? respostaJson({ error: "x" }, 500) : respostaJson(PAINEL)) };
    const boa = await buscarPainel(cfg, "2026-11-01", "2026-11-13", o);
    fora = true;
    agora += TTL_FRESCO_MS + 1000;
    const r = await buscarPainel(cfg, "2026-11-01", "2026-11-13", o);
    assert.equal(r.origem, "reserva");
    assert.match(r.erro ?? "", /erro \(500\)/);
    assert.equal(r.buscadoEm, boa.buscadoEm);
    assert.equal(r.dados.vendas.faturamentoCents, 1830000);
  });
  test("reserva com mais de 24 horas não serve", async () => {
    let agora = 1_000_000;
    let fora = false;
    const o = { resolver: publico, agora: () => agora, fetchFn: async () => (fora ? respostaJson({ error: "x" }, 500) : respostaJson(PAINEL)) };
    await buscarPainel(cfg, "2026-11-01", "2026-11-13", o);
    fora = true;
    agora += 25 * 60 * 60_000;
    await assert.rejects(buscarPainel(cfg, "2026-11-01", "2026-11-13", o), ErroDoPainel);
  });
  test("site fora do ar sem nenhuma consulta anterior: o erro sobe para a tela avisar", async () => {
    await assert.rejects(buscarPainel(cfg, "2026-11-01", "2026-11-13", { resolver: publico, fetchFn: async () => { throw new TypeError("x"); } }), /não respondeu/);
  });
  test("pedidos iguais ao mesmo tempo viram uma chamada só", async () => {
    let chamadas = 0;
    const o = { resolver: publico, fetchFn: async () => { chamadas++; await new Promise((r) => setTimeout(r, 20)); return respostaJson(PAINEL); } };
    await Promise.all([buscarPainel(cfg, "2026-11-01", "2026-11-13", o), buscarPainel(cfg, "2026-11-01", "2026-11-13", o), buscarPainel(cfg, "2026-11-01", "2026-11-13", o)]);
    assert.equal(chamadas, 1);
  });
});

describe("chave guardada por empresa (banco)", () => {
  let tenantId = "";
  before(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: "painel-site", slug: "painel-site-teste" } })).id;
  });
  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  test("grava cifrada, lê de volta, e o banco nunca guarda a chave em claro", async () => {
    const base = await salvarConfigDoPainel(tenantId, "https://Minha-Loja.com.br/", "dz-chave-do-painel-9999");
    assert.equal(base, "https://minha-loja.com.br");
    const bruto = await prisma.painelEcommerceConfig.findUniqueOrThrow({ where: { tenantId } });
    assert.equal(bruto.chaveCripto.includes("dz-chave-do-painel-9999"), false);
    assert.match(bruto.chaveCripto, /^v1\./);
    assert.deepEqual(await lerConfigDoPainel(tenantId), { url: "https://minha-loja.com.br", chave: "dz-chave-do-painel-9999" });
  });
  test("o resumo para a tela não traz a chave nem o texto cifrado", async () => {
    const r = await resumoDaConfig(tenantId);
    assert.equal(r.configurada, true);
    assert.equal(JSON.stringify(r).includes("chave"), false);
  });
  test("trocar só o endereço mantém a chave; sem chave e sem cadastro anterior, recusa", async () => {
    await salvarConfigDoPainel(tenantId, "https://outra-loja.com.br", "");
    assert.deepEqual(await lerConfigDoPainel(tenantId), { url: "https://outra-loja.com.br", chave: "dz-chave-do-painel-9999" });
    await removerConfigDoPainel(tenantId);
    assert.equal(await lerConfigDoPainel(tenantId), null);
    await assert.rejects(salvarConfigDoPainel(tenantId, "https://outra-loja.com.br", ""), /chave/);
  });
  test("endereço que não serve é recusado antes de gravar", async () => {
    await assert.rejects(salvarConfigDoPainel(tenantId, "http://loja.com.br", "x"), /https/);
    assert.equal(await prisma.painelEcommerceConfig.count({ where: { tenantId } }), 0);
  });
  test("apagar a empresa leva a configuração junto", async () => {
    const t2 = (await prisma.tenant.create({ data: { name: "painel-site-2", slug: "painel-site-teste-2" } })).id;
    await salvarConfigDoPainel(t2, "https://loja2.com.br", "k2");
    await prisma.tenant.delete({ where: { id: t2 } });
    assert.equal(await prisma.painelEcommerceConfig.count({ where: { tenantId: t2 } }), 0);
  });
});
