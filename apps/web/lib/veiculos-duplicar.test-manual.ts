// "Duplicar cadastro" de um carro. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx --tsconfig tsconfig.json lib/veiculos-duplicar.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { ErroDeVeiculo, duplicarVeiculo } from "./veiculos";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-duplicar", "teste-duplicar-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Loja Dup", slug: "teste-duplicar" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra Dup", slug: "teste-duplicar-2" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "Gestor", email: "g-dup@t.com", passwordHash: "x", role: "OWNER" } });
  const o = await prisma.veiculo.create({
    data: {
      tenantId: t.id, marca: "Fiat", modelo: "Argo", versao: "1.0 Drive", anoFabricacao: 2021, anoModelo: 2022, km: 31000, kmInformado: true, cor: "Branco", combustivel: "Flex", cambio: "Manual", portas: 4,
      opcionais: ["Ar condicionado"], caracteristicas: ["IPVA pago"], placa: "RMO1H85", chassi: "9BD1234567890", renavam: "123", precoCents: 5_599_900, precoMinimoCents: 5_300_000,
      descricao: "Carro novinho", observacoesInternas: "risco no para-choque", status: "DISPONIVEL", origem: "CONSIGNACAO", naVitrine: true, siteOrigemId: "autocerto:1",
      ajustesPorPortal: { WEBMOTORS: { precoCents: 5_700_000 } }, consignacaoValorCents: 5_000_000,
    },
  });
  await prisma.fotoVeiculo.create({ data: { tenantId: t.id, veiculoId: o.id, key: "k/original.jpg", ordem: 0 } });
  await prisma.custoVeiculo.create({ data: { tenantId: t.id, veiculoId: o.id, tipo: "COMPRA", valorCents: 4_000_000, createdById: u.id } });
  const x = await prisma.veiculo.create({ data: { tenantId: t2.id, marca: "VW", modelo: "Gol", anoFabricacao: 2020, anoModelo: 2020, km: 1, precoCents: 100, status: "DISPONIVEL", origem: "COMPRA" } });

  const r = await duplicarVeiculo({ tenantId: t.id, userId: u.id, veiculoId: o.id });
  const n = await prisma.veiculo.findUniqueOrThrow({ where: { id: r.id }, include: { fotos: true, custos: true, eventos: true } });
  checa("leva o que é do modelo", [n.marca, n.modelo, n.versao, n.anoFabricacao, n.anoModelo, n.cor, n.combustivel, n.cambio, n.portas, n.opcionais, n.caracteristicas, n.precoCents, n.precoMinimoCents, n.descricao, n.ajustesPorPortal], ["Fiat", "Argo", "1.0 Drive", 2021, 2022, "Branco", "Flex", "Manual", 4, ["Ar condicionado"], ["IPVA pago"], 5_599_900, 5_300_000, "Carro novinho", { WEBMOTORS: { precoCents: 5_700_000 } }]);
  checa("deixa de fora o que é do carro: placa, chassi, renavam, observações, site de origem, consignação", [n.placa, n.chassi, n.renavam, n.observacoesInternas, n.siteOrigemId, n.consignacaoValorCents, n.consignanteId], [null, null, null, null, null, null, null]);
  checa("km nasce não informada (não vai à venda com km inventada) e entra em preparação", [n.km, n.kmInformado, n.status, n.origem], [0, false, "PREPARACAO", "COMPRA"]);
  checa("sem fotos (não divide o arquivo do R2) e sem custos", [n.fotos.length, n.custos.length], [0, 0]);
  checa("registra o evento de entrada", n.eventos.map((e) => e.tipo), ["entrada"]);
  checa("o original segue intacto", await prisma.veiculo.findUniqueOrThrow({ where: { id: o.id }, select: { placa: true, km: true, status: true } }), { placa: "RMO1H85", km: 31000, status: "DISPONIVEL" });

  // Outra empresa não duplica o carro de quem não é dela.
  const alheio = await duplicarVeiculo({ tenantId: t2.id, userId: u.id, veiculoId: o.id }).then(() => "duplicou", (e) => (e instanceof ErroDeVeiculo ? e.status : "erro"));
  checa("carro de outra empresa: 404, nada criado", [alheio, await prisma.veiculo.count({ where: { tenantId: t2.id } })], [404, 1]);
  void x;

  // Pátio cheio do plano: 402.
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, plano: "GARAGEM" } });
  await prisma.veiculo.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ tenantId: t.id, marca: "X", modelo: `M${i}`, anoFabricacao: 2020, anoModelo: 2020, km: 1, precoCents: 100, status: "DISPONIVEL" as const, origem: "COMPRA" as const })) });
  const cheio = await duplicarVeiculo({ tenantId: t.id, userId: u.id, veiculoId: o.id }).then(() => "duplicou", (e) => (e instanceof ErroDeVeiculo ? e.status : "erro"));
  checa("pátio cheio no plano: 402", cheio, 402);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-duplicar", "teste-duplicar-2"] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await prisma.$disconnect();
  process.exit(falhas ? 1 : 0);
}
main();
