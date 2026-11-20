// Feeds do estoque. Puro. Rodar com: npx tsx apps/web/lib/feeds-estoque.test-manual.ts
import { feedJson, feedMetaCsv, feedXml, type CarroDoFeed } from "./feeds-estoque";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const polo: CarroDoFeed = {
  id: "c1", marca: "Volkswagen", modelo: "Polo", versao: "TSI 1.0", anoFabricacao: 2022, anoModelo: 2023, km: 28500, cor: "Prata",
  combustivel: "Flex", cambio: "Automático", portas: 4, opcionais: ["Ar", "Multimídia"], precoCents: 9290000,
  descricao: 'Único dono, "revisado", com garantia', status: "DISPONIVEL", diasEmEstoque: 12, url: "https://loja.com/loja/x/c1",
  fotos: ["https://f/1.jpg", "https://f/2.jpg"],
};
const onix: CarroDoFeed = { ...polo, id: "c2", marca: "Chevrolet", modelo: "Onix", versao: null, cambio: "Manual", combustivel: "Gasolina", status: "RESERVADO", fotos: [], descricao: null, opcionais: [] };
const loja = { nome: "Sales & Cia", endereco: "Av. Brasil, 1000, Campinas, SP" };

const csv = feedMetaCsv(loja, [polo, onix]).trim().split("\n");
const cab = csv[0].split(",");
const col = (linha: string, nome: string) => {
  // Lê respeitando aspas.
  const celulas: string[] = [];
  let atual = "", aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (aspas) { if (ch === '"' && linha[i + 1] === '"') { atual += '"'; i++; } else if (ch === '"') aspas = false; else atual += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === ",") { celulas.push(atual); atual = ""; }
    else atual += ch;
  }
  celulas.push(atual);
  return celulas[cab.indexOf(nome)];
};
checa("cabeçalho com colunas da Meta", ["vehicle_id", "price", "mileage.value", "image[0].url", "image[1].url"].every((c) => cab.includes(c)), true);
checa("preço com moeda", col(csv[1], "price"), "92900.00 BRL");
checa("câmbio e combustível no vocabulário da Meta", [col(csv[1], "transmission"), col(csv[1], "fuel_type"), col(csv[2], "transmission"), col(csv[2], "fuel_type")], ["AUTOMATIC", "FLEX", "MANUAL", "GASOLINE"]);
checa("reservado vira pendente", col(csv[2], "availability"), "PENDING");
checa("aspas e vírgulas escapadas", col(csv[1], "description"), 'Único dono, "revisado", com garantia Opcionais: Ar, Multimídia.');
checa("sem descrição, usa o título", col(csv[2], "description"), "Chevrolet Onix 2022/2023");

const xml = feedXml(loja, [polo, onix], new Date("2026-11-12T12:00:00Z"));
checa("xml escapa e conta", [xml.includes('loja="Sales &amp; Cia"'), xml.includes('total="2"'), xml.includes("&quot;revisado&quot;"), (xml.match(/<foto>/g) ?? []).length], [true, true, true, 2]);
checa("json", feedJson(loja, [onix], new Date(0)).veiculos[0], { id: "c2", marca: "Chevrolet", modelo: "Onix", versao: null, anoFabricacao: 2022, anoModelo: 2023, km: 28500, cor: "Prata", combustivel: "Gasolina", cambio: "Manual", portas: 4, preco: 92900, situacao: "reservado", opcionais: [], descricao: null, url: "https://loja.com/loja/x/c1", fotos: [] });

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
