// Configuração da medição de anúncios: só IDs bem formados chegam à página.
// Rodar com: npx tsx apps/web/lib/rastreamento.test-manual.ts
import { configRastreamento } from "./rastreamento";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
function com(env: Record<string, string | undefined>) {
  for (const k of ["META_PIXEL_ID", "GOOGLE_ADS_ID", "GOOGLE_ADS_ROTULO_CADASTRO"]) delete process.env[k];
  Object.assign(process.env, env);
  return configRastreamento();
}

checa("sem variável, nada carrega (white-label)", com({}), { metaPixelId: null, googleAdsId: null, googleAdsRotuloCadastro: null });
checa("IDs válidos passam", com({ META_PIXEL_ID: "1234567890123456", GOOGLE_ADS_ID: "AW-8510152467", GOOGLE_ADS_ROTULO_CADASTRO: "AbC_dEf123" }), {
  metaPixelId: "1234567890123456", googleAdsId: "AW-8510152467", googleAdsRotuloCadastro: "AbC_dEf123",
});
checa("espaço em volta é tolerado", com({ META_PIXEL_ID: " 1234567890123456 " }).metaPixelId, "1234567890123456");
checa("pixel com letra/aspas é recusado (vai pra dentro de script)", com({ META_PIXEL_ID: "123');alert(1);//" }).metaPixelId, null);
checa("Google sem o prefixo AW- é recusado", com({ GOOGLE_ADS_ID: "8510152467" }).googleAdsId, null);
checa("rótulo com caractere de script é recusado", com({ GOOGLE_ADS_ROTULO_CADASTRO: "a'b" }).googleAdsRotuloCadastro, null);

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo ok");
process.exit(falhas ? 1 : 0);
