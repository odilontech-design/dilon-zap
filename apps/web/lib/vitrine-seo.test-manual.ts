// SEO da vitrine (puro). Rodar de apps/web com: NEXTAUTH_URL=https://zap.exemplo.com npx tsx lib/vitrine-seo.test-manual.ts
import assert from "node:assert/strict";
import { descricaoDoCarro, llmsTxtDaLoja, robotsDaLoja, sitemapDaLoja, tituloDoCarro } from "./vitrine-seo";
import type { CarroPublico, LojaPublica } from "./vitrine";

const loja = { tenantId: "t", slug: "sales", dominio: "www.sales.com.br", nome: "Sales Automóveis", endereco: "Rua A, 10 - Caxias", sobre: "Seminovos com procedência.", whatsapp: "5521967629631", horario: ["Seg-Sex 9h-18h"], instagram: null, facebook: null } as unknown as LojaPublica;
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
console.log(`\ntudo certo (${n})`);
