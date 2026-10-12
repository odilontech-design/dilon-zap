// Qualificação do autocadastro: plano sugerido e validação das opções. Puro.
// Rodar com: npx tsx apps/web/lib/qualificacao.test-manual.ts
import { planoSugerido, ehFaixa, ehRamo, rotuloFaixa } from "./qualificacao";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// O plano sugerido tem que COMPORTAR a equipe (Essencial 3, Profissional 8).
checa("só eu → Essencial", planoSugerido("SO_EU"), "ESSENCIAL");
checa("2 ou 3 → Essencial (cabe no teto de 3)", planoSugerido("2_3"), "ESSENCIAL");
checa("4 a 8 → Profissional", planoSugerido("4_8"), "PROFISSIONAL");
checa("9 ou mais → Escala", planoSugerido("9_MAIS"), "ESCALA");
checa("cadastro antigo sem faixa → Essencial (padrão de antes)", planoSugerido(null), "ESSENCIAL");
checa("valor desconhecido → Essencial, nunca um plano maior", planoSugerido("100"), "ESSENCIAL");

checa("faixa válida", ehFaixa("4_8"), true);
checa("faixa inventada não passa", ehFaixa("10_20"), false);
checa("ramo da lista", ehRamo("Turismo"), true);
checa("ramo fora da lista não passa", ehRamo("<script>"), false);
checa("rótulo da faixa", rotuloFaixa("SO_EU"), "Só eu");
checa("rótulo de faixa ausente", rotuloFaixa(undefined), null);

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo ok");
process.exit(falhas ? 1 : 0);
