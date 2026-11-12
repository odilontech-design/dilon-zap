// Importação do site atual de ponta a ponta: Postgres de verdade + site falso (sem rede).
// Rodar de apps/web com: DATABASE_URL=postgresql://... npx tsx lib/importar-site-estoque.test-manual.ts
import fs from "node:fs";
import { prisma } from "@dilon-zap/db";
import { ErroPagina } from "./buscar-pagina";
import { ErroImportacaoSite, importarDoSite } from "./importar-site-estoque";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const lista = fs.readFileSync("test-fixtures/site-autocerto-lista.html", "utf8");
const detalhe = fs.readFileSync("test-fixtures/site-autocerto-detalhe.html", "utf8");
const chamadas: string[] = [];
let detalheFora = new Set<string>();
const buscar = async (url: string) => {
  chamadas.push(url);
  if (/\/Veiculos$/i.test(url)) return { html: lista, urlFinal: url };
  if (url === "https://www.salesautomoveis.com.br/") throw new ErroPagina("o site respondeu 404"); // a home não é a lista
  if (/detalhes$/.test(url)) {
    if ([...detalheFora].some((x) => url.includes(x))) throw new ErroPagina("o site não respondeu");
    return { html: detalhe, urlFinal: url };
  }
  throw new ErroPagina("o site respondeu 404");
};

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: "teste-site" } });
  const t = await prisma.tenant.create({ data: { name: "Loja Site", slug: "teste-site" } });
  const dono = await prisma.user.create({ data: { tenantId: t.id, name: "Dono", email: "dono@site.teste", passwordHash: "x", role: "OWNER" } });
  const base = { tenantId: t.id, userId: dono.id, endereco: "www.salesautomoveis.com.br", buscar };

  const sim = await importarDoSite({ ...base, simular: true });
  checa("simulação: 3 carros encontrados e entram", [sim.encontrados, sim.entram, sim.criados], [3, 3, 0]);
  checa("simulação não grava nada", await prisma.veiculo.count({ where: { tenantId: t.id } }), 0);
  checa("simulação não abre as páginas dos carros", chamadas.some((c) => c.endsWith("/detalhes")), false);
  checa("pendências contadas", [sim.semPreco >= 2, sim.semKm >= 2], [true, true]);
  checa("tentou a home e depois /Veiculos", chamadas.slice(0, 2).map((c) => new URL(c).pathname), ["/", "/Veiculos"]);

  const r = await importarDoSite({ ...base, simular: false });
  checa("criou os 3", [r.criados, r.semDetalhe], [3, 0]);
  const carros = await prisma.veiculo.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: "asc" } });
  const c = carros[0];
  checa("entra em preparação, na origem COMPRA", [c.status, c.origem, c.tipo], ["PREPARACAO", "COMPRA", "CARRO"]);
  checa("dados do site", [c.marca, c.modelo, c.anoModelo, c.cor, c.cambio, c.combustivel], ["Chevrolet", "CLASSIC", 2015, "Cinza", "Manual", "Flex"]);
  checa("sem preço e sem km", [c.precoCents, c.km, c.kmInformado, c.placa], [0, 0, false, null]);
  checa("id do site guardado", c.siteOrigemId, "autocerto:5465653");
  checa("opcionais e fotos do detalhe", [c.opcionais.length > 20, c.fotosParaImportar.length > 5, c.fotosParaImportar[0].includes("/1_")], [true, true, true]);
  const ev = await prisma.eventoVeiculo.findFirstOrThrow({ where: { veiculoId: c.id } });
  checa("histórico diz de onde veio e o que falta", [ev.descricao.includes("www.salesautomoveis.com.br"), ev.descricao.includes("Falta informar: preço, quilometragem, placa")], [true, true]);

  const de_novo = await importarDoSite({ ...base, simular: false });
  checa("reimportar não duplica", [de_novo.entram, de_novo.jaNoEstoque, de_novo.criados, await prisma.veiculo.count({ where: { tenantId: t.id } })], [0, 3, 0, 3]);

  // Carro vendido aqui, ainda no site antigo: também não volta.
  await prisma.veiculo.update({ where: { id: c.id }, data: { status: "VENDIDO" } });
  checa("vendido não é reimportado", (await importarDoSite({ ...base, simular: true })).jaNoEstoque, 3);

  // Página de um carro fora do ar: entra só com a capa.
  await prisma.veiculo.deleteMany({ where: { tenantId: t.id } });
  detalheFora = new Set(["5465653"]);
  const parcial = await importarDoSite({ ...base, simular: false });
  const sem = await prisma.veiculo.findFirstOrThrow({ where: { tenantId: t.id, siteOrigemId: "autocerto:5465653" } });
  checa("detalhe fora do ar: entra com a capa e avisa", [parcial.criados, parcial.semDetalhe, sem.fotosParaImportar, sem.opcionais.length], [3, 1, ["https://www.autocerto.com/fotos/520/5465653/4_031254.jpg"], 0]);
  detalheFora = new Set();

  // Plano com limite de 1 vaga no pátio.
  await prisma.veiculo.deleteMany({ where: { tenantId: t.id } });
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, plano: "GARAGEM" } });
  await prisma.veiculo.createMany({
    data: Array.from({ length: 29 }, (_, i) => ({ tenantId: t.id, marca: "X", modelo: `M${i}`, anoFabricacao: 2020, anoModelo: 2020, km: 1, precoCents: 100, status: "DISPONIVEL" as const, origem: "COMPRA" as const })),
  });
  const limite = await importarDoSite({ ...base, simular: false });
  checa("plano Garagem: 29 no pátio, cabe só 1", [limite.criados, limite.alemDoPlano], [1, 2]);

  // Erros que a pessoa vê.
  const erro = async (endereco: string, b = buscar) => importarDoSite({ ...base, endereco, buscar: b, simular: true }).then(() => null, (e) => (e instanceof ErroImportacaoSite ? e.message : String(e)));
  checa("endereço inválido", await erro("localhost"), "endereço do site inválido: use algo como www.sualoja.com.br");
  checa("site que não é AutoCerto", (await erro("www.outrosite.com.br", async () => ({ html: "<html><body>olá</body></html>", urlFinal: "https://x.com/" })))?.includes("use a planilha"), true);
  checa("site fora do ar", (await erro("www.foradear.com.br", async () => { throw new ErroPagina("o site não respondeu"); }))?.startsWith("o site não respondeu"), true);

  await prisma.tenant.delete({ where: { id: t.id } });
  await prisma.$disconnect();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
