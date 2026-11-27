// Plano da Webmotors por carro. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx --tsconfig tsconfig.json lib/portais-webmotors-plano.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { definirPlanoDoCarro } from "./portais-webmotors";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-wm-plano", "teste-wm-plano-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Loja WM", slug: "teste-wm-plano" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra WM", slug: "teste-wm-plano-2" } });
  await prisma.portalConta.create({ data: { tenantId: t.id, portal: "WEBMOTORS", status: "CONECTADA", accessTokenCripto: "x", planoPadrao: "10" } });
  const mk = (tenantId: string) => prisma.veiculo.create({ data: { tenantId, marca: "Fiat", modelo: "Argo", anoFabricacao: 2021, anoModelo: 2021, km: 1000, kmInformado: true, precoCents: 5_000_000, status: "DISPONIVEL", origem: "COMPRA" } });
  const a = await mk(t.id), sem = await mk(t.id), x = await mk(t2.id);
  const pub = (tenantId: string, veiculoId: string, extra: object = {}) => prisma.publicacaoPortal.create({ data: { tenantId, veiculoId, portal: "WEBMOTORS", idEnviado: veiculoId.slice(-12), ...extra } });
  await pub(t.id, a.id);
  await pub(t2.id, x.id);
  const planos = [
    { codigo: "10", descricao: "Básico", tipo: "", total: 20, usados: 20 },
    { codigo: "20", descricao: "Destaque", tipo: "", total: 5, usados: 2 },
    { codigo: "30", descricao: "Premium", tipo: "", total: 3, usados: 3 },
  ];
  const plano = async (id: string, tenantId = t.id) => (await prisma.publicacaoPortal.findFirst({ where: { veiculoId: id, tenantId } }))?.plano ?? null;

  checa("plano que a Webmotors lista e que ainda cabe: grava", [await definirPlanoDoCarro(t.id, a.id, "20", planos), await plano(a.id)], [{ ok: true }, "20"]);
  checa("plano cheio: recusa e não grava", [await definirPlanoDoCarro(t.id, a.id, "30", planos), await plano(a.id)], [{ ok: false, status: 409, erro: 'o plano "Premium" está cheio (3 de 3 anúncios)' }, "20"]);
  checa("plano que a Webmotors não lista: recusa", [await definirPlanoDoCarro(t.id, a.id, "99", planos), await plano(a.id)], [{ ok: false, status: 400, erro: "a Webmotors não lista esse plano para a sua loja" }, "20"]);
  checa("voltar ao plano padrão da loja (nulo): grava sem consultar a lista", [await definirPlanoDoCarro(t.id, a.id, null, []), await plano(a.id)], [{ ok: true }, null]);
  checa("o plano padrão da loja, mesmo cheio, não é recusado (o carro já conta nele)", [await definirPlanoDoCarro(t.id, a.id, "10", planos), await plano(a.id)], [{ ok: true }, "10"]);
  checa("carro ainda não ligado na Webmotors: 404", await definirPlanoDoCarro(t.id, sem.id, "20", planos), { ok: false, status: 404, erro: "este carro ainda não foi ligado na Webmotors" });
  checa("carro de outra empresa: 404 e o plano dela não muda", [await definirPlanoDoCarro(t.id, x.id, "20", planos), await plano(x.id, t2.id)], [{ ok: false, status: 404, erro: "este carro ainda não foi ligado na Webmotors" }, null]);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-wm-plano", "teste-wm-plano-2"] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await prisma.$disconnect();
  process.exit(falhas ? 1 : 0);
}
main();
