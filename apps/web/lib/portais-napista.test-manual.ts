// Lado web do NaPista contra um NaPista falso. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/portais-napista.test-manual.ts
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

let leadsDoPortal: object[] = [];
let ultimaBuscaDeLeads = "";
const servidor = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const json = (o: unknown, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    if (url.pathname === "/auth/token") return new URLSearchParams(corpo).get("code") === "bom" ? json({ access_token: "A1", refresh_token: "R1", expires_in: 300 }) : json({ error: "invalid_grant" }, 400);
    if (req.headers.authorization !== "Bearer A1") return json({}, 401);
    if (url.pathname === "/seller/access") return json({ sellers: [{ sellerId: "s-sales", name: "Sales Automóveis", sellerDocument: "20458995000146" }, { sellerId: "s-outra", name: "Outra", sellerDocument: "1" }] });
    if (url.pathname === "/seller/s-sales/offers") return json({ totalPages: 1, pageData: url.searchParams.get("status") === "PUBLISHED" && url.searchParams.get("page") === "0" ? [{ id: "o1", plate: "ABC1D23", status: "PUBLISHED" }, { id: "o2", plate: "ZZZ9Z99", status: "PUBLISHED" }] : [] });
    if (url.pathname === "/seller/s-sales/leads") { ultimaBuscaDeLeads = url.search; return json({ totalPages: 1, pageData: leadsDoPortal }); }
    json({}, 404);
  });
});

async function main() {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  Object.assign(process.env, { NAPISTA_API_URL: base, NAPISTA_AUTH_URL: `${base}/auth`, NAPISTA_CLIENT_ID: "dilon_tech", PORTAIS_CHAVE: randomBytes(32).toString("base64"), NEXTAUTH_URL: "https://zap.exemplo.com.br" });
  const { prisma } = await import("@dilon-zap/db");
  const lib = await import("./portais-napista");

  await prisma.tenant.deleteMany({ where: { slug: "teste-np-web" } });
  const t = await prisma.tenant.create({ data: { name: "Loja NP Web", slug: "teste-np-web" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "G", email: "g-np-web@t.com", passwordHash: "x", role: "OWNER" } });

  const url = new URL(lib.urlDeConexaoNapista(t.id, u.id, "https://zap.exemplo.com.br")!);
  checa("URL de conexão aponta para o login do NaPista com o retorno do Zap", [url.origin + url.pathname, url.searchParams.get("redirect_uri"), url.searchParams.get("client_id")], [`${base}/auth/auth`, "https://zap.exemplo.com.br/api/portais/napista/retorno", "dilon_tech"]);
  const state = url.searchParams.get("state")!;
  const eu = { tenantId: t.id, userId: u.id };
  checa("retorno com state de outra pessoa é recusado", (await lib.concluirConexaoNapista("bom", state, "https://zap.exemplo.com.br", { tenantId: t.id, userId: "outro" })).ok, false);
  checa("código inválido falha", (await lib.concluirConexaoNapista("ruim", state, "https://zap.exemplo.com.br", eu)).ok, false);
  checa("conecta e guarda a loja", await lib.concluirConexaoNapista("bom", state, "https://zap.exemplo.com.br", eu), { ok: true });
  const conta = await prisma.portalConta.findUniqueOrThrow({ where: { tenantId_portal: { tenantId: t.id, portal: "NAPISTA" } } });
  checa("conta conectada, loja e CNPJ à vista, token cifrado", [conta.status, conta.contaNome, conta.contaEmail, conta.accessTokenCripto.startsWith("v1.") && !conta.accessTokenCripto.includes("sellerId")], ["CONECTADA", "Sales Automóveis", "20458995000146", true]);
  checa("lojas do usuário", (await lib.lojasNapista(t.id))?.map((l) => l.id), ["s-sales", "s-outra"]);

  const mk = (placa: string, extra: object = {}) => prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Argo", versao: "Drive", anoFabricacao: 2021, anoModelo: 2021, km: 1000, kmInformado: true, precoCents: 5_000_000, status: "DISPONIVEL", origem: "COMPRA", placa, ...extra } });
  const a = await mk("ABC1D23"); // a ficha guarda a placa já sem traço
  const b = await mk("QQQ1Q11", { kmInformado: false, km: 0 });
  const conf = await lib.conferirNapista(t.id);
  checa("conferência: casa pela placa, mostra o que sobra de cada lado", [conf?.noPortal, conf?.noZap, conf?.casam, conf?.soNoZap.map((c) => c.placa), conf?.soNoPortal.map((c) => c.placa)], [2, 2, 1, ["QQQ1Q11"], ["ZZZ9Z99"]]);
  checa("anunciar: liga os dois (a km é opcional no NaPista)", await lib.anunciarNoNapista(t.id, [a.id, b.id]), { ligados: 2, semKm: 0 });
  await lib.desligarDoNapista(t.id, a.id);
  checa("desligar um carro", await prisma.publicacaoPortal.count({ where: { tenantId: t.id, portal: "NAPISTA", ativo: true } }), 1);

  // ---- leads → CRM ----
  leadsDoPortal = [
    { id: "L1", clientName: "João Lima", clientEmail: "joao@x.com", clientPhone: { areaCode: "21", number: "998765432" }, vehicleVersion: "Argo Drive", contactMessage: "Aceita troca?", updatedAt: "2026-11-14T15:00:00Z", vehiclePlate: "ABC1D23" },
    { id: "L2", clientName: "Ana Souza", clientPhone: { areaCode: "21", number: "977771234" }, vehicleVersion: "Onix LT 2020", updatedAt: "2026-11-14T16:00:00Z", upfrontValue: 10000, installments: 48, clientCreditStatus: "PRE_APPROVED" },
    { id: "L3", clientName: "Sem Fone", clientEmail: "s@x.com", vehicleVersion: "x", updatedAt: "2026-11-14T17:00:00Z" },
  ];
  const agora = new Date("2026-11-15T12:00:00Z");
  checa("primeira busca: 3 leads novos", await lib.buscarLeadsDoNapista(t.id, agora), { novos: 3, vistos: 3 });
  checa("a busca olha os últimos 3 dias", ultimaBuscaDeLeads.includes("initialDate=2026-11-12") && ultimaBuscaDeLeads.includes("endDate=2026-11-16"), true);
  const negs = await prisma.negociacao.findMany({ where: { tenantId: t.id }, orderBy: { createdAt: "asc" }, include: { tarefas: true, contact: true } });
  checa("lead com placa: negociação do carro, com o valor e a origem NaPista", [negs[0].titulo, negs[0].valorCents, negs[0].origem, negs[0].contact.waJid], ["Fiat Argo Drive 2021/2021 (Na Pista)", 5_000_000, "Na Pista", "5521998765432@s.whatsapp.net"]);
  checa("tarefa de chamar com a mensagem do cliente", [negs[0].tarefas[0].tipo, negs[0].tarefas[0].titulo.includes("Aceita troca?")], ["WHATSAPP", true]);
  checa("lead de financiamento: entrada, parcelas e crédito pré-aprovado vão na tarefa", [negs[1].titulo, /Entrada de R\$\s?10\.000 em 48x/.test(negs[1].tarefas[0].titulo), negs[1].tarefas[0].titulo.includes("Crédito pré-aprovado"), negs[1].tarefas[0].titulo.includes("Onix LT 2020")], ["Contato pelo Na Pista", true, true, true]);
  const l3 = await prisma.leadPortal.findFirstOrThrow({ where: { tenantId: t.id, chave: "np:L3" } });
  checa("lead sem telefone: guardado, sem negociação", [l3.semTelefone, l3.negociacaoId, negs.length], [true, null, 2]);
  checa("segunda busca: nada duplicado", [await lib.buscarLeadsDoNapista(t.id, agora), await prisma.negociacao.count({ where: { tenantId: t.id } }), await prisma.leadPortal.count({ where: { tenantId: t.id, portal: "NAPISTA" } })], [{ novos: 0, vistos: 3 }, 2, 3]);
  const painel = await lib.painelNapista(t.id);
  checa("painel: conta, fila, carros sem km e data da última conferência de leads", [painel.conta?.status, painel.contagem.FILA, painel.semKm, painel.conta?.leadEm !== null], ["CONECTADA", 1, 1, true]);
  checa("lojas com NaPista (para o cron)", (await lib.lojasComNapista()).includes(t.id), true);
  await lib.desconectarNapista(t.id);
  checa("desconectar limpa o token; sem sessão nada é buscado", [(await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } })).accessTokenCripto, await lib.buscarLeadsDoNapista(t.id)], ["", null]);

  await prisma.tenant.delete({ where: { id: t.id } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
