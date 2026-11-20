// Planos da revenda. Puro. Rodar com: npx tsx apps/web/lib/veiculos-planos.test-manual.ts
import { ganhaMultiNumero, limiteDeCarros, limiteEfetivoDeLeads, mensagemPatioCheio, temCatalogoMeta, vagasNoPatio } from "./veiculos-planos";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

checa("limites da tabela", [limiteDeCarros("GARAGEM"), limiteDeCarros("REVENDA"), limiteDeCarros("REVENDA_MAIS")], [30, 70, 150]);
checa("sem plano: sem limite", [limiteDeCarros(null), vagasNoPatio(null, 999)], [null, null]);
checa("vagas", [vagasNoPatio("GARAGEM", 25), vagasNoPatio("GARAGEM", 30), vagasNoPatio("GARAGEM", 34)], [5, 0, 0]);
checa("catálogo do Facebook a partir do Revenda", [temCatalogoMeta("GARAGEM"), temCatalogoMeta("REVENDA"), temCatalogoMeta(null)], [false, true, true]);
checa("multi-número só no Revenda+ com veículos", [ganhaMultiNumero("REVENDA_MAIS", true, null), ganhaMultiNumero("REVENDA", true, null), ganhaMultiNumero("REVENDA_MAIS", false, null)], [true, false, false]);
checa("exceção do Super Admin vence", ganhaMultiNumero("REVENDA_MAIS", true, false), false);
checa("leads: o menor dos dois", [limiteEfetivoDeLeads(1000, 300), limiteEfetivoDeLeads(200, 300), limiteEfetivoDeLeads(500, null)], [300, 200, 500]);
checa("mensagem", mensagemPatioCheio("GARAGEM", 30).startsWith("o plano Garagem permite até 30 carros no estoque (hoje: 30)"), true);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
