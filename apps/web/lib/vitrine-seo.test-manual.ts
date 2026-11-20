// SEO da vitrine (puro). Rodar de apps/web com: NEXTAUTH_URL=https://zap.exemplo.com npx tsx lib/vitrine-seo.test-manual.ts
import assert from "node:assert/strict";
import { carrosDoGrupo, cidadeDaLoja, descricaoDoCarro, gruposDoEstoque, linkDoModelo, slugDe, textosDoGrupo, llmsTxtDaLoja, robotsDaLoja, sitemapDaLoja, tituloDoCarro } from "./vitrine-seo";
import type { CarroPublico, LojaPublica } from "./vitrine";

const loja = { tenantId: "t", slug: "sales", dominio: "www.sales.com.br", nome: "Sales Automóveis", endereco: "Rua A, 10 - Centro, Caxias - RJ", sobre: "Seminovos com procedência.", whatsapp: "5521967629631", horario: ["Seg-Sex 9h-18h"], instagram: null, facebook: null } as unknown as LojaPublica;
const carro = (extra: object = {}) => ({ id: "c1", tipo: "CARRO", marca: "Honda", modelo: "Civic", versao: "EXL", anoFabricacao: 2017, anoModelo: 2018, km: 40000, kmInformado: true, cor: "Prata", combustivel: "Flex", cambio: "Automático", portas: 4, opcionais: [], precoCents: 9_000_000, descricao: null, status: "DISPONIVEL", entradaEm: new Date(), updatedAt: new Date("2026-11-01T00:00:00Z"), fotos: [{ id: "f1" }, { id: "f2" }], ...extra }) as unknown as CarroPublico;
let n = 0;
const ok = (t: string) => { console.log(`ok    ${t}`); n++; };

const t = tituloDoCarro(carro(), loja);
assert.match(t, /Honda Civic EXL 2017\/2018 por R\$\s?90\.000 \| Sales Automóveis/);
ok("título com carro, preço e loja");
const d = descricaoDoCarro(carro(), loja);
assert.match(d, /40\.000 km/);
assert.match(d, /Automático, Flex, Prata/);
assert.ok(d.length <= 200);
ok("descrição com km, câmbio, combustível e cor");
assert.doesNotMatch(descricaoDoCarro(carro({ kmInformado: false }), loja), / km/);
ok("sem km informada, não inventa km");

const robots = robotsDaLoja(loja);
assert.match(robots, /User-agent: GPTBot/);
assert.match(robots, /User-agent: ClaudeBot/);
assert.match(robots, /Allow: \/api\/loja\/\*\/fotos\//);
assert.match(robots, /Sitemap: https:\/\/www\.sales\.com\.br\/sitemap\.xml/);
assert.equal(robotsDaLoja(null), "User-agent: *\nDisallow: /\n");
ok("robots convida IAs, libera fotos e aponta o sitemap");

const sm = sitemapDaLoja(loja, [carro()]);
assert.match(sm, /<lastmod>2026-11-01T00:00:00\.000Z<\/lastmod>/);
assert.match(sm, /image:loc>https:\/\/www\.sales\.com\.br\/api\/loja\/sales\/fotos\/f1</);
assert.match(sm, /<loc>https:\/\/www\.sales\.com\.br\/loja\/sales\/c1<\/loc>/);
assert.match(sm, /<loc>https:\/\/www\.sales\.com\.br\/financiamento<\/loc>/);
ok("sitemap com data, fotos e páginas");
assert.ok(!sitemapDaLoja(loja, [carro({ descricao: "a<b" })]).includes("a<b"));
ok("sitemap escapa texto");

const llms = llmsTxtDaLoja(loja, [carro(), carro({ id: "c2", modelo: "Gol", kmInformado: false, status: "RESERVADO" })]);
assert.match(llms, /^# Sales Automóveis/);
assert.match(llms, /Estoque \(2 veículos\)/);
assert.match(llms, /\[Honda Civic EXL 2017\/2018\]\(https:\/\/www\.sales\.com\.br\/loja\/sales\/c1\): R\$\s?90\.000, 40\.000 km, Automático, Flex, Prata/);
assert.match(llms, /reservado/);
assert.match(llms, /WhatsApp: \+5521967629631/);
assert.doesNotMatch(llms, /privacidade/i);
ok("llms.txt com contato, páginas e estoque");

assert.equal(slugDe("Citroën C3 Aircross"), "citroen-c3-aircross");
assert.equal(cidadeDaLoja("Rua A, 10 - Centro, Duque de Caxias - RJ"), "Duque de Caxias");
assert.equal(cidadeDaLoja("Av. Brasil 100, Caxias/RJ"), "Caxias");
assert.equal(cidadeDaLoja("Rua das Flores 10"), null);
assert.equal(cidadeDaLoja(null), null);
ok("slug e cidade do endereço");
const estoque = [carro(), carro({ id: "c2" }), carro({ id: "c3", modelo: "Fit", precoCents: 6_000_000, anoModelo: 2015 }), carro({ id: "c4", marca: "Citroën", modelo: "C3" })];
const g = gruposDoEstoque(estoque);
assert.deepEqual(g.map((x) => [x.marcaSlug, x.n]), [["honda", 3], ["citroen", 1]]);
assert.deepEqual(g[0].modelos.map((m) => [m.modeloSlug, m.n]), [["civic", 2], ["fit", 1]]);
assert.equal(carrosDoGrupo(estoque, "honda", "civic").length, 2);
assert.equal(carrosDoGrupo(estoque, "honda", "x").length, 0);
assert.equal(linkDoModelo(loja, "honda", "civic"), "https://www.sales.com.br/loja/sales/marca/honda/civic");
ok("grupos por marca e modelo, só o que há em estoque");
const tx = textosDoGrupo(loja, "Honda Civic", carrosDoGrupo(estoque, "honda", "civic"));
assert.match(tx.titulo, /^Honda Civic usado em Caxias \| Sales Automóveis$/);
assert.match(tx.descricao, /2 unidades.*anos 2018.*a partir de R\$\s?90\.000/);
ok("textos da página de modelo com cidade, quantidade e preço inicial");
assert.match(sitemapDaLoja(loja, estoque), /marca\/honda\/civic<\/loc>/);
assert.match(llmsTxtDaLoja(loja, estoque), /## Por marca\n- \[Honda \(3\)\]/);
ok("sitemap e llms.txt incluem marca e modelo");
console.log(`\ntudo certo (${n})`);
