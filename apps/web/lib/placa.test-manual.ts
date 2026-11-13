// Busca pela placa contra um provedor falso. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/placa.test-manual.ts
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

let chamadas = 0;
const servidor = createServer((req, res) => {
  chamadas++;
  const placa = decodeURIComponent((req.url ?? "").split("/").pop() ?? "").split("?")[0];
  const json = (o: unknown, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (placa === "LMV8E56") return json({ marca: "CHEVROLET", modelo: "PRISMA", submodelo: "1.4 MT LT", ano: "2019", anoModelo: "2019", cor: "Preto", combustivel: "Gasolina/Álcool", chassi: "9bgks69v0kg336088", extra: { cambio: "Manual", portas: "4" }, fipe: { dados: [{ codigo_fipe: "004413-6" }] } });
  if (placa === "ABC1D23") return json({ data: { make: "Fiat", model: "FIAT/ARGO 1.0 DRIVE", yearManufacture: 2021, modelYear: 2022, fuelName: "Flex", transmission: "Automática CVT", doors: 4 } });
  if (placa === "ERR0R00") return json({}, 500);
  json({ erro: "não encontrada" }, 404);
});

async function main() {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  delete process.env.PLACA_API_URL;
  const { prisma } = await import("@dilon-zap/db");
  const { consultarPlaca, lerRespostaDeProvedor } = await import("./placa");
  await prisma.consultaPlaca.deleteMany({ where: { placa: { in: ["LMV8E56", "ABC1D23", "ERR0R00", "QQQ1Q11"] } } });
  await prisma.tenant.deleteMany({ where: { slug: "teste-placa" } });
  const t = await prisma.tenant.create({ data: { name: "Loja Placa", slug: "teste-placa" } });

  checa("placa inválida", (await consultarPlaca(t.id, "123")).ok, false);
  const sem = await consultarPlaca(t.id, "LMV-8E56");
  checa("sem provedor configurado: avisa que não está liberado", [sem.ok, !sem.ok && sem.semProvedor], [false, true]);

  process.env.PLACA_API_URL = `${base}/consulta/{placa}?token=segredo`;
  const r1 = await consultarPlaca(t.id, "lmv-8e56");
  checa("placa do Prisma: ficha preenchida (marca, modelo, versão, anos, cor, combustível→Flex, câmbio, portas, chassi, FIPE)", r1.ok && r1.dados, { marca: "Chevrolet", modelo: "Prisma", versao: "1.4 MT LT", anoFabricacao: 2019, anoModelo: 2019, cor: "Preto", combustivel: "Flex", cambio: "Manual", portas: 4, chassi: "9BGKS69V0KG336088", codigoFipe: "004413-6" });
  const antes = chamadas;
  const r2 = await consultarPlaca(t.id, "LMV8E56");
  checa("segunda consulta da mesma placa vem do cache (não gasta o provedor)", [r2.ok && r2.doCache, chamadas - antes], [true, 0]);
  const r3 = await consultarPlaca(t.id, "ABC1D23");
  checa("resposta em inglês, com 'FIAT/ARGO' e câmbio CVT", r3.ok && r3.dados, { marca: "Fiat", modelo: "Argo 1.0 Drive", anoFabricacao: 2021, anoModelo: 2022, combustivel: "Flex", cambio: "CVT", portas: 4 });
  const r4 = await consultarPlaca(t.id, "QQQ1Q11");
  checa("placa não encontrada", [r4.ok, !r4.ok && r4.erro], [false, "Não encontramos essa placa. Preencha os dados à mão."]);
  const r5 = await consultarPlaca(t.id, "ERR0R00");
  checa("provedor com erro: mensagem do erro, sem cache", [r5.ok, !r5.ok && r5.erro, await prisma.consultaPlaca.count({ where: { placa: "ERR0R00" } })], [false, "O provedor de placas respondeu 500", 0]);
  checa("resposta sem marca nem modelo é descartada", lerRespostaDeProvedor({ placa: "X", situacao: "ok" }), null);
  checa("combustível e câmbio desconhecidos não são inventados", lerRespostaDeProvedor({ marca: "VW", modelo: "Gol", combustivel: "xyz", cambio: "?" }), { marca: "Vw", modelo: "Gol" });
  checa("nada do dono é guardado no cache", Object.keys((await prisma.consultaPlaca.findUniqueOrThrow({ where: { placa: "LMV8E56" } })).dados as object).sort(), ["anoFabricacao", "anoModelo", "cambio", "chassi", "codigoFipe", "combustivel", "cor", "marca", "modelo", "portas", "versao"]);

  await prisma.consultaPlaca.deleteMany({ where: { placa: { in: ["LMV8E56", "ABC1D23"] } } });
  await prisma.tenant.delete({ where: { id: t.id } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
