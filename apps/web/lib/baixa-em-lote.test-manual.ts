// Regras da baixa em lote dos carros que saíram do site. Puro: sem banco.
// Rodar com: npx tsx --tsconfig tsconfig.json lib/baixa-em-lote.test-manual.ts
import { motivoSemBaixaEmLote } from "./espelho-do-site";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const sumiu = new Date("2026-11-25T12:00:00Z");

checa("à venda, compra própria, saiu do site: pode", motivoSemBaixaEmLote({ status: "DISPONIVEL", origem: "COMPRA", sumiuDoSiteEm: sumiu }), null);
checa("em preparação: pode", motivoSemBaixaEmLote({ status: "PREPARACAO", origem: "TROCA", sumiuDoSiteEm: sumiu }), null);
checa("reservado: não (tem sinal e cliente)", /reservado/.test(motivoSemBaixaEmLote({ status: "RESERVADO", origem: "COMPRA", sumiuDoSiteEm: sumiu }) ?? ""), true);
checa("consignado: não (repasse ao dono)", /repasse/.test(motivoSemBaixaEmLote({ status: "DISPONIVEL", origem: "CONSIGNACAO", sumiuDoSiteEm: sumiu }) ?? ""), true);
checa("já vendido: não", motivoSemBaixaEmLote({ status: "VENDIDO", origem: "COMPRA", sumiuDoSiteEm: sumiu }), "já saiu do estoque");
checa("não saiu do site: não", motivoSemBaixaEmLote({ status: "DISPONIVEL", origem: "COMPRA", sumiuDoSiteEm: null }), "não está marcado como fora do site");
checa("data como texto (vinda da API) também vale", motivoSemBaixaEmLote({ status: "DISPONIVEL", origem: "COMPRA", sumiuDoSiteEm: "2026-11-25T12:00:00Z" }), null);

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
