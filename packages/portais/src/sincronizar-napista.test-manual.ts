// Sincronização com o NaPista de ponta a ponta: Postgres + servidor falso (OAuth e API).
// Rodar com: DATABASE_URL=postgresql://... npx tsx packages/portais/src/sincronizar-napista.test-manual.ts
import http from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { cambioNapista, combustivelNapista, corNapista, equipamentosNapista, montarOfertaNapista } from "./napista/mapa";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// ---- O NaPista falso --------------------------------------------------------------------------
type Oferta = Record<string, any> & { id: string; status: string; photos: { url: string; order: number }[] };
const ofertas = new Map<string, Oferta>();
const chamadas: string[] = [];
let proximo = 1;
const MAX_FOTOS_DO_NAPISTA = 20;
let tokenValido = "A1";
let refreshOk = true;
let fora = false;
let renovacoes = 0;
let corpoDoToken = "";
const SELLER = "aaaa-seller";

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    const json = (o: unknown, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(o === undefined ? "" : JSON.stringify(o)); };
    if (fora) return void res.destroy();
    if (url.pathname === "/auth/token") {
      corpoDoToken = corpo;
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
    const P = url.pathname;
    chamadas.push(`${m} ${P}`);
    const s = `/seller/${SELLER}`;
    if (P === "/seller/access") return json({ sellers: [{ sellerId: SELLER, name: "Sales Automóveis", sellerDocument: "20458995000146" }] });
    if (P === "/catalog/attributes") {
      const lista = (ids: string[]) => ({ items: ids.map((id) => ({ id, name: id.charAt(0) + id.slice(1).toLowerCase() })) });
      return json({
        colors: lista(["WHITE", "BLACK", "SILVER", "GRAY", "BURGUNDY", "RED", "NAVY", "BLUE", "GREEN", "YELLOW", "ORANGE", "BROWN", "BEIGE", "GOLD", "BRONZE", "PINK", "PURPLE", "PEARLED", "TURQUOISE"]),
        fuelTypes: lista(["HYBRID", "ELECTRIC", "NGV", "FLEX", "DIESEL", "ALCOHOL", "GASOLINE"]),
        transmissionTypes: lista(["MANUAL", "AUTOMATIC"]),
        equipments: lista(["CAR_1_AIRBAG", "CAR_1_ARCONDICIONADO", "CAR_1_DIRECAOELETRICA", "CAR_2_SENSORDEESTACIONAMENTO", "CAR_2_4X4"]),
      });
    }
    if (P === "/catalog/makes/CAR") return json({ items: [{ id: "mk-fiat", name: "Fiat" }, { id: "mk-vw", name: "Volkswagen" }] });
    if (P === "/catalog/CAR/make/mk-fiat/models") return json({ items: url.searchParams.get("modelYear") === "2021" ? [{ id: "md-argo", name: "Argo" }, { id: "md-mobi", name: "Mobi" }] : [] });
    if (P === "/catalog/versions/CAR") return json({ items: url.searchParams.get("modelId") === "md-argo" ? [{ id: "v-argo-drive", name: "1.0 Firefly Flex Drive Manual" }, { id: "v-argo-trek", name: "1.3 Trekking Automático" }] : [] });
    if (P === `${s}/offers`) {
      const st = url.searchParams.get("status");
      const lista = [...ofertas.values()].filter((o) => o.status === st);
      return json({ pageNumber: 0, pageSize: 100, totalElements: lista.length, totalPages: 1, pageData: url.searchParams.get("page") === "0" ? lista : [] });
    }
    if (P === `${s}/offer` && m === "POST") {
      const b = JSON.parse(corpo);
      for (const c of ["versionId", "transmissionType", "color", "fuelType", "price", "manufacturedYear", "modelYear"]) if (b[c] === undefined || b[c] === null) return json({ message: `${c} obrigatório` }, 400);
      const id = `of-${proximo++}`;
      ofertas.set(id, { ...b, id, status: b.status ?? "DRAFT", photos: [] });
      return json({ ...b, id }, 201);
    }
    const mo = P.match(new RegExp(`^${s}/offer/([^/]+)(?:/(.+))?$`));
    if (mo) {
      const o = ofertas.get(mo[1]);
      if (!o) return json({ message: "não encontrado" }, 404);
      if (!mo[2] && m === "PATCH") { const b = JSON.parse(corpo); delete b.status; Object.assign(o, b); return json(o); }
      if (!mo[2] && m === "DELETE") { o.status = "DELETED"; return json(undefined, 204); }
      // Como o NaPista de verdade: as fotos por endereço SOMAM às existentes, há um limite por anúncio e dá para apagar todas.
      if (mo[2] === "photos/url" && m === "POST") {
        const novas = JSON.parse(corpo).list;
        if (o.photos.length + novas.length > MAX_FOTOS_DO_NAPISTA) return json({ message: "The maximum number of photos in this Offer has been reached!" }, 412);
        o.photos = [...o.photos, ...novas];
        return json({});
      }
      if (mo[2] === "photos" && m === "DELETE") { o.photos = []; return json(undefined, 204); }
      if (!mo[2] && m === "GET") return json(o);
      if (m === "PUT" && ["PUBLISHED", "DRAFT", "UNPUBLISHED", "SOLD", "DELETED"].includes(mo[2])) { o.status = mo[2]; return json({}); }
    }
    if (P === `${s}/leads`) return json({ pageNumber: 1, pageSize: 200, totalElements: 2, totalPages: 1, pageData: [{ id: "L1", clientName: "João Lima", clientEmail: "JOAO@X.COM", clientPhone: { phoneType: "MOBILE", areaCode: "21", number: "998765432" }, vehicleVersion: "Fiat Argo 1.0 Drive", contactMessage: "Aceita troca?", updatedAt: "2026-11-14T15:00:00Z", vehiclePlate: "rmo-1h85", upfrontValue: 10000, installments: 48, clientCreditStatus: "PRE_APPROVED" }, { id: "L2", clientName: "Ana", vehicleVersion: "x", updatedAt: "2026-11-14T16:00:00Z" }] });
    json({ message: "rota desconhecida" }, 404);
  });
});
const n = (rotulo: string) => chamadas.filter((c) => c === rotulo).length;

async function main() {
  // ---- o mapa puro ----
  checa("cores, combustível e câmbio da ficha viram os valores do NaPista", [corNapista("Prata"), corNapista("Cinza Grafite"), corNapista("Furta-cor"), combustivelNapista("Flex"), combustivelNapista("Híbrido"), cambioNapista("CVT"), cambioNapista("Manual"), cambioNapista(null)], ["SILVER", "GRAY", null, "FLEX", "HYBRID", "AUTOMATIC", "MANUAL", null]);
  checa("opcionais reconhecidos viram equipamentos", equipamentosNapista(["Ar-condicionado, Direção elétrica", "Câmera de ré", "Tapete de borracha"]), ["CAR_1_ARCONDICIONADO", "CAR_1_DIRECAOELETRICA", "CAR_2_SENSORDEESTACIONAMENTO"]);
  const base0 = { tipo: "CARRO", marca: "Fiat", modelo: "Argo", versao: "1.0 4P", anoFabricacao: 2021, anoModelo: 2021, km: 0, kmInformado: false, cor: "Branco", combustivel: "Flex", cambio: "Manual", portas: null, precoCents: 5_599_999, fotos: ["x"], opcionais: [], descricao: null, placa: null, id: "a" } as any;
  const sem = montarOfertaNapista(base0, "v1");
  checa("mapa: sem km informada o anúncio sai sem o campo (a km é opcional no NaPista)", sem.ok === true && sem.oferta.mileage === undefined, true);
  const com = montarOfertaNapista({ ...base0, km: 31000, kmInformado: true }, "v1");
  checa("mapa: preço inteiro em reais, portas pelo '4P' da versão", com.ok && [com.oferta.price, com.oferta.numberOfDoors, com.oferta.mileage], [56000, 4, 31000]);

  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  Object.assign(process.env, { NAPISTA_API_URL: base, NAPISTA_AUTH_URL: `${base}/auth`, NAPISTA_CLIENT_ID: "dilon_tech" });
  const { prisma } = await import("@dilon-zap/db");
  const { cicloNapista, assinarFoto, guardarContaNapista, contaNapistaGuardada, trocarCodigoNapista, appNapistaDoAmbiente, urlDeAutorizacaoNapista, SessaoNapista } = await import("./index");

  // ---- OAuth (cliente público: sem segredo) ----
  const app = appNapistaDoAmbiente("https://zap.exemplo.com.br")!;
  const q = new URL(urlDeAutorizacaoNapista(app, "estado1")).searchParams;
  checa("URL de autorização com cliente, retorno e state", [q.get("client_id"), q.get("redirect_uri"), q.get("state"), q.get("response_type")], ["dilon_tech", "https://zap.exemplo.com.br/api/portais/napista/retorno", "estado1", "code"]);
  const tk = await trocarCodigoNapista(app, "bom");
  checa("código vira token; a troca não manda segredo", [tk.access, tk.refresh, corpoDoToken.includes("client_secret")], ["A1", "R1", false]);
  checa("código inválido é recusado", await trocarCodigoNapista(app, "ruim").then(() => "passou", (e) => e.message.startsWith("O NaPista recusou")), true);
  const sLeads = new SessaoNapista({ access: "A1", refresh: "R1", expiraEm: Date.now() + 3_600_000 }, SELLER, app);
  checa("lojas do usuário", await sLeads.lojas(), [{ id: SELLER, nome: "Sales Automóveis", documento: "20458995000146" }]);
  const leads = await sLeads.leads("2026-11-01", "2026-11-15");
  checa("leads: nome, e-mail, telefone com DDD, placa, mensagem, entrada e crédito", [leads.length, leads[0].nome, leads[0].email, leads[0].telefone, leads[0].placa, leads[0].mensagem, leads[0].entradaCents, leads[0].parcelas, leads[0].credito, leads[1].telefone], [2, "João Lima", "joao@x.com", "21998765432", "RMO1H85", "Aceita troca?", 1_000_000, 48, "PRE_APPROVED", null]);

  await prisma.tenant.deleteMany({ where: { slug: "teste-napista" } });
  const t0 = await prisma.tenant.create({ data: { name: "Loja NaPista", slug: "teste-napista" } });
  const chave = randomBytes(32);
  const segredo = "segredo-fotos";
  const op = { chave, segredoFotos: segredo, urlBase: "https://zap.exemplo.com.br" };
  const conta = await prisma.portalConta.create({ data: { tenantId: t0.id, portal: "NAPISTA", status: "CONECTADA", accessTokenCripto: guardarContaNapista({ sellerId: SELLER, access: "A1", refresh: "R1", expiraEm: Date.now() + 3_600_000 }, chave) } });

  let seq = 0;
  const novo = async (marca: string, modelo: string, extra: object = {}) => {
    const placa = seq++ === 0 ? "RMO1H85" : `RMO2H${String(seq).padStart(2, "0")}`;
    const v = await prisma.veiculo.create({ data: { tenantId: t0.id, marca, modelo, versao: "1.0 FIREFLY FLEX DRIVE MANUAL 4P", anoFabricacao: 2021, anoModelo: 2021, km: 31000, kmInformado: true, cor: "Branco", combustivel: "Flex", cambio: "Manual", opcionais: ["Ar condicionado"], precoCents: 5_599_900, status: "DISPONIVEL", origem: "COMPRA", placa, ...extra } });
    const fts = [await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: v.id, key: `k/${v.id}-1.jpg`, ordem: 0 } }), await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: v.id, key: `k/${v.id}-2.jpg`, ordem: 1 } })];
    await prisma.publicacaoPortal.create({ data: { tenantId: t0.id, veiculoId: v.id, portal: "NAPISTA", idEnviado: v.id.slice(-12) } });
    return { v, fts };
  };
  const estado = (v: { id: string }) => prisma.publicacaoPortal.findUniqueOrThrow({ where: { veiculoId_portal: { veiculoId: v.id, portal: "NAPISTA" } } });
  const POST_OFERTA = `POST /seller/${SELLER}/offer`;

  const a = await novo("Fiat", "Argo");
  const b = await novo("Fiat", "Argo", { km: 0, kmInformado: false });
  const c = await novo("Ferrari", "F40");
  const d = await novo("Fiat", "Argo", { cor: "Furta-cor" });

  // 1) Primeira rodada.
  const r1 = await cicloNapista(op);
  const pa = await estado(a.v);
  checa("Argo: publicado, com o código do anúncio", [pa.status, pa.idExterno, r1.enviados], ["PUBLICADO", "of-1", 1]);
  const o1 = ofertas.get("of-1")!;
  checa("o anúncio chegou com versão, cor, combustível, câmbio, preço, km, placa, portas e equipamento", [o1.versionId, o1.color, o1.fuelType, o1.transmissionType, o1.price, o1.mileage, o1.plate, o1.numberOfDoors, o1.equipments, o1.status], ["v-argo-drive", "WHITE", "FLEX", "MANUAL", 55999, 31000, "RMO1H85", 4, ["CAR_1_ARCONDICIONADO"], "PUBLISHED"]);
  checa("as 2 fotos foram por endereço assinado, na ordem", o1.photos, a.fts.map((f, i) => ({ url: `https://zap.exemplo.com.br/api/portais/foto/${f.id}/${assinarFoto(f.id, segredo)}.jpg`, order: i })));
  const pb = await estado(b.v);
  checa("sem km informada: publica SEM o campo de km (nunca um número inventado)", [pb.status, pb.idExterno, ofertas.get("of-2")?.mileage], ["PUBLICADO", "of-2", undefined]);
  checa("marca fora do catálogo: pendência clara", (await estado(c.v)).erro?.includes('Marca "Ferrari" não identificada'), true);
  checa("cor que o NaPista não tem: pendência clara", (await estado(d.v)).erro, "Falta para anunciar: O NaPista não reconheceu a cor do carro: confira a cor na ficha");
  checa("2 anúncios criados (o Argo e o sem km)", n(POST_OFERTA), 2);

  // 2) Nada mudou.
  const antes = chamadas.length;
  await cicloNapista(op);
  checa("rodada sem mudança não escreve no NaPista", chamadas.slice(antes).filter((x) => !x.startsWith("GET")), []);

  // 3) Preço novo: atualiza o mesmo anúncio, sem mexer nas fotos.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { precoCents: 5_299_900 } });
  await cicloNapista(op);
  checa("preço novo: PATCH no mesmo anúncio, sem criar e sem reenviar fotos", [ofertas.get("of-1")!.price, n(POST_OFERTA), n(`POST /seller/${SELLER}/offer/of-1/photos/url`)], [52999, 2, 1]);

  // 4) Foto nova: reenvia a lista de fotos.
  await prisma.fotoVeiculo.create({ data: { tenantId: t0.id, veiculoId: a.v.id, key: `k/${a.v.id}-3.jpg`, ordem: 2 } });
  await cicloNapista(op);
  checa("foto nova: as fotos do anúncio passam a ser as da ficha", ofertas.get("of-1")!.photos.length, 3);

  // 5) Adoção: o carro já está no NaPista (publicado por outro sistema), pausado.
  ofertas.set("of-velho", { id: "of-velho", plate: "AAA1B23", mileage: 90000, price: 30000, status: "UNPUBLISHED", photos: [{ url: "https://velho/f.jpg", order: 0 }] });
  const criadosAntes = n(POST_OFERTA);
  const adot = await novo("Fiat", "Argo", { placa: "AAA-1B23", km: 45000, precoCents: 4_599_900 });
  await cicloNapista(op);
  const pAdot = await estado(adot.v);
  checa("carro que já estava no NaPista: adotado, sem criar outro", [pAdot.status, pAdot.idExterno, n(POST_OFERTA) - criadosAntes], ["PUBLICADO", "of-velho", 0]);
  checa("o anúncio adotado recebeu os dados e as fotos do Zap e voltou ao ar", [ofertas.get("of-velho")!.price, ofertas.get("of-velho")!.mileage, ofertas.get("of-velho")!.photos.length, ofertas.get("of-velho")!.status], [45999, 45000, 2, "PUBLISHED"]);

  // 6) Reservado: pausa; volta: republica o mesmo anúncio.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "RESERVADO" } });
  await cicloNapista(op);
  const pr = await estado(a.v);
  checa("reservado: anúncio pausado e código guardado", [pr.status, pr.idExterno, ofertas.get("of-1")!.status], ["REMOVIDO", "of-1", "UNPUBLISHED"]);
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "DISPONIVEL" } });
  await cicloNapista(op);
  checa("voltou a disponível: no ar de novo, mesmo anúncio", [(await estado(a.v)).status, ofertas.get("of-1")!.status, n(POST_OFERTA) - criadosAntes], ["PUBLICADO", "PUBLISHED", 0]);

  // 7) Vendido: status SOLD. Desligado pela loja: apagado.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "VENDIDO" } });
  await cicloNapista(op);
  const pv = await estado(a.v);
  checa("vendido: marcado como vendido no NaPista, REMOVIDO e sem código", [pv.status, pv.idExterno, ofertas.get("of-1")!.status], ["REMOVIDO", null, "SOLD"]);

  // 8) Token vencido: renova sozinho e guarda o novo.
  tokenValido = "ZZ";
  await prisma.veiculo.update({ where: { id: adot.v.id }, data: { precoCents: 4_000_000 } });
  await cicloNapista(op);
  const g = contaNapistaGuardada((await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } })).accessTokenCripto, chave);
  checa("401: renovou o token, seguiu e guardou o token novo", [ofertas.get("of-velho")!.price, renovacoes, g.access, g.refresh], [40000, 1, tokenValido, "R2"]);

  // 9) A loja desliga o anúncio: apaga no NaPista.
  await prisma.publicacaoPortal.update({ where: { id: pAdot.id }, data: { ativo: false } });
  await cicloNapista(op);
  checa("anúncio desligado pela loja: apagado no NaPista", [(await estado(adot.v)).status, (await estado(adot.v)).idExterno, ofertas.get("of-velho")!.status], ["REMOVIDO", null, "DELETED"]);

  // 10) NaPista fora do ar: a conta avisa, sem ir para erro.
  const e2 = await novo("Fiat", "Argo");
  fora = true;
  await cicloNapista(op);
  fora = false;
  const cf = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("fora do ar: a conta avisa e continua conectada; o carro fica na fila", [cf.status, cf.erro, (await estado(e2.v)).status], ["CONECTADA", "O NaPista não respondeu", "FILA"]);

  // 11) Renovação recusada: reconexão.
  refreshOk = false;
  tokenValido = "OUTRO";
  await cicloNapista(op);
  const ce = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("renovação recusada: conta em erro", [ce.status, ce.erro?.includes("recusou")], ["ERRO", true]);
  const antesErro = chamadas.length;
  await cicloNapista(op);
  checa("conta em erro não é chamada", chamadas.length, antesErro);

  await prisma.tenant.delete({ where: { id: t0.id } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
