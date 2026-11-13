// Completar km e preço em lote. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/veiculos-completar.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { completarEstoque } from "./veiculos-completar";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-completar", "teste-completar-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Completar", slug: "teste-completar" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra", slug: "teste-completar-2" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "G", email: "g-completar@t.com", passwordHash: "x", role: "OWNER" } });
  const mk = (tenantId: string, placa: string, extra: object = {}) => prisma.veiculo.create({ data: { tenantId, marca: "Fiat", modelo: "Argo", anoFabricacao: 2020, anoModelo: 2021, km: 0, kmInformado: false, precoCents: 5_000_000, status: "PREPARACAO", origem: "COMPRA", placa, ...extra } });
  const a = await mk(t.id, "AAA1A11");
  const b = await mk(t.id, "AAA1A12", { precoCents: 0 });
  const c = await mk(t.id, "AAA1A13");
  const d = await mk(t.id, "AAA1A14", { status: "VENDIDO" });
  const x = await mk(t2.id, "AAA1A15");

  const r1 = await completarEstoque(t.id, u.id, [{ id: a.id, km: 45300 }, { id: b.id, km: 20000 }, { id: d.id, km: 1 }, { id: x.id, km: 5 }, { id: "nao-existe", km: 1 }], true);
  checa("salvos e colocados; vendido, outra loja e inexistente pulados", [r1.salvos, r1.colocados, r1.pulados], [2, 1, 3]);
  const A = await prisma.veiculo.findUniqueOrThrow({ where: { id: a.id } });
  checa("km salva, marcada como informada e à venda", [A.km, A.kmInformado, A.status], [45300, true, "DISPONIVEL"]);
  const B = await prisma.veiculo.findUniqueOrThrow({ where: { id: b.id } });
  checa("sem preço: km salva, mas continua em preparação", [B.km, B.kmInformado, B.status], [20000, true, "PREPARACAO"]);
  const r2 = await completarEstoque(t.id, u.id, [{ id: b.id, precoCents: 3_999_999 }], true);
  const B2 = await prisma.veiculo.findUniqueOrThrow({ where: { id: b.id } });
  checa("preço informado depois: agora vai à venda", [r2.colocados, B2.precoCents, B2.status], [1, 3_999_999, "DISPONIVEL"]);
  const r3 = await completarEstoque(t.id, u.id, [{ id: c.id, km: 0 }], false);
  const C = await prisma.veiculo.findUniqueOrThrow({ where: { id: c.id } });
  checa("km 0 é km informada; sem 'colocar à venda' continua em preparação", [r3.salvos, C.kmInformado, C.km, C.status], [1, true, 0, "PREPARACAO"]);
  checa("outra loja intacta", (await prisma.veiculo.findUniqueOrThrow({ where: { id: x.id } })).kmInformado, false);
  const eventos = await prisma.eventoVeiculo.findMany({ where: { veiculoId: a.id }, select: { tipo: true } });
  checa("histórico do carro", eventos.map((e) => e.tipo).sort(), ["km", "status"]);

  // Loja que não exige km: preço basta.
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, exigirKm: false } });
  const e2 = await mk(t.id, "AAA1A16");
  const r4 = await completarEstoque(t.id, u.id, [{ id: e2.id, precoCents: 4_000_000 }], true);
  checa("loja que não exige km coloca à venda só com preço", r4.colocados, 1);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-completar", "teste-completar-2"] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await prisma.$disconnect();
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
