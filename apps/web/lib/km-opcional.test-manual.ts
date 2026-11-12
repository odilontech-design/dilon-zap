// Quilometragem não informada nunca vira "0 km". Rodar de apps/web com: npx tsx lib/km-opcional.test-manual.ts
import { fichaParaCliente } from "@dilon-zap/vendedor-ia/src/ficha";
import { feedJson, feedMetaCsv, feedXml, type CarroDoFeed } from "./feeds-estoque";
import { carroParaJsonLd } from "../app/loja/[slug]/dados-estruturados";
import { resumo } from "../app/loja/[slug]/comum";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const carro = { marca: "Fiat", modelo: "Argo", versao: "1.0", anoFabricacao: 2022, anoModelo: 2023, km: 0, cor: "Branco", cambio: "Manual", combustivel: "Flex", opcionais: [], precoCents: 7_499_999, descricao: null, placa: "RMO1H85" };

const sem = fichaParaCliente({ ...carro, kmInformado: false });
checa("ficha do WhatsApp: sem a linha de km", [sem.includes("km"), sem.includes("0 km")], [false, false]);
checa("ficha do WhatsApp: com km informada", fichaParaCliente({ ...carro, km: 31000, kmInformado: true }).includes("📍 31.000 km"), true);
checa("ficha antiga (sem o campo) continua mostrando", fichaParaCliente({ ...carro, km: 12000 }).includes("12.000 km"), true);
checa("carro zero km de verdade (informado) mostra 0 km", fichaParaCliente({ ...carro, km: 0, kmInformado: true }).includes("📍 0 km"), true);

checa("resumo do card sem km", resumo({ km: 0, kmInformado: false, cambio: "Manual", combustivel: "Flex" }), "Manual · Flex");
checa("resumo do card com km", resumo({ km: 31000, kmInformado: true, cambio: "Manual", combustivel: "Flex" }), "31.000 km · Manual · Flex");

const ld = (kmInformado: boolean) => carroParaJsonLd({ ...carro, id: "x", tipo: "CARRO", status: "DISPONIVEL", kmInformado } as never, "https://x/c", []);
checa("dados estruturados do Google sem km não dizem 0", "mileageFromOdometer" in ld(false), false);
checa("dados estruturados com km", "mileageFromOdometer" in ld(true), true);

const feed = (km: number | null): CarroDoFeed => ({ id: "c1", marca: "Fiat", modelo: "Argo", versao: "1.0", anoFabricacao: 2022, anoModelo: 2023, km, cor: "Branco", combustivel: "Flex", cambio: "Manual", portas: 4, opcionais: [], precoCents: 7_499_999, descricao: null, status: "DISPONIVEL", diasEmEstoque: 10, url: "https://x/c1", fotos: [] });
const loja = { nome: "Loja", endereco: null };
const csv = feedMetaCsv(loja, [feed(null)]).split("\n")[1].split(",");
checa("CSV da Meta: km e unidade em branco", [csv[8], csv[9]], ["", ""]);
checa("CSV da Meta: com km", feedMetaCsv(loja, [feed(31000)]).split("\n")[1].split(",").slice(8, 10), ["31000", "KM"]);
checa("XML sem km não traz a tag", feedXml(loja, [feed(null)], new Date()).includes("<km>"), false);
checa("XML com km", feedXml(loja, [feed(31000)], new Date()).includes("<km>31000</km>"), true);
checa("JSON sem km é null", feedJson(loja, [feed(null)], new Date()).veiculos[0].km, null);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
