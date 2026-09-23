// Tradução do erro de conexão. Puro. Rodar com:
// npx tsx apps/web/lib/erro-conexao.test-manual.ts
import { explicarErroDeConexao } from "./erro-conexao";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
function comeca(nome: string, obtido: string | null, prefixo: string) {
  const ok = typeof obtido === "string" && obtido.startsWith(prefixo);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)})`}`);
}

console.log("— sem erro —");
checa("null continua null", explicarErroDeConexao(null), null);
checa("undefined vira null", explicarErroDeConexao(undefined), null);
checa("string vazia vira null", explicarErroDeConexao(""), null);

console.log("— o caso da Guttierres —");
comeca(
  "Stream Errored (conflict) vira recado de aparelho removido",
  explicarErroDeConexao("Stream Errored (conflict)"),
  "O WhatsApp do celular desconectou este aparelho."
);
comeca(
  "device_removed cru também",
  explicarErroDeConexao("conflict: device_removed"),
  "O WhatsApp do celular desconectou este aparelho."
);

console.log("— outros —");
comeca("logged out", explicarErroDeConexao("Connection Failure: Logged Out"), "A conexão com o WhatsApp foi encerrada.");
comeca("restart required", explicarErroDeConexao("Stream Errored (restart required)"), "O WhatsApp pediu pra reiniciar");
comeca("timeout", explicarErroDeConexao("Timed Out"), "A conexão com o WhatsApp demorou demais");
comeca("connection closed", explicarErroDeConexao("Connection Closed"), "A conexão com o WhatsApp caiu.");
checa("erro desconhecido aparece como veio", explicarErroDeConexao("Algo bem estranho"), "Algo bem estranho");

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
