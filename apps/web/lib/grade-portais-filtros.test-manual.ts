// Busca, filtros e ordenação da grade de anúncios. Puro: sem banco.
// Rodar com: npx tsx --tsconfig tsconfig.json lib/grade-portais-filtros.test-manual.ts
import { classeDosDias, contagemPorFiltro, filtrarEOrdenar, type CarroDaGrade } from "./grade-portais-filtros";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const ok = (s = "PUBLICADO") => ({ ativo: true, status: s, url: null, erro: s === "ERRO" ? "recusado" : null, plano: null });
const carro = (id: string, nome: string, extra: Partial<CarroDaGrade> = {}): CarroDaGrade => ({
  id, nome, versao: null, anoModelo: 2020, placa: null, status: "DISPONIVEL", naVitrine: true, dias: 10, precoCents: 5_000_000, precoClassificadosCents: null, km: 50000, semKm: false, capaId: "f", totalFotos: 5,
  anuncios: { WEBMOTORS: ok(), NAPISTA: ok() }, ...extra,
});
const lista = [
  carro("1", "Chevrolet Classic 2014/2015", { placa: "OTU-5D85", versao: "1.0 MPFI LS 8V FLEX 4P MANUAL", dias: 83, precoCents: 3_599_999 }),
  carro("2", "Chevrolet Cobalt 2012/2013", { placa: "LLT-2A17", dias: 35, anuncios: { WEBMOTORS: null, NAPISTA: null }, semKm: true }),
  carro("3", "Citroën C3 2015/2016", { placa: "LSE-3604", dias: 367, precoCents: 4_499_999, anuncios: { WEBMOTORS: ok(), NAPISTA: ok("ERRO") }, totalFotos: 0 }),
  carro("4", "Fiat Mobi 2018/2018", { status: "RESERVADO", dias: 5, anuncios: { WEBMOTORS: ok(), NAPISTA: ok() } }),
];
const portais = ["WEBMOTORS", "NAPISTA"];
const ids = (l: CarroDaGrade[]) => l.map((c) => c.id);
const f = (filtro: Parameters<typeof filtrarEOrdenar>[2]["filtro"], extra: object = {}) => ids(filtrarEOrdenar(lista, portais, { termo: "", filtro, portal: "todos", ordem: "maisTempo", ...extra }));

checa("busca por modelo sem acento ('citroen')", ids(filtrarEOrdenar(lista, portais, { termo: "citroen", filtro: "todos", portal: "todos", ordem: "nome" })), ["3"]);
checa("busca pela placa com ou sem hífen", [ids(filtrarEOrdenar(lista, portais, { termo: "otu5d85", filtro: "todos", portal: "todos", ordem: "nome" })), ids(filtrarEOrdenar(lista, portais, { termo: "OTU-5D", filtro: "todos", portal: "todos", ordem: "nome" }))], [["1"], ["1"]]);
checa("busca pela versão", ids(filtrarEOrdenar(lista, portais, { termo: "mpfi", filtro: "todos", portal: "todos", ordem: "nome" })), ["1"]);
checa("faltando em portal: só o à venda sem anúncio (o reservado não conta)", f("faltando"), ["2"]);
checa("faltando no NaPista escolhido", f("faltando", { portal: "NAPISTA" }), ["2"]);
checa("com erro (qualquer portal)", f("erro"), ["3"]);
checa("com erro no Webmotors escolhido: nenhum", f("erro", { portal: "WEBMOTORS" }), []);
checa("sem km", f("semKm"), ["2"]);
checa("sem foto", f("semFoto"), ["3"]);
checa("parados +60 dias", f("parados"), ["3", "1"]);
checa("reservados", f("reservados"), ["4"]);
checa("ordem padrão: mais tempo no pátio primeiro", f("todos"), ["3", "1", "2", "4"]);
checa("ordem por maior preço (empate pelo nome)", ids(filtrarEOrdenar(lista, portais, { termo: "", filtro: "todos", portal: "todos", ordem: "maiorPreco" })), ["2", "4", "3", "1"]);
checa("ordem por menor preço começa pelo mais barato", ids(filtrarEOrdenar(lista, portais, { termo: "", filtro: "todos", portal: "todos", ordem: "menorPreco" }))[0], "1");
checa("ordem por placa", ids(filtrarEOrdenar(lista, portais, { termo: "", filtro: "todos", portal: "todos", ordem: "placa" })), ["2", "3", "1", "4"]);
const c = contagemPorFiltro(lista, portais, "", "todos");
checa("contagem por filtro", [c.todos, c.faltando, c.erro, c.semKm, c.semFoto, c.parados, c.reservados], [4, 1, 1, 1, 1, 2, 1]);
checa("faixas de dias", [classeDosDias(30), classeDosDias(61), classeDosDias(91)], ["normal", "atencao", "parado"]);

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
