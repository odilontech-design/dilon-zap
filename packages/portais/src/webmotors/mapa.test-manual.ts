// Mapa ficha → anúncio da Webmotors. Rodar com: npx tsx packages/portais/src/webmotors/mapa.test-manual.ts
import { anuncioXml } from "./cliente";
import { montarAnuncioWebmotors, portasDoCarro, type CatalogoWebmotors } from "./mapa";
import type { CarroParaPortal } from "../olx/mapa";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const carro: CarroParaPortal = {
  id: "c1", tipo: "CARRO", placa: "rmo-1h85", chassi: null, renavam: null, marca: "Fiat", modelo: "Argo", versao: "1.0 FIREFLY FLEX DRIVE MANUAL 4P",
  anoFabricacao: 2021, anoModelo: 2021, km: 31000, kmInformado: true, cor: "Branco", combustivel: "Flex", cambio: "Manual", portas: null, opcionais: [],
  precoCents: 5_599_999, descricao: "  Único dono,\n revisado.  ", fotos: ["https://x/1.jpg"],
};
const cat: CatalogoWebmotors = { marca: "21", modelo: "189", versao: "311168", cor: "30409", cambio: "1", combustivel: "3", opcionais: [5, 9] };

checa("portas: da ficha", portasDoCarro({ portas: 2, versao: null, modelo: "X" }), 2);
checa("portas: do nome da versão (4P)", portasDoCarro({ portas: null, versao: "1.0 MPFI LS 8V FLEX 4P MANUAL", modelo: "Classic" }), 4);
checa("portas: 2P no modelo", portasDoCarro({ portas: null, versao: null, modelo: "Saveiro 1.6 CD 2P" }), 2);
checa("portas: desconhecido", portasDoCarro({ portas: null, versao: "1.0 TSI", modelo: "Polo" }), null);

const r = montarAnuncioWebmotors(carro, cat, "189", 0);
if (!r.ok) throw new Error(r.faltando.join("; "));
const a = r.anuncio;
checa("códigos do catálogo", [a.CodigoMarca, a.CodigoModelo, a.CodigoVersao, a.CodigoCor, a.CodigoCambio, a.CodigoCombustivel], [21, 189, 311168, "30409", "1", "3"]);
checa("modalidade e tipo usado", [a.CodigoModalidade, a.TipoAnuncio], [189, "U"]);
checa("preço real e de venda iguais", [a.PrecoReal, a.PrecoVenda], [55999.99, 55999.99]);
checa("placa normalizada", a.Placa, "RMO1H85");
checa("km e anos", [a.Km, a.AnoDoModelo, a.AnoFabricacao], [31000, 2021, 2021]);
checa("portas pela versão", a.NrPortas, 4);
checa("observação limpa", a.Observacao, "Único dono, revisado.");
checa("opcionais por código", a.Opcionais, [5, 9]);

const xml = anuncioXml(a);
const ordem = ["CodigoAnuncio", "CodigoModalidade", "TipoAnuncio", "CodigoMarca", "CodigoModelo", "CodigoVersao", "AnoDoModelo", "AnoFabricacao", "Km", "Placa", "CodigoCambio", "NrPortas", "CodigoCor", "CodigoCombustivel", "PrecoReal", "PrecoVenda", "Observacao", "Opcional"];
const posicoes = ordem.map((n) => xml.indexOf(`<${n}>`));
checa("XML na ordem do esquema (o ASMX exige)", [posicoes.every((p) => p >= 0), posicoes.every((p, i) => i === 0 || p > posicoes[i - 1])], [true, true]);
checa("decimal com ponto", xml.includes("<PrecoVenda>55999.99</PrecoVenda>"), true);
checa("opcional no formato do esquema", xml.includes("<Opcional><OpcionalWM><CodigoOpcional>5</CodigoOpcional></OpcionalWM>"), true);
checa("texto escapado", anuncioXml({ ...a, Observacao: "A&B <novo>" }).includes("<Observacao>A&amp;B &lt;novo&gt;</Observacao>"), true);

// A regra da gestão: sem km, não publica.
const semKm = montarAnuncioWebmotors({ ...carro, km: 0, kmInformado: false }, cat, "189");
checa("sem km informada: não publica", semKm.ok ? [] : semKm.faltando, ["Informar a quilometragem do carro (a Webmotors exige a km)"]);
checa("zero km informado de verdade: publica", montarAnuncioWebmotors({ ...carro, km: 0, kmInformado: true }, cat, "189").ok, true);
checa("ficha antiga (sem o campo) conta como informada", montarAnuncioWebmotors({ ...carro, kmInformado: undefined }, cat, "189").ok, true);

const tudo = montarAnuncioWebmotors({ ...carro, fotos: [], precoCents: 0, portas: null, versao: "1.0" }, { ...cat, cor: "", cambio: "" }, null);
checa("lista tudo que falta", tudo.ok ? 0 : tudo.faltando.length, 6);
checa("sem catálogo", (montarAnuncioWebmotors(carro, null, "189") as any).faltando.includes("Escolher marca, modelo e versão no catálogo da Webmotors"), true);
checa("moto ainda não", montarAnuncioWebmotors({ ...carro, tipo: "MOTO" }, cat, "189").ok, false);
checa("descrição longa é cortada", (montarAnuncioWebmotors({ ...carro, descricao: "x".repeat(3000) }, cat, "189") as any).anuncio.Observacao.length, 1000);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
