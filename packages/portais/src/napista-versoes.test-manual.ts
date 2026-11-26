// Escolha de versão do NaPista: ordem das opções e lista por carro. Sem rede e sem banco.
// Rodar com: npx tsx packages/portais/src/napista-versoes.test-manual.ts
import { novosCatalogosNapista, ordenarVersoesNapista, versoesDoCarroNapista } from "./napista/catalogo";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// A versão da ficha (importada do site) e a do catálogo escrevem diferente.
const duster = [
  { id: "v1", nome: "1.6 16V Flex Expression Manual" },
  { id: "v2", nome: "1.6 16V Flex Dynamique X-Tronic" },
  { id: "v3", nome: "2.0 16V Flex Dynamique Manual" },
  { id: "v4", nome: "1.6 16V Flex Iconic X-Tronic" },
];
const o = ordenarVersoesNapista("1.6 16V SCE FLEX DYNAMIQUE X-TRONIC", duster);
checa("a mais parecida vem primeiro", o[0].id, "v2");
checa("nota boa o bastante para vir marcada", o[0].nota >= 0.5, true);
checa("todas as versões aparecem na lista", o.length, 4);
checa("ficha sem versão: ordem alfabética e nota 0", ordenarVersoesNapista(null, duster).map((x) => x.nota), [0, 0, 0, 0]);
const gol = ordenarVersoesNapista("1.6 MI POWER 8V FLEX 4P MANUAL G.V", [{ id: "g1", nome: "1.0 Mi Total Flex 8V 4p" }, { id: "g2", nome: "1.6 Mi Power Total Flex 8V 4p" }]);
checa("Gol: pega a 1.6 Power", gol[0].id, "g2");

async function principal() {
  // Uma sessão falsa do catálogo, contando as chamadas (o cache deve evitar repetir).
  const chamadas: string[] = [];
  const sessao = {
    async marcas() { chamadas.push("marcas"); return [{ id: "m-renault", nome: "Renault" }, { id: "m-fiat", nome: "Fiat" }]; },
    async modelos(marca: string, ano?: number) { chamadas.push(`modelos ${marca} ${ano}`); return marca === "m-renault" ? [{ id: "md-duster", nome: "Duster" }] : [{ id: "md-argo", nome: "Argo" }]; },
    async versoes(modelo: string, ano?: number) { chamadas.push(`versoes ${modelo} ${ano}`); return modelo === "md-duster" ? duster : []; },
  };
  const cache = novosCatalogosNapista();
  const a = await versoesDoCarroNapista(sessao, { marca: "Renault", modelo: "DUSTER", anoModelo: 2020 }, cache);
  checa("carro reconhecido lista as versões", a.estado === "ok" && a.versoes.length, 4);
  await versoesDoCarroNapista(sessao, { marca: "Renault", modelo: "Duster", anoModelo: 2020 }, cache);
  checa("o cache evita repetir chamadas ao catálogo", chamadas.length, 3);
  const b = await versoesDoCarroNapista(sessao, { marca: "Marca Inexistente", modelo: "X", anoModelo: 2020 }, cache);
  checa("marca desconhecida explica o motivo", b.estado === "sem-marca" && /não identificada/.test(b.mensagem), true);
  const c = await versoesDoCarroNapista(sessao, { marca: "Renault", modelo: "Modelo Que Nao Existe", anoModelo: 2020 }, cache);
  checa("modelo desconhecido explica o motivo", c.estado === "sem-modelo" && /Modelo/.test(c.mensagem), true);

}

principal().then(() => {
  if (falhas) {
    console.log(`\n${falhas} falha(s)`);
    process.exit(1);
  }
  console.log("\ntudo certo");
});
