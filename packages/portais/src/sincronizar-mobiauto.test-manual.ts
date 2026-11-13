// Sincronização com a MobiAuto de ponta a ponta: Postgres + servidor falso (OAuth e Open API).
// Rodar com: DATABASE_URL=postgresql://... npx tsx packages/portais/src/sincronizar-mobiauto.test-manual.ts
import http from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { montarDealMobiauto } from "./mobiauto/mapa";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// ---- A MobiAuto falsa -----------------------------------------------------------------------
type Deal = Record<string, any> & { id: number; images: { imageId: number; url: string; position: number }[]; publishes: object[] };
const deals = new Map<number, Deal>();
const chamadas: string[] = [];
let proximo = 100;
let proximaImagem = 1;
let tokenValido = "A1";
let refreshOk = true;
let fora = false;
let renovacoes = 0;
const DEALER = "26274";

const corpoDe = (req: http.IncomingMessage) => new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const corpo = await corpoDe(req);
  const json = (o: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(o === undefined ? "" : JSON.stringify(o)); };
  if (fora) return void res.destroy();
  if (url.pathname === "/auth/token") {
    const f = new URLSearchParams(corpo);
    if (f.get("grant_type") === "refresh_token") {
      if (!refreshOk) return json({ error: "invalid_grant", error_description: "Token is not active" }, 400);
      renovacoes++;
      tokenValido = `A${renovacoes + 1}`;
      return json({ access_token: tokenValido, refresh_token: `R${renovacoes + 1}`, expires_in: 300 });
    }
    return f.get("code") === "bom" ? json({ access_token: "A1", refresh_token: "R1", expires_in: 300 }) : json({ error: "invalid_grant" }, 400);
  }
  if (req.headers.authorization !== `Bearer ${tokenValido}`) return json({ error: "unauthorized" }, 401);
  const m = req.method ?? "GET";
  chamadas.push(`${m} ${url.pathname}`);
  const P = url.pathname;
  const d = `/api/dealer/${DEALER}`;
  if (P === "/api/vehicle/v1.0/makes/CAR") return json([{ id: 1, name: "Fiat" }, { id: 2, name: "Volkswagen" }]);
  if (P === "/api/vehicle/v1.0/models/CAR/1") return json([{ id: 10, name: "Argo" }, { id: 11, name: "Mobi" }]);
  if (P.startsWith("/api/vehicle/v1.0/trims/CAR/")) return json([{ id: P.endsWith("/10") ? 100 : 101, name: "1.0 Firefly Flex Drive Manual", initialYear: 2018, finalYear: 2024 }]);
  if (P === "/api/vehicle/v1.0/colors") return json([{ id: 1, name: "Branco" }, { id: 2, name: "Prata" }]);
  if (P === "/api/vehicle/v1.0/fuels") return json([{ id: 1, name: "Flex" }]);
  if (P === "/api/vehicle/v1.0/transmissions") return json([{ id: 1, name: "Manual" }, { id: 2, name: "Automático" }]);
  if (P === "/api/vehicle/v1.1/features/CAR") return json([{ id: 7, name: "Ar condicionado" }]);
  if (P === `${d}/locality`) return json([{ id: 55 }]);
  if (P === `${d}/inventory/v1.0` && m === "GET") return json(url.searchParams.get("page") === "0" ? [...deals.values()] : []);
  if (P === `${d}/inventory/v1.0` && m === "POST") {
    const b = JSON.parse(corpo);
    for (const c of ["trimId", "colorId", "fuelId", "transmissionId", "price", "km", "doors"]) if (b[c] === undefined || b[c] === null) return json({ message: `${c} obrigatório` }, 400);
    const id = proximo++;
    deals.set(id, { ...b, id, images: [], publishes: [] });
    return json({ id });
  }
  const mi = P.match(new RegExp(`^${d}/inventory/v1\\.0/(\\d+)(?:/image(?:/(\\d+))?)?$`));
  if (mi) {
    const deal = deals.get(Number(mi[1]));
    if (!deal) return json({ message: "não encontrado" }, 404);
    if (P.includes("/image")) {
      if (m === "GET") return json(deal.images);
      if (m === "POST") { for (const i of JSON.parse(corpo)) deal.images.push({ imageId: proximaImagem++, url: i.url, position: i.position }); return json({}); }
      if (m === "DELETE") { deal.images = deal.images.filter((i) => i.imageId !== Number(mi[2])); return json(undefined, 204); }
    }
    if (m === "PUT") { Object.assign(deal, JSON.parse(corpo)); return json(deal); }
    if (m === "DELETE") { deals.delete(deal.id); return json(undefined, 204); }
  }
  const mp = P.match(/^\/api\/publish\/v1\.0\/dealer\/\d+\/deal\/(\d+)\/(publish|unpublish)$/);
  if (mp) {
    const deal = deals.get(Number(mp[1]));
    if (!deal) return json({ message: "não encontrado" }, 404);
    deal.publishes = mp[2] === "publish" ? [{ plan: { id: url.searchParams.get("planId") } }] : [];
    return json({});
  }
  json({ message: "rota desconhecida" }, 404);
});

const n = (rotulo: string) => chamadas.filter((c) => c === rotulo).length;

async function main() {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  Object.assign(process.env, { MOBIAUTO_API_URL: base, MOBIAUTO_AUTH_URL: `${base}/auth`, MOBIAUTO_CLIENT_ID: "zap", MOBIAUTO_CLIENT_SECRET: "segredo" });
  const { prisma } = await import("@dilon-zap/db");
  const { cicloMobiauto, cifrar, assinarFoto, guardarContaMobiauto, contaMobiautoGuardada, trocarCodigoMobiauto, appMobiautoDoAmbiente, urlDeAutorizacaoMobiauto } = await import("./index");

  // ---- OAuth ----
  const app = appMobiautoDoAmbiente("https://zap.exemplo.com.br")!;
  const q = new URL(urlDeAutorizacaoMobiauto(app, "estado1")).searchParams;
  checa("URL de autorização com cliente, retorno e state", [q.get("client_id"), q.get("redirect_uri"), q.get("state"), q.get("response_type")], ["zap", "https://zap.exemplo.com.br/api/portais/mobiauto/retorno", "estado1", "code"]);
  const tk = await trocarCodigoMobiauto(app, "bom");
  checa("código vira token de acesso e de renovação", [tk.access, tk.refresh], ["A1", "R1"]);
  checa("código inválido é recusado", await trocarCodigoMobiauto(app, "ruim").then(() => "passou", (e) => e.message.startsWith("A MobiAuto recusou")), true);

  await prisma.tenant.deleteMany({ where: { slug: "teste-mobiauto" } });
  const t0 = await prisma.tenant.create({ data: { name: "Loja MobiAuto", slug: "teste-mobiauto" } });
  const chave = randomBytes(32);
  const segredo = "segredo-fotos";
  const op = { chave, segredoFotos: segredo, urlBase: "https://zap.exemplo.com.br" };
  const guardada = () => guardarContaMobiauto({ dealerId: DEALER, access: "A1", refresh: "R1", expiraEm: Date.now() + 3_600_000 }, chave);
  const conta = await prisma.portalConta.create({ data: { tenantId: t0.id, portal: "MOBIAUTO", status: "CONECTADA", accessTokenCripto: guardada(), planoPadrao: "P1" } });

  let seq = 0;
  const novo = async (marca: string, modelo: string, extra: object = {}) => {
    const placa = seq++ === 0 ? "RMO1H85" : `RMO2H${String(seq).padStart(2, "0")}`;
    const v = await prisma.veiculo.create({ data: { tenantId: t0.id, marca, modelo, versao: "1.0 FIREFLY FLEX DRIVE MANUAL 4P", anoFabricacao: 2021, anoModelo: 2021, km: 31000, kmInformado: true, cor: "Branco", combustivel: "Flex", cambio: "Manual", opcionais: ["Ar condicionado"], precoCents: 5_599_999, status: "DISPONIVEL", origem: "COMPRA", placa, ...extra } });
    const fts = [await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: v.id, key: `k/${v.id}-1.jpg`, ordem: 0 } }), await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: v.id, key: `k/${v.id}-2.jpg`, ordem: 1 } })];
    await prisma.publicacaoPortal.create({ data: { tenantId: t0.id, veiculoId: v.id, portal: "MOBIAUTO", idEnviado: v.id.slice(-12) } });
    return { v, fts };
  };
  const estado = (v: { id: string }) => prisma.publicacaoPortal.findUniqueOrThrow({ where: { veiculoId_portal: { veiculoId: v.id, portal: "MOBIAUTO" } } });

  // O mapa puro: a regra da km.
  const sem = montarDealMobiauto({ tipo: "CARRO", marca: "Fiat", modelo: "Argo", versao: null, anoFabricacao: 2021, anoModelo: 2021, km: 0, kmInformado: false, cor: "Branco", combustivel: "Flex", cambio: "Manual", portas: 4, precoCents: 5_000_000, fotos: ["x"], opcionais: [], descricao: null, placa: null, id: "a" } as any, { trim: 1, cor: 1, cambio: 1, combustivel: 1 }, "P1");
  checa("mapa: sem km informada não monta o anúncio", sem.ok === false && sem.faltando.includes("Informar a quilometragem do carro (a MobiAuto exige a km)"), true);

  const a = await novo("Fiat", "Argo");
  const b = await novo("Fiat", "Argo", { km: 0, kmInformado: false });
  const c = await novo("Ferrari", "F40");

  // 1) Primeira rodada.
  const r1 = await cicloMobiauto(op);
  const pa = await estado(a.v);
  checa("Argo: publicado, com o código do deal", [pa.status, pa.idExterno, r1.enviados], ["PUBLICADO", "100", 1]);
  const d100 = deals.get(100)!;
  checa("o deal chegou com versão, cor, preço, km, placa, loja e opcional do catálogo", [d100.trimId, d100.colorId, d100.fuelId, d100.transmissionId, d100.price, d100.km, d100.plate, d100.localityId, d100.featureIds, d100.vehicleType, d100.stockKind], [100, 1, 1, 1, 55999.99, 31000, "RMO1H85", 55, [7], "CAR", "USED"]);
  checa("as 2 fotos foram por endereço assinado, na ordem", d100.images.map((i) => i.url), a.fts.map((f) => `https://zap.exemplo.com.br/api/portais/foto/${f.id}/${assinarFoto(f.id, segredo)}.jpg`));
  checa("publicado no plano padrão", d100.publishes, [{ plan: { id: "P1" } }]);
  const pb = await estado(b.v);
  checa("sem km informada: NÃO publica e diz por quê", [pb.status, pb.idExterno, pb.erro], ["FILA", null, "Falta para anunciar: Informar a quilometragem do carro (a MobiAuto exige a km)"]);
  checa("marca fora do catálogo: pendência clara", (await estado(c.v)).erro?.includes('Marca "Ferrari" não identificada'), true);
  checa("só 1 deal criado", n(`POST /api/dealer/${DEALER}/inventory/v1.0`), 1);

  // 2) Nada mudou.
  const antes = chamadas.length;
  await cicloMobiauto(op);
  checa("rodada sem mudança não escreve na MobiAuto", chamadas.slice(antes).filter((x) => !x.startsWith("GET")), []);

  // 3) Preço novo.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { precoCents: 5_299_999 } });
  await cicloMobiauto(op);
  checa("preço novo: PUT no mesmo deal, sem criar, sem mexer nas fotos nem republicar", [deals.get(100)!.price, n(`POST /api/dealer/${DEALER}/inventory/v1.0`), deals.get(100)!.images.length, n("PUT /api/publish/v1.0/dealer/26274/deal/100/publish")], [52999.99, 1, 2, 1]);

  // 4) Foto nova: refaz as fotos.
  const f3 = await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: a.v.id, key: `k/${a.v.id}-3.jpg`, ordem: 2 } });
  await cicloMobiauto(op);
  checa("foto nova: as fotos da MobiAuto passam a ser as da ficha", deals.get(100)!.images.map((i) => i.url).length, 3);
  void f3;

  // 5) Adoção: o carro já está na MobiAuto (publicado por outro sistema).
  deals.set(9001, { id: 9001, plate: "AAA1B23", km: 90000, price: 30000, images: [{ imageId: 500, url: "https://velho/f.jpg", position: 0 }], publishes: [{ plan: { id: "X" } }] });
  const incluidosAntes = n(`POST /api/dealer/${DEALER}/inventory/v1.0`);
  const adot = await novo("Fiat", "Argo", { placa: "AAA-1B23", km: 45000, precoCents: 4_599_900 });
  await cicloMobiauto(op);
  const pAdot = await estado(adot.v);
  checa("carro que já estava na MobiAuto: adotado, sem criar outro", [pAdot.status, pAdot.idExterno, n(`POST /api/dealer/${DEALER}/inventory/v1.0`) - incluidosAntes], ["PUBLICADO", "9001", 0]);
  checa("o deal adotado recebeu os dados do Zap e as fotos do Zap, e não foi publicado de novo", [deals.get(9001)!.price, deals.get(9001)!.km, deals.get(9001)!.images.map((i) => i.url).length, n("PUT /api/publish/v1.0/dealer/26274/deal/9001/publish")], [45999, 45000, 2, 0]);

  // 6) Reservado: sai do ar, o deal fica; volta: atualiza e publica de novo (sem criar).
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "RESERVADO" } });
  await cicloMobiauto(op);
  const pr = await estado(a.v);
  checa("reservado: despublicado, deal mantido e código guardado", [pr.status, pr.idExterno, deals.has(100), deals.get(100)!.publishes.length], ["REMOVIDO", "100", true, 0]);
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "DISPONIVEL" } });
  await cicloMobiauto(op);
  checa("voltou a disponível: publicado de novo, mesmo deal", [(await estado(a.v)).status, deals.get(100)!.publishes.length, n(`POST /api/dealer/${DEALER}/inventory/v1.0`) - incluidosAntes], ["PUBLICADO", 1, 0]);

  // 7) Vendido: despublica e apaga o deal.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "VENDIDO" } });
  await cicloMobiauto(op);
  const pv = await estado(a.v);
  checa("vendido: deal apagado, REMOVIDO e sem código", [pv.status, pv.idExterno, deals.has(100)], ["REMOVIDO", null, false]);

  // 8) Token vencido: renova sozinho e grava o novo.
  tokenValido = "ZZ";
  await prisma.veiculo.update({ where: { id: adot.v.id }, data: { precoCents: 4_000_000 } });
  await cicloMobiauto(op);
  const guardadaDepois = contaMobiautoGuardada((await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } })).accessTokenCripto, chave);
  checa("401: renovou o token, seguiu e guardou o token novo", [deals.get(9001)!.price, renovacoes, guardadaDepois.access, guardadaDepois.refresh], [40000, 1, tokenValido, "R2"]);

  // 9) MobiAuto fora do ar: a conta avisa, o carro segue.
  fora = true;
  await prisma.veiculo.update({ where: { id: adot.v.id }, data: { precoCents: 4_100_000 } });
  await cicloMobiauto(op);
  fora = false;
  const cf = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("fora do ar: o carro segue publicado e a conta avisa (sem ir para erro)", [(await estado(adot.v)).status, cf.status, cf.erro], ["PUBLICADO", "CONECTADA", "A MobiAuto não respondeu"]);

  // 10) Renovação recusada: reconexão.
  refreshOk = false;
  tokenValido = "OUTRO";
  await prisma.veiculo.update({ where: { id: adot.v.id }, data: { precoCents: 4_200_000 } });
  await cicloMobiauto(op);
  const ce = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("renovação recusada: conta em erro", [ce.status, ce.erro?.includes("recusou")], ["ERRO", true]);
  const antesErro = chamadas.length;
  await cicloMobiauto(op);
  checa("conta em erro não é chamada", chamadas.length, antesErro);
  void guardada;

  await prisma.tenant.delete({ where: { id: t0.id } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
