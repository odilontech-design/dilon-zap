// Leitor do site atual (AutoCerto). Rodar de apps/web com: npx tsx lib/importar-site.test-manual.ts
// Usa trechos reais do site da Sales guardados em test-fixtures/.
import fs from "node:fs";
import { enderecoDoSite, lerDetalheDoSite, lerKmDoSite, lerListaDoSite, lerPrecoDoSite, marcasDoFiltro, nomePropio, separarMarcaModelo } from "./importar-site";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const base = "https://www.salesautomoveis.com.br/Veiculos";
const lista = fs.readFileSync("test-fixtures/site-autocerto-lista.html", "utf8");
const detalhe = fs.readFileSync("test-fixtures/site-autocerto-detalhe.html", "utf8");

checa("marcas do filtro, as mais longas primeiro", marcasDoFiltro(lista).slice(0, 3).length, 3);
const { cards, ignorados } = lerListaDoSite(lista, base);
checa("3 cards lidos, nenhum ignorado", [cards.length, ignorados], [3, 0]);
const c = cards[0];
checa("marca e modelo", [c.marca, c.modelo], ["Chevrolet", "CLASSIC"]);
checa("versão", c.versao, "1.0 MPFI LS 8V FLEX 4P MANUAL");
checa("ano", [c.anoFabricacao, c.anoModelo], [2015, 2015]);
checa("km N/I vira 0 e não informado", [c.km, c.kmInformado], [0, false]);
checa("Sob Consulta vira 0", c.precoCents, 0);
checa("cor, câmbio, combustível", [c.cor, c.cambio, c.combustivel], ["Cinza", "Manual", "Flex"]);
checa("id do carro no site", c.siteId, "autocerto:5465653");
checa("endereço do detalhe absoluto", c.urlDetalhe, "https://www.salesautomoveis.com.br/Veiculo/classic-1.0-mpfi-ls-8v-flex-4p-manual-flex-2015/5465653/detalhes");
checa("capa", c.capa, "https://www.autocerto.com/fotos/520/5465653/4_031254.jpg");

const d = lerDetalheDoSite(detalhe, base);
checa("opcionais lidos e sem repetir", [d.opcionais.length > 20, d.opcionais.includes("Ar condicionado"), new Set(d.opcionais).size === d.opcionais.length], [true, true, true]);
checa("acentos dos opcionais", d.opcionais.includes("Retrovisores elétricos"), true);
checa("fotos sem repetir, na ordem do site", [d.fotos.length > 5, new Set(d.fotos).size === d.fotos.length, d.fotos[0]?.includes("/1_")], [true, true, true]);
checa("características não entram nos opcionais", d.opcionais.includes("IPVA Pago"), false);

checa("preço com milhar e centavos", lerPrecoDoSite("R$ 79.999,99"), 7_999_999);
checa("preço inteiro", lerPrecoDoSite("R$ 10.000"), 1_000_000);
checa("sob consulta", lerPrecoDoSite("R$ Sob Consulta"), 0);
checa("km com ponto", lerKmDoSite("45.300 km"), 45300);
checa("km N/I", lerKmDoSite("N/I"), null);
checa("marca composta pela lista", separarMarcaModelo("LAND ROVER DEFENDER", ["LAND ROVER", "FORD"]), { marca: "LAND ROVER", modelo: "DEFENDER" });
checa("marca simples sem lista", separarMarcaModelo("VOLKSWAGEN NIVUS", []), { marca: "VOLKSWAGEN", modelo: "NIVUS" });
checa("só a marca não vale", separarMarcaModelo("FIAT", ["FIAT"]), null);
checa("nome próprio", [nomePropio("VOLKSWAGEN"), nomePropio("ALFA ROMEO"), nomePropio("BMW"), nomePropio("MERCEDES-BENZ")], ["Volkswagen", "Alfa Romeo", "BMW", "Mercedes-benz"]);
checa("endereço sem https", enderecoDoSite("www.salesautomoveis.com.br")?.toString(), "https://www.salesautomoveis.com.br/");
checa("endereço sem ponto", enderecoDoSite("localhost"), null);
checa("endereço vazio", enderecoDoSite("  "), null);

// A página inteira de verdade (60 carros), se estiver na máquina.
const real = "/tmp/sales-site/lista.html";
if (fs.existsSync(real)) {
  const r = lerListaDoSite(fs.readFileSync(real, "utf8"), base);
  checa("página real: 60 carros, nenhum ignorado", [r.cards.length, r.ignorados], [60, 0]);
  checa("página real: todos com marca, modelo e ano", r.cards.every((x) => x.marca && x.modelo && x.anoModelo >= 1990), true);
  checa("página real: ids únicos", new Set(r.cards.map((x) => x.siteId)).size, 60);
  console.log("      preços informados:", r.cards.filter((x) => x.precoCents > 0).length, "| km informado:", r.cards.filter((x) => x.kmInformado).length);
  console.log("      marcas:", [...new Set(r.cards.map((x) => x.marca))].join(", "));
}
console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
