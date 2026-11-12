// Custo da IA. Puro. Rodar com: npx tsx packages/vendedor-ia/src/custo.test-manual.ts
import { PRECOS, custoMensalReais, custoMicros, estimarCustoPorLead } from "./custo";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// US$ 4/MTok de entrada = 4 micro-dólares por token.
checa("1M tokens de entrada no Opus 5.5 = US$ 4", custoMicros({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5-5"), 4_000_000);
checa(
  "chamada mista no Opus 5.5",
  custoMicros({ input_tokens: 1000, cache_creation_input_tokens: 2000, cache_read_input_tokens: 3000, output_tokens: 400 }, "claude-opus-5-5"),
  1000 * 4 + 2000 * 5 + 3000 * 0.2 + 400 * 20
);
checa("escrita de cache é 1,25× a entrada", Object.values(PRECOS).every((p) => Math.abs(p.cacheEscrita - p.entrada * 1.25) < 1e-9), true);
checa("modelo desconhecido", (() => { try { custoMicros({ input_tokens: 1, output_tokens: 1 }, "x"); return "sem erro"; } catch (e) { return (e as Error).message; } })(), "modelo sem preço cadastrado: x");

// Caso montado à mão: 1 resposta, sempre ferramenta, sem acerto de cache.
const e = estimarCustoPorLead("claude-opus-5-5", {
  respostasPorLead: 1,
  fracaoComFerramenta: 1,
  tokensFixos: 1000,
  tokensHistorico: 100,
  tokensResultadoFerramenta: 500,
  tokensSaidaResposta: 200,
  tokensSaidaFerramenta: 50,
  acertoDeCacheEntreRespostas: 0,
});
checa("tokens do caso manual", e.tokens, { entrada: 550, cacheEscrita: 1100, cacheLeitura: 1100, saida: 250 });
checa("custo do caso manual", e.usdPorLead, (550 * 4 + 1100 * 5 + 1100 * 0.2 + 250 * 20) / 1e6);

const opus = estimarCustoPorLead("claude-opus-5-5");
const sonnet = estimarCustoPorLead("claude-sonnet-5-5");
const haiku = estimarCustoPorLead("claude-haiku-5-5");
checa("Sonnet custa metade do Opus (preços proporcionais, exceto a leitura de cache)", Math.abs(sonnet.usdPorLead / opus.usdPorLead - 0.5) < 0.01, true);
checa("Haiku bem abaixo", haiku.usdPorLead < sonnet.usdPorLead / 10, true);
checa("mais cache, mais barato", estimarCustoPorLead("claude-opus-5-5", { acertoDeCacheEntreRespostas: 1 }).usdPorLead < estimarCustoPorLead("claude-opus-5-5", { acertoDeCacheEntreRespostas: 0 }).usdPorLead, true);
checa("mensal em reais", custoMensalReais(0.1, 1000, 5.5), 550);

console.log("\nEstimativa com as premissas padrão (US$ por lead):");
for (const x of [opus, sonnet, haiku]) console.log(`  ${x.modelo.padEnd(18)} ${x.usdPorLead.toFixed(4)}  tokens ${JSON.stringify(x.tokens)}`);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
