// Lado web da MobiAuto contra uma MobiAuto falsa. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/portais-mobiauto.test-manual.ts
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const json = (o: unknown, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    if (url.pathname === "/auth/token") return json(new URLSearchParams(corpo).get("code") === "bom" ? { access_token: "A1", refresh_token: "R1", expires_in: 300 } : { error: "invalid_grant" }, new URLSearchParams(corpo).get("code") === "bom" ? 200 : 400);
    if (req.headers.authorization !== "Bearer A1") return json({}, 401);
    if (url.pathname === "/api/dealer/v1.0/dealers") return json([{ id: 26274, name: "Sales Automóveis", cnpj: "20458995000146" }, { id: 777, name: "Outra Loja", cnpj: "1" }]);
    if (url.pathname === "/api/dealer/26274/plans") return json([{ dealPlanId: "P7", name: "Plano Ouro", quantity: 60, quantityAvailable: 10, quantityUsed: 50 }]);
    if (url.pathname === "/api/dealer/777/plans") return json([{ dealPlanId: "Z1", name: "Outro plano", quantity: 5, quantityAvailable: 5, quantityUsed: 0 }]);
    if (url.pathname.endsWith("/inventory/v1.0")) return json(url.searchParams.get("page") === "0" ? [{ id: 1, plate: "ABC1D23", publishes: [{}] }, { id: 2, plate: "ZZZ9Z99", publishes: [] }] : []);
    json({}, 404);
  });
});

async function main() {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  Object.assign(process.env, { MOBIAUTO_API_URL: base, MOBIAUTO_AUTH_URL: `${base}/auth`, MOBIAUTO_CLIENT_ID: "zap", MOBIAUTO_CLIENT_SECRET: "s", PORTAIS_CHAVE: randomBytes(32).toString("base64"), NEXTAUTH_URL: "https://zap.exemplo.com.br" });
  const { prisma } = await import("@dilon-zap/db");
  const lib = await import("./portais-mobiauto");

  await prisma.tenant.deleteMany({ where: { slug: "teste-mb-web" } });
  const t = await prisma.tenant.create({ data: { name: "Loja MB Web", slug: "teste-mb-web" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "G", email: "g-mb-web@t.com", passwordHash: "x", role: "OWNER" } });

  const url = new URL(lib.urlDeConexaoMobiauto(t.id, u.id, "https://zap.exemplo.com.br")!);
  checa("URL de conexão aponta para o login da MobiAuto com o retorno do Zap", [url.origin + url.pathname, url.searchParams.get("redirect_uri")], [`${base}/auth/auth`, "https://zap.exemplo.com.br/api/portais/mobiauto/retorno"]);
  const state = url.searchParams.get("state")!;
  checa("retorno com state de outra pessoa é recusado", (await lib.concluirConexaoMobiauto("bom", state, "https://zap.exemplo.com.br", { tenantId: t.id, userId: "outro" })).ok, false);
  checa("retorno com state forjado é recusado", (await lib.concluirConexaoMobiauto("bom", "forjado", "https://zap.exemplo.com.br", { tenantId: t.id, userId: u.id })).ok, false);
  checa("código inválido falha", (await lib.concluirConexaoMobiauto("ruim", state, "https://zap.exemplo.com.br", { tenantId: t.id, userId: u.id })).ok, false);
  checa("conecta e guarda a loja", await lib.concluirConexaoMobiauto("bom", state, "https://zap.exemplo.com.br", { tenantId: t.id, userId: u.id }), { ok: true });
  const conta = await prisma.portalConta.findUniqueOrThrow({ where: { tenantId_portal: { tenantId: t.id, portal: "MOBIAUTO" } } });
  checa("conta conectada, loja e CNPJ à vista, token cifrado", [conta.status, conta.contaNome, conta.contaEmail, conta.accessTokenCripto.startsWith("v1.") && !conta.accessTokenCripto.includes("dealerId")], ["CONECTADA", "Sales Automóveis", "20458995000146", true]);

  checa("planos da loja", (await lib.planosMobiauto(t.id))?.map((p) => [p.id, p.nome, p.total, p.disponiveis]), [["P7", "Plano Ouro", 60, 10]]);
  checa("lojas do usuário", (await lib.lojasMobiauto(t.id))?.map((l) => l.id), ["26274", "777"]);
  checa("trocar de loja muda os planos consultados", [await lib.definirLojaMobiauto(t.id, "777"), (await lib.planosMobiauto(t.id))?.[0].id], [true, "Z1"]);
  await lib.definirLojaMobiauto(t.id, "26274");
  await lib.definirPlanoMobiauto(t.id, "P7");
  checa("plano padrão guardado", (await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } })).planoPadrao, "P7");

  const mk = (placa: string, extra: object = {}) => prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Argo", anoFabricacao: 2021, anoModelo: 2021, km: 1000, kmInformado: true, precoCents: 5_000_000, status: "DISPONIVEL", origem: "COMPRA", placa, ...extra } });
  const a = await mk("ABC-1D23");
  const b = await mk("QQQ1Q11", { kmInformado: false, km: 0 });
  const conf = await lib.conferirMobiauto(t.id);
  checa("conferência: casa pela placa, mostra o que sobra de cada lado", [conf?.naMobiauto, conf?.noZap, conf?.casam, conf?.soNoZap.map((c) => c.placa), conf?.soNaMobiauto.map((c) => c.placa)], [2, 2, 1, ["QQQ1Q11"], ["ZZZ9Z99"]]);
  checa("anunciar: liga e conta os sem km", await lib.anunciarNaMobiauto(t.id, [a.id, b.id]), { ligados: 2, semKm: 1 });
  checa("publicações criadas ativas", await prisma.publicacaoPortal.count({ where: { tenantId: t.id, portal: "MOBIAUTO", ativo: true } }), 2);
  await lib.desligarDaMobiauto(t.id, a.id);
  checa("desligar um carro", await prisma.publicacaoPortal.count({ where: { tenantId: t.id, portal: "MOBIAUTO", ativo: true } }), 1);
  const painel = await lib.painelMobiauto(t.id);
  checa("painel: conta, contagem e carros sem km", [painel.conta?.status, painel.contagem.FILA, painel.semKm], ["CONECTADA", 1, 1]);
  await lib.desconectarMobiauto(t.id);
  checa("desconectar limpa o token e sem sessão nada é chamado", [(await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } })).accessTokenCripto, await lib.planosMobiauto(t.id)], ["", null]);

  await prisma.tenant.delete({ where: { id: t.id } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
