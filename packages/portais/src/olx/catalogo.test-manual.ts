// Sugestão do catálogo da OLX. Rodar com: npx tsx packages/portais/src/olx/catalogo.test-manual.ts
import { escolhaSegura, sugerir } from "./catalogo";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const marcas = { AUDI: 6, "VW - VOLKSWAGEN": 60, "GM - CHEVROLET": 23, FIAT: 21, "MERCEDES-BENZ": 39, HONDA: 28 };
checa("volkswagen → VW", sugerir("Volkswagen", marcas)[0]?.id, "60");
checa("chevrolet → GM", sugerir("Chevrolet", marcas)[0]?.id, "23");
checa("fiat exato", escolhaSegura(sugerir("Fiat", marcas))?.id, "21");
checa("mercedes com hífen", sugerir("Mercedes-Benz", marcas)[0]?.id, "39");
const modelos = { GOL: 1, "GOL SPECIAL": 2, POLO: 3, "POLO SEDAN": 4, "T-CROSS": 5 };
checa("polo não pega o sedan", escolhaSegura(sugerir("Polo", modelos))?.id, "3");
checa("t-cross", sugerir("T Cross", modelos)[0]?.id, "5");
const versoes = { "1.0 200 TSI COMFORTLINE (AUT)": 10, "1.0 TSI HIGHLINE": 11, "1.6 MSI": 12, "GTS 1.4 TSI": 13 };
checa("versão por palavras", sugerir("TSI 1.0 Highline", versoes)[0]?.id, "11");
checa("versão ambígua não escolhe sozinha", escolhaSegura(sugerir("1.0 TSI", versoes)), null);
checa("sem texto lista tudo", sugerir(null, versoes).length, 4);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
