// Tolerâncias do envio ao NaPista (limite de fotos e equipamentos). Sem rede e sem banco.
// Rodar com: npx tsx packages/portais/src/napista-envio.test-manual.ts
import { ErroNapista, type OfertaNapista } from "./napista/cliente";
import { comEquipamentosOpcionais, enviarFotosNapista, novoEstadoDeFotos, resumoDaOferta } from "./napista/envio";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const cheio = () => new ErroNapista('O NaPista respondeu 412: {"message":"The maximum number of photos in this Offer has been reached!"}', 412);
const fotos = Array.from({ length: 20 }, (_, i) => `https://x/f${i}.jpg`);

async function principal() {
  // O NaPista aceita no máximo 12 fotos.
  const chamadas: number[] = [];
  const sessao = { fotosPorUrl: async (_id: string, urls: string[]) => { chamadas.push(urls.length); if (urls.length > 12) throw cheio(); } };
  const estado = novoEstadoDeFotos();
  const r = await enviarFotosNapista(sessao, "o1", fotos, estado);
  checa("reduz em passos até caber (20 → 14 → 9)", chamadas, [20, 14, 9]);
  checa("envia as que cabem e aprende o limite", [r.enviadas, r.cheio, estado.limite], [9, false, 9]);
  const r2 = await enviarFotosNapista(sessao, "o2", fotos, estado);
  checa("o próximo carro já começa no limite aprendido", [r2.enviadas, chamadas[chamadas.length - 1]], [9, 9]);

  // Anúncio adotado que já está cheio: nem 5 fotos entram; segue com as que ele tem.
  const sempreCheio = { fotosPorUrl: async () => { throw cheio(); } };
  const r3 = await enviarFotosNapista(sempreCheio, "o3", fotos, novoEstadoDeFotos());
  checa("anúncio já cheio: mantém as fotos que tem", [r3.enviadas, r3.cheio], [0, true]);

  // Outro erro não é engolido.
  const fora = { fotosPorUrl: async () => { throw new ErroNapista("O NaPista respondeu 500", 500); } };
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
