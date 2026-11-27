import assert from "node:assert/strict";
import { montarCardDoStory } from "./story-card";

const base = { marca: "Fiat", modelo: "Argo", versao: " 1.0 Drive ", anoFabricacao: 2021, anoModelo: 2022, km: 31000, kmInformado: true, zeroKm: false, ocultarKm: false, ocultarPreco: false, precoCents: 5_599_900, cambio: "Manual", combustivel: "Flex", cor: "Branco" };
const loja = { nome: "Sales Automóveis" };
const ok = (nome: string) => console.log(`ok    ${nome}`);

const c = montarCardDoStory(base, loja, "https://x.com/c/1");
assert.deepEqual([c.titulo, c.versao, c.ano, c.km, c.preco?.replace(/\u00a0/g, " "), c.detalhes, c.link, c.loja], ["Fiat Argo", "1.0 Drive", "2021/2022", "31.000 km", "R$ 55.999,00", ["Manual", "Flex", "Branco"], "https://x.com/c/1", "Sales Automóveis"]);
ok("carro comum: título, ano fab/modelo, km, preço e detalhes");
assert.equal(montarCardDoStory({ ...base, anoFabricacao: 2022 }, loja, null).ano, "2022");
ok("ano igual aparece uma vez só");
assert.equal(montarCardDoStory({ ...base, ocultarPreco: true }, loja, null).preco, null);
assert.equal(montarCardDoStory(base, { ...loja, ocultarPrecoNoSite: true }, null).preco, null);
assert.equal(montarCardDoStory({ ...base, precoCents: 0 }, loja, null).preco, null);
ok("preço escondido no carro, na loja ou sem preço: sob consulta (null)");
assert.equal(montarCardDoStory({ ...base, ocultarKm: true }, loja, null).km, null);
assert.equal(montarCardDoStory(base, { ...loja, ocultarKmNoSite: true }, null).km, null);
assert.equal(montarCardDoStory({ ...base, kmInformado: false, km: 0 }, loja, null).km, null);
ok("km escondida ou não informada: não aparece");
assert.equal(montarCardDoStory({ ...base, zeroKm: true, km: 0 }, loja, null).km, "0 km");
ok("0 km de verdade aparece");
assert.deepEqual(montarCardDoStory({ ...base, cambio: null, cor: "  " }, loja, null).detalhes, ["Flex"]);
ok("detalhes vazios somem");
console.log("\ntudo certo");
