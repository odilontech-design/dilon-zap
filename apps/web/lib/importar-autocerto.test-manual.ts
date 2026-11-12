// Planilha do AutoCerto → fichas. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/importar-autocerto.test-manual.ts
// Usa dados inventados. Se a planilha real estiver em AUTOCERTO_XLS, confere também com ela.
import fs from "node:fs";
import { prisma } from "@dilon-zap/db";
import { chaveDoCarro, dinheiroEmCentavos, lerPlanilhaAutoCerto } from "./importar-autocerto";
import { completarComPlanilha, ErroPlanilhaAutoCerto } from "./importar-autocerto-estoque";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const CAB = ["Marca", "Modelo", "Versão", "Ano", "Placa", "Cor", "KM", "Combustivel", "Unico Dono", "Preço", "Preço Classificados", "Valor Fipe", "Data Cadastro", "Situação", "Ativo Site", "Observação Site", "Observação Classificados"];
const linha = (m: string, mo: string, v: string, ano: string, placa: string, cor: string, km: string, preco: string, classif: string, fipe: string, cad: string) =>
  [m, mo, v, ano, placa, cor, km, "Flex", "Não", preco, classif, fipe, cad, "N/I", "Sim", "texto longo do anúncio", "texto longo"].map((c) => `<td>${c}</td>`).join("");
// O AutoCerto não manda <tr>: o cabeçalho e as células vêm em sequência.
const html = (linhas: string[]) => `<table>${CAB.map((c) => `<th>${c}</th>`).join("")}${linhas.join("")}</table>`;

const planilha = html([
  linha("FIAT", "ARGO", "1.0 FIREFLY FLEX DRIVE MANUAL", "2022/2023", "ABC-1D23", "Branco", "0", "R$ 0,00", "R$ 74.999,99", "R$ 71.200,00", "04/09/2026"),
  linha("HONDA", "FIT", "1.5 EX 16V FLEX", "2017/2018", "QWE1R23", "Prata", "62.000", "R$ 59.900,00", "R$ 0,00", "R$ 55.000,00", "15/10/2026"),
  linha("FORD", "KA", "1.0 SE", "2018/2019", "ABC123", "Preto", "0", "R$ 0,00", "R$ 0,00", "R$ 0,00", "01/01/2026"),
  linha("VW", "GOL", "1.0 MPI", "2015/2016", "ZZZ9A99", "Cinza", "0", "R$ 0,00", "R$ 30.000,00", "R$ 29.000,00", "10/08/2026"),
  linha("VW", "GOL", "1.0 MPI", "2015/2016", "ZZZ9A98", "Cinza", "0", "R$ 0,00", "R$ 31.000,00", "R$ 29.000,00", "10/08/2026"),
]);

const l = lerPlanilhaAutoCerto(planilha);
checa("5 linhas lidas, sem erro", [l.linhas.length, l.erros.length, l.faltando.length], [5, 0, 0]);
const a = l.linhas[0];
checa("ano fabricação/modelo", [a.anoFabricacao, a.anoModelo], [2022, 2023]);
checa("placa normalizada", a.placa, "ABC1D23");
checa("preço dos classificados quando o do site é 0", a.precoCents, 7_499_999);
checa("preço do site quando não há classificados", l.linhas[1].precoCents, 5_990_000);
checa("km 0 vira nulo", [a.km, l.linhas[1].km], [null, 62000]);
checa("FIPE", a.fipeCents, 7_120_000);
checa("FIPE zero vira nulo", l.linhas[2].fipeCents, null);
checa("data de cadastro", a.cadastro?.toISOString().slice(0, 10), "2026-09-04");
checa("placa inválida vira nula", l.linhas[2].placa, null);
checa("dinheiro", [dinheiroEmCentavos("R$ 35.999,99"), dinheiroEmCentavos("R$ 10.000"), dinheiroEmCentavos("R$ 0,00"), dinheiroEmCentavos("")], [3_599_999, 1_000_000, 0, 0]);
checa("cabeçalho em Latin-1 quebrado ainda acha as colunas", lerPlanilhaAutoCerto(planilha.replace("Versão", "Vers�o").replace("Preço Classificados", "Pre�o Classificados")).linhas[0].precoCents, 7_499_999);
checa("arquivo que não é do AutoCerto", lerPlanilhaAutoCerto("<html><body>oi</body></html>").faltando.length > 0, true);
checa("chave ignora acento e caixa", chaveDoCarro({ marca: "Citroen", modelo: "C4 Cactus", versao: "1.6 VTI", anoModelo: 2020, cor: "Prata" }), chaveDoCarro({ marca: "CITROËN", modelo: "c4  cactus", versao: "1.6 vti", anoModelo: 2020, cor: "PRATA" }));

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: "teste-autocerto" } });
  const t = await prisma.tenant.create({ data: { name: "Loja AutoCerto", slug: "teste-autocerto" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "Dono", email: "dono@autocerto.teste", passwordHash: "x", role: "OWNER" } });
  const hoje = new Date();
  const novo = (marca: string, modelo: string, versao: string, ano: number, cor: string, extra: object = {}) =>
    prisma.veiculo.create({
      data: { tenantId: t.id, marca, modelo, versao, anoFabricacao: ano, anoModelo: ano, km: 0, kmInformado: false, cor, precoCents: 0, status: "PREPARACAO", origem: "COMPRA", siteOrigemId: `autocerto:${marca}${modelo}${ano}`, entradaEm: hoje, ...extra },
    });
  const argo = await novo("Fiat", "Argo", "1.0 Firefly Flex Drive Manual", 2023, "Branco");
  const fit = await novo("Honda", "Fit", "1.5 EX 16V Flex", 2018, "Prata", { precoCents: 6_100_000, placa: "AAA1A11" }); // já tem preço e placa
  await novo("Volkswagen", "Gol", "1.0 MPI", 2016, "Cinza"); // marca "VW" na planilha: não casa
  const ka = await novo("Ford", "Ka", "1.0 SE", 2019, "Preto");
  await novo("Chevrolet", "Onix", "1.0 LT", 2020, "Azul"); // não está na planilha

  const base = { tenantId: t.id, userId: u.id, texto: planilha };
  const sim = await completarComPlanilha({ ...base, simular: true });
  checa("simulação: casados e linhas sem carro", [sim.linhas, sim.casados, sim.semCarro], [5, 3, 2]);
  checa("simulação não grava", (await prisma.veiculo.findUniqueOrThrow({ where: { id: argo.id } })).placa, null);

  const r = await completarComPlanilha({ ...base, simular: false });
  checa("aplicou nos 2 que tinham o que preencher (Ka só a data)", [r.aplicados, r.carrosSemLinha], [3, 2]);
  const a1 = await prisma.veiculo.findUniqueOrThrow({ where: { id: argo.id } });
  checa("Argo: placa, preço, FIPE, ano de fabricação e entrada", [a1.placa, a1.precoCents, a1.fipeCents, a1.anoFabricacao, a1.entradaEm.toISOString().slice(0, 10)], ["ABC1D23", 7_499_999, 7_120_000, 2022, "2026-09-04"]);
  checa("Argo continua em preparação e sem km", [a1.status, a1.kmInformado, a1.km], ["PREPARACAO", false, 0]);
  const f1 = await prisma.veiculo.findUniqueOrThrow({ where: { id: fit.id } });
  checa("Fit: não sobrescreve preço nem placa, mas põe a km e a FIPE", [f1.precoCents, f1.placa, f1.km, f1.kmInformado, f1.fipeCents], [6_100_000, "AAA1A11", 62000, true, 5_500_000]);
  const k1 = await prisma.veiculo.findUniqueOrThrow({ where: { id: ka.id } });
  checa("Ka: placa inválida na planilha não entra", [k1.placa, k1.precoCents], [null, 0]);
  checa("histórico diz o que foi completado", (await prisma.eventoVeiculo.findFirstOrThrow({ where: { veiculoId: argo.id, tipo: "ficha" } })).descricao, "Completado com a planilha do AutoCerto: placa, preço, FIPE, ano de fabricação, data de entrada");

  const de_novo = await completarComPlanilha({ ...base, simular: false });
  checa("repetir não muda nada", [de_novo.aplicados, de_novo.casados], [0, 3]);

  // Placa da planilha que já está em outro carro do estoque.
  await prisma.veiculo.update({ where: { id: ka.id }, data: { placa: null } });
  await prisma.veiculo.update({ where: { id: fit.id }, data: { placa: "ZZZ9A99" } });
  const planilha2 = html([linha("FORD", "KA", "1.0 SE", "2018/2019", "ZZZ-9A99", "Preto", "0", "R$ 0,00", "R$ 40.000,00", "R$ 0,00", "01/01/2026")]);
  const rep = await completarComPlanilha({ tenantId: t.id, userId: u.id, texto: planilha2, simular: false });
  checa("placa já usada em outro carro: não aplica e avisa", [rep.placasRepetidas, (await prisma.veiculo.findUniqueOrThrow({ where: { id: ka.id } })).placa, rep.preenche.preco], [["ZZZ-9A99"], null, 1]);

  const erro = await completarComPlanilha({ ...base, texto: "<table><tr><td>oi</td></tr></table>".padEnd(100, " "), simular: true }).then(() => null, (e) => (e instanceof ErroPlanilhaAutoCerto ? e.message.slice(0, 40) : String(e)));
  checa("arquivo errado dá mensagem em português", erro, "não reconheci a planilha do AutoCerto (f");

  const real = process.env.AUTOCERTO_XLS;
  if (real && fs.existsSync(real)) {
    const lr = lerPlanilhaAutoCerto(fs.readFileSync(real, "latin1"));
    checa("planilha real: 60 linhas sem erro, todas com placa", [lr.linhas.length, lr.erros.length, lr.linhas.every((x) => x.placa)], [60, 0, true]);
    console.log(`      preço em ${lr.linhas.filter((x) => x.precoCents > 0).length}, FIPE em ${lr.linhas.filter((x) => x.fipeCents).length}, km em ${lr.linhas.filter((x) => x.km).length}`);
  }

  await prisma.tenant.delete({ where: { id: t.id } });
  await prisma.$disconnect();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
