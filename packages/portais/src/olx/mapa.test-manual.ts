// Mapa ficha → anúncio da OLX. Rodar com: npx tsx packages/portais/src/olx/mapa.test-manual.ts
import { idParaOlx, montarAnuncioOlx, opcionaisOlx, potencia, type CarroParaPortal } from "./mapa";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const carro: CarroParaPortal = {
  id: "cm3k9x2ab0001qwer5tyu7iop", tipo: "CARRO", placa: "qwe-1r23", chassi: null, renavam: null,
  marca: "Volkswagen", modelo: "Polo", versao: "TSI 1.0", anoFabricacao: 2022, anoModelo: 2023, km: 28500,
  cor: "Prata", combustivel: "Flex", cambio: "Manual", portas: 4,
  opcionais: ["Ar-condicionado, Multimídia", "Câmera de ré", "Rodas de liga leve"],
  precoCents: 9_290_050, descricao: "Único dono, revisões em dia.",
  fotos: ["https://f/1.jpg", "https://f/2.jpg", "https://f/1.jpg"],
};
const loja = { cep: "24.020-005", telefone: "+55 (21) 99399-9417" };
const cat = { marca: "60", modelo: "1205", versao: "33" };

const r = montarAnuncioOlx(carro, cat, loja);
if (!r.ok) throw new Error(r.faltando.join("; "));
const a = r.anuncio;
checa("id com até 19 caracteres", a.id.length <= 19 && /^[A-Za-z0-9_{}-]+$/.test(a.id), true);
checa("id estável", idParaOlx(carro.id), a.id);
checa("categoria carros", a.category, 2020);
checa("preço em reais inteiros", a.price, 92901);
checa("telefone sem DDI", a.phone, 21993999417);
checa("CEP só dígitos", a.zipcode, "24020005");
checa("fotos sem repetir", a.images, ["https://f/1.jpg", "https://f/2.jpg"]);
checa("placa maiúscula", a.params.vehicle_tag, "QWE1R23");
checa("ano modelo", a.params.regdate, "2023");
checa("km inteiro", a.params.mileage, 28500);
checa("flex = 3", a.params.fuel, "3");
checa("manual = 1", a.params.gearbox, "1");
checa("4 portas = 2", a.params.doors, "2");
checa("prata = 3", a.params.carcolor, "3");
checa("1.0 = 1", a.params.motorpower, "1");
checa("opcionais", a.params.car_features, ["1", "7", "9", "18"]);
checa("catálogo", [a.params.vehicle_brand, a.params.vehicle_model, a.params.vehicle_version], ["60", "1205", "33"]);
checa("descrição com opcionais", a.body.startsWith("Único dono") && a.body.includes("Opcionais:"), true);
checa("sem chassi/renavam vazios", "chassi" in a.params || "renavam" in a.params, false);

const vazio = montarAnuncioOlx({ ...carro, cor: null, combustivel: "GNV", cambio: null, portas: null, versao: null, opcionais: [] }, cat, loja);
checa("opcionais ausentes ficam de fora", vazio.ok && Object.keys(vazio.anuncio.params).sort(), ["mileage", "regdate", "vehicle_brand", "vehicle_model", "vehicle_tag", "vehicle_version"]);

const falta = montarAnuncioOlx({ ...carro, fotos: [], placa: null, precoCents: 0 }, null, { cep: "123", telefone: "9999" });
checa("lista tudo que falta", falta.ok ? [] : falta.faltando.length, 6);
const moto = montarAnuncioOlx({ ...carro, tipo: "MOTO" }, cat, loja);
checa("moto ainda não", moto.ok, false);

const semKm = montarAnuncioOlx({ ...carro, km: 0, kmInformado: false }, cat, loja);
checa("sem km informada: não publica na OLX", semKm.ok ? [] : semKm.faltando, ["Informar a quilometragem do carro (a OLX exige a km)"]);
checa("zero km informado de verdade: publica", montarAnuncioOlx({ ...carro, km: 0, kmInformado: true }, cat, loja).ok, true);

const antigo = montarAnuncioOlx({ ...carro, anoModelo: 1977 }, cat, loja);
checa("ano antigo em faixa", antigo.ok && antigo.anuncio.params.regdate, "1975");
const muitasFotos = montarAnuncioOlx({ ...carro, fotos: Array.from({ length: 30 }, (_, i) => `https://f/${i}.jpg`) }, cat, loja);
checa("no máximo 20 fotos", muitasFotos.ok && muitasFotos.anuncio.images.length, 20);

checa("potência 2.0", potencia("2.0 TSI Highline"), 10);
checa("potência 1.6", potencia("1.6 16V"), 6);
checa("potência pelo modelo", potencia(null, "HB20 1.0"), 1);
checa("sem potência", potencia("Highline"), undefined);
checa("couro e teto", opcionaisOlx(["Bancos de couro; Teto solar", "Piloto automático"]), ["11", "17", "19"]);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
