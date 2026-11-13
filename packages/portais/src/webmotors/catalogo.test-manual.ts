// Resolução do catálogo da Webmotors. Rodar com: npx tsx packages/portais/src/webmotors/catalogo.test-manual.ts
import { catalogoCompleto, novosCatalogos, resolverCatalogo } from "./catalogo";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const chamadas: string[] = [];
const sessao = {
  async marcas() { chamadas.push("marcas"); return [{ codigo: "21", nome: "FIAT" }, { codigo: "60", nome: "VOLKSWAGEN" }, { codigo: "23", nome: "CHEVROLET" }]; },
  async modelos(m: string) { chamadas.push("modelos " + m); return m === "21" ? [{ codigo: "100", nome: "ARGO" }, { codigo: "101", nome: "MOBI" }, { codigo: "102", nome: "ARGO TREKKING" }] : []; },
  async versoes(m: string) { chamadas.push("versoes " + m); return m === "100" ? [
    { codigo: "1", nome: "1.0 FIREFLY FLEX DRIVE MANUAL", anos: [2021, 2022] },
    { codigo: "2", nome: "1.3 FIREFLY FLEX DRIVE MANUAL", anos: [2021] },
    { codigo: "3", nome: "1.0 FIREFLY FLEX DRIVE MANUAL", anos: [2023] },
  ] : []; },
  async cores() { chamadas.push("cores"); return [{ codigo: "10", nome: "Branco" }, { codigo: "11", nome: "Prata" }, { codigo: "12", nome: "Preto" }]; },
  async cambios() { chamadas.push("cambios"); return [{ codigo: "1", nome: "Manual" }, { codigo: "2", nome: "Automático" }, { codigo: "3", nome: "CVT" }]; },
  async combustiveis() { chamadas.push("combustiveis"); return [{ codigo: "5", nome: "Flex" }, { codigo: "6", nome: "Gasolina" }, { codigo: "7", nome: "Diesel" }]; },
  async opcionais() { chamadas.push("opcionais"); return [{ codigo: "50", nome: "Ar condicionado" }, { codigo: "51", nome: "Direção hidráulica" }, { codigo: "52", nome: "Vidros elétricos" }]; },
};
const carro = { marca: "Fiat", modelo: "Argo", versao: "1.0 FIREFLY FLEX DRIVE MANUAL", anoModelo: 2021, cor: "Branco", cambio: "Manual", combustivel: "Flex", opcionais: ["Ar condicionado", "Vidros elétricos, Alarme", "Teto solar"] };

async function main() {
  const cache = novosCatalogos();
  const r = await resolverCatalogo(sessao, carro, cache);
  checa("tudo identificado, sem pendência", [r.pendencias, catalogoCompleto(r.catalogo)], [[], true]);
  checa("códigos", [r.catalogo.marca, r.catalogo.modelo, r.catalogo.versao, r.catalogo.cor, r.catalogo.cambio, r.catalogo.combustivel], ["21", "100", "1", "10", "1", "5"]);
  checa("opcionais reconhecidos (os que a Webmotors não tem ficam de fora)", r.catalogo.opcionais, [50, 52]);

  // A versão certa pelo ano: o mesmo nome existe em anos diferentes.
  const r23 = await resolverCatalogo(sessao, { ...carro, anoModelo: 2023 }, cache);
  checa("versão escolhida pelo ano do modelo", r23.catalogo.versao, "3");
  const r22 = await resolverCatalogo(sessao, { ...carro, anoModelo: 2022 }, cache);
  checa("versão do ano 2022", r22.catalogo.versao, "1");

  // Cache: segunda resolução não refaz as chamadas de catálogo.
  const antes = chamadas.length;
  await resolverCatalogo(sessao, carro, cache);
  checa("catálogos em cache no ciclo", chamadas.length, antes);

  const rMobi = await resolverCatalogo(sessao, { ...carro, modelo: "Mobi", versao: "XYZ" }, cache);
  checa("modelo achado, versão não: pendência", [rMobi.catalogo.modelo, rMobi.catalogo.versao, rMobi.pendencias.length], ["101", undefined, 1]);
  const rSem = await resolverCatalogo(sessao, { ...carro, marca: "Ferrari" }, cache);
  checa("marca desconhecida", [rSem.pendencias[0], catalogoCompleto(rSem.catalogo)], ['Marca "Ferrari" não identificada no catálogo da Webmotors', false]);
  const rAuto = await resolverCatalogo(sessao, { ...carro, cambio: "Automático CVT", cor: "Cinza" }, cache);
  checa("cor que não existe no catálogo fica vazia (não trava a marca)", [rAuto.catalogo.cor, catalogoCompleto(rAuto.catalogo)], ["", false]);
  checa("modelo 'ARGO' não vira 'ARGO TREKKING'", (await resolverCatalogo(sessao, carro, cache)).catalogo.modelo, "100");
  checa("alias de combustível: Etanol → Álcool", (await resolverCatalogo({ ...sessao, combustiveis: async () => [{ codigo: "9", nome: "Álcool" }, { codigo: "5", nome: "Flex" }] }, { ...carro, combustivel: "Etanol" }, novosCatalogos())).catalogo.combustivel, "9");
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main();
