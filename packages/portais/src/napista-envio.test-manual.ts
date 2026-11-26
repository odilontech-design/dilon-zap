// Tolerâncias do envio ao NaPista (limite de fotos e equipamentos). Sem rede e sem banco.
// Rodar com: npx tsx packages/portais/src/napista-envio.test-manual.ts
import { ErroNapista, type OfertaNapista } from "./napista/cliente";
import { montarOfertaNapista } from "./napista/mapa";
import { comEquipamentosOpcionais, enderecoPublicoDoAnuncio, enviarFotosNapista, enxugarParaDiagnostico, novoEstadoDeFotos, resumoDaOferta } from "./napista/envio";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const cheio = () => new ErroNapista('O NaPista respondeu 412: {"message":"The maximum number of photos in this Offer has been reached!"}', 412);
const fotos = Array.from({ length: 20 }, (_, i) => `https://x/f${i}.jpg`);

async function principal() {
  // Como o NaPista: as fotos somam às do anúncio e o máximo é 12 por anúncio.
  const anuncio = { fotos: 0 };
  const chamadas: string[] = [];
  const sessao = {
    apagarFotos: async (_id: string) => { chamadas.push("apagar"); anuncio.fotos = 0; },
    fotosPorUrl: async (_id: string, urls: string[]) => { chamadas.push(`enviar ${urls.length}`); if (anuncio.fotos + urls.length > 12) throw cheio(); anuncio.fotos += urls.length; },
  };
  const estado = novoEstadoDeFotos();
  const r = await enviarFotosNapista(sessao, "o1", fotos, estado);
  checa("apaga antes de enviar e reduz em passos até caber (20 → 14 → 9)", chamadas, ["apagar", "enviar 20", "apagar", "enviar 14", "apagar", "enviar 9"]);
  checa("envia as que cabem e aprende o limite", [r.enviadas, anuncio.fotos, estado.limite], [9, 9, 9]);
  chamadas.length = 0;
  await enviarFotosNapista(sessao, "o1", fotos, estado);
  checa("de novo no mesmo anúncio: não empilha, apaga e põe as mesmas 9", [chamadas, anuncio.fotos], [["apagar", "enviar 9"], 9]);

  // Anúncio recém-criado não tem foto para apagar.
  chamadas.length = 0;
  anuncio.fotos = 0;
  await enviarFotosNapista(sessao, "o2", fotos.slice(0, 5), estado, true);
  checa("anúncio recém-criado: não chama apagar", chamadas, ["enviar 5"]);

  // Nem 5 fotos cabem: o erro sobe (não esconde o problema).
  const sempreCheio = { apagarFotos: async () => {}, fotosPorUrl: async () => { throw cheio(); } };
  let e412 = "";
  try { await enviarFotosNapista(sempreCheio, "o3", fotos, novoEstadoDeFotos()); } catch (e) { e412 = (e as Error).message; }
  checa("limite que não cede nem com poucas fotos: o erro aparece", /412/.test(e412), true);

  // Outro erro não é engolido.
  const fora = { apagarFotos: async () => {}, fotosPorUrl: async () => { throw new ErroNapista("O NaPista respondeu 500", 500); } };
  let erro = "";
  try { await enviarFotosNapista(fora, "o4", fotos, novoEstadoDeFotos()); } catch (e) { erro = (e as Error).message; }
  checa("erro que não é de limite continua subindo", erro, "O NaPista respondeu 500");

  // 400 com equipamentos: tenta de novo sem eles.
  const oferta: OfertaNapista = { versionId: "v", modelYear: 2016, manufacturedYear: 2016, mileage: 90000, price: 120000, fuelType: "DIESEL", color: "SILVER", transmissionType: "AUTOMATIC", equipments: ["CAR_2_4x4", "CAR_1_AIRBAG"], description: "texto longo" };
  const enviados: OfertaNapista[] = [];
  const ruim = (o: OfertaNapista) => { enviados.push(o); if (o.equipments?.length) throw new ErroNapista('O NaPista respondeu 400: {"detail":"Failed to read request"}', 400); return Promise.resolve("id1"); };
  const t = await comEquipamentosOpcionais(oferta, ruim);
  checa("400 com equipamentos: repete sem eles", [t.resultado, t.semEquipamentos, enviados.length, enviados[1].equipments], ["id1", true, 2, undefined]);
  const bom = await comEquipamentosOpcionais(oferta, async () => "ok");
  checa("sem erro: envia uma vez com tudo", [bom.resultado, bom.semEquipamentos], ["ok", false]);
  const semEquip: OfertaNapista = { ...oferta, equipments: undefined };
  let e400 = "";
  try { await comEquipamentosOpcionais(semEquip, async () => { throw new ErroNapista("O NaPista respondeu 400: x", 400); }); } catch (e) { e400 = (e as Error).message; }
  checa("400 sem equipamentos: o erro sobe (não há o que tirar)", e400, "O NaPista respondeu 400: x");

  // Cor, combustível, câmbio e equipamentos conferidos com a lista do NaPista.
  const atributos = {
    cores: [{ id: "SILVER", nome: "Prata" }, { id: "WINE", nome: "Vinho" }],
    combustiveis: [{ id: "DIESEL", nome: "Diesel" }, { id: "FLEX", nome: "Flex" }],
    cambios: [{ id: "MANUAL", nome: "Manual" }, { id: "AUTOMATIC", nome: "Automático" }],
    equipamentos: [{ id: "CAR_2_4X4", nome: "4x4" }, { id: "CAR_1_AIRBAG", nome: "Airbag" }],
  };
  const carro = { tipo: "CARRO", marca: "Mitsubishi", modelo: "Pajero Full", versao: "3.2 4P", anoFabricacao: 2016, anoModelo: 2016, km: 90000, kmInformado: true, cor: "Prata", combustivel: "Diesel", cambio: "Automático", portas: null, precoCents: 12_000_000, fotos: ["x"], opcionais: ["Tração 4x4, Airbag", "Teto solar"], placa: "KRP4E13", descricao: null } as never;
  const m = montarOfertaNapista(carro, "v1", atributos);
  checa("equipamento com maiúsculas diferentes vira o código do NaPista; o que não existe na lista sai", m.ok && m.oferta.equipments, ["CAR_2_4X4", "CAR_1_AIRBAG"]);
  const vinho = montarOfertaNapista({ ...(carro as object), cor: "Vinho" } as never, "v1", atributos);
  checa("cor pelo nome em português quando o nosso código não existe na lista", vinho.ok && vinho.oferta.color, "WINE");
  const roxo = montarOfertaNapista({ ...(carro as object), cor: "Roxo" } as never, "v1", atributos);
  checa("cor que o NaPista não tem: pendência clara", !roxo.ok && roxo.faltando.some((f) => /cor/i.test(f)), true);
  const semLista = montarOfertaNapista(carro, "v1", null);
  checa("sem a lista do NaPista, vale o nosso mapa como antes", semLista.ok && semLista.oferta.color, "SILVER");

  // O endereço público só vale se o NaPista o devolver; o endereço das fotos não conta.
  checa("acha o endereço público do anúncio num campo do NaPista", enderecoPublicoDoAnuncio({ id: "x", links: { site: "https://www.napista.com.br/anuncios/abc" } }), "https://www.napista.com.br/anuncios/abc");
  checa("ignora o endereço das fotos e devolve nulo sem endereço", enderecoPublicoDoAnuncio({ photos: [{ url: "https://marketplace.development.bvia.zflow.com.br/static/photos/x" }], title: "Fiat Argo" }), null);

  const dg = enxugarParaDiagnostico({ id: "x", description: "a".repeat(500), numeroPublico: 17122550, photos: [1, 2, 3, 4, 5].map((n) => ({ url: `https://f/${n}` })) }) as any;
  checa("diagnóstico: corta texto longo, mantém o número e encurta lista de fotos", [dg.description.length < 200, dg.numeroPublico, dg.photos.length, dg.photos[3]], [true, 17122550, 4, "(+2 itens)"]);

  const resumo = resumoDaOferta(oferta);
  checa("resumo do que foi enviado não leva o texto longo", [resumo.includes("DIESEL"), resumo.includes("texto longo")], [true, false]);
}

principal().then(() => {
  if (falhas) {
    console.log(`\n${falhas} falha(s)`);
    process.exit(1);
  }
  console.log("\ntudo certo");
});
