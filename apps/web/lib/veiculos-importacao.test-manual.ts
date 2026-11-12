// Leitura da planilha de estoque. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/veiculos-importacao.test-manual.ts
import { lerCsv } from "@dilon-zap/sdr-core";
import { MODELO_CSV, lerAnos, lerData, lerFotos, lerKm, lerPlanilha, mapearColunas } from "./veiculos-importacao";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const agora = new Date("2026-11-12T12:00:00Z");

checa("ano duplo", lerAnos("2022/2023", agora), [2022, 2023]);
checa("ano curto", lerAnos("22/23", agora), [2022, 2023]);
checa("ano único", lerAnos("2023", agora), [2023, 2023]);
checa("modelo antes da fabricação", lerAnos("2023/2022", agora), null);
checa("ano no futuro distante", lerAnos("2031", agora), null);
checa("km com texto", lerKm("28.500 km"), 28500);
checa("data br", lerData("05/10/2026")?.toISOString(), "2026-10-05T12:00:00.000Z");
checa("data inexistente", lerData("31/02/2026"), null);
checa("fotos separadas e repetidas", lerFotos("https://a.com/1.jpg | https://a.com/2.jpg;https://a.com/1.jpg ftp://x"), ["https://a.com/1.jpg", "https://a.com/2.jpg"]);

const { mapa, ignoradas } = mapearColunas(["MARCA", "Modelo", "Ano Fab.", "Ano Modelo", "Quilometragem", "Valor de Venda", "Vendedor"]);
checa("cabeçalhos por apelido", mapa, { marca: 0, modelo: 1, anoFabricacao: 2, anoModelo: 3, km: 4, preco: 5 });
checa("coluna desconhecida listada", ignoradas, ["Vendedor"]);

const modelo = lerCsv(MODELO_CSV);
const lido = lerPlanilha(modelo.cabecalho, modelo.linhas, agora);
checa("modelo: duas linhas válidas", lido.linhas.length, 2);
checa("modelo: sem erros", lido.erros, []);
const polo = lido.linhas[0];
checa("polo", [polo.marca, polo.anoFabricacao, polo.anoModelo, polo.km, polo.placa, polo.precoCents, polo.custoCents, polo.fotos.length, polo.opcionais], [
  "Volkswagen",
  2022,
  2023,
  28500,
  "QWE1R23",
  9290000,
  7800000,
  2,
  ["Ar-condicionado", "Multimídia"],
]);
checa("onix sem custo nem placa", [lido.linhas[1].custoCents, lido.linhas[1].placa], [null, null]);

const ruim = lerCsv(
  [
    "Marca,Modelo,Ano,KM,Preço,Placa",
    "Fiat,Uno,2015,99000,29900,ABC1234",
    ",Gol,2015,1,1,",
    "Fiat,Palio,dois mil,1,1,",
    "Fiat,Argo,2020,50000,,",
    "Fiat,Mobi,2020,50000,40000,abc-1234",
    "Fiat,Toro,2020,50000,40000,XX1",
  ].join("\n")
);
const r = lerPlanilha(ruim.cabecalho, ruim.linhas, agora);
checa("só a primeira entra", r.linhas.map((l) => l.modelo), ["Uno"]);
checa(
  "erros com número da linha",
  r.erros.map((e) => [e.numero, e.erro]),
  [
    [3, "sem marca"],
    [4, 'ano inválido ou ausente ("dois mil")'],
    [5, 'preço inválido ou ausente ("")'],
    [6, "placa ABC1234 repetida (já está na linha 2)"],
    [7, 'placa inválida ("XX1")'],
  ]
);
checa("sem coluna de preço não começa", lerPlanilha(["Marca", "Modelo", "Ano", "KM"], [], agora).faltando, ["Preço"]);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
