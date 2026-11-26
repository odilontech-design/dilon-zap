// Sincronização com o Mercado Livre de ponta a ponta: Postgres + servidor falso (OAuth e API de anúncios).
// O servidor falso segue as regras da documentação oficial (lida em 26/11/2026), não a API real.
// Rodar com: DATABASE_URL=postgresql://... npx tsx packages/portais/src/sincronizar-mercadolivre.test-manual.ts
import http from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { cambioMercadoLivre, combustivelMercadoLivre, descricaoParaMercadoLivre, montarItemMercadoLivre, opcionaisMercadoLivre, telefoneParaMercadoLivre, tituloMercadoLivre } from "./mercadolivre/mapa";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// ---- O Mercado Livre falso ---------------------------------------------------------------------
type Item = Record<string, any> & { id: string; status: string; description?: string; deleted?: boolean };
const itens = new Map<string, Item>();
const chamadas: string[] = [];
let proximo = 1;
let tokenValido = "A1";
let refreshOk = true;
let fora = false;
let renovacoes = 0;
let vagas = 5;
const refreshesUsados: string[] = [];
let corpoDoToken = "";
const VENDEDOR = "1944040506";

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  let corpo = "";
  req.on("data", (c) => (corpo += c));
  req.on("end", () => {
    const json = (o: unknown, s = 200) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(o === undefined ? "" : JSON.stringify(o)); };
    if (fora) return void res.destroy();
    if (url.pathname === "/oauth/token") {
      corpoDoToken = corpo;
      const f = new URLSearchParams(corpo);
      if (f.get("client_secret") !== "segredo-ml") return json({ message: "invalid client" }, 400);
      if (f.get("grant_type") === "refresh_token") {
        const r = f.get("refresh_token")!;
        // O refresh token do Mercado Livre é de uso único: o segundo uso do mesmo é recusado.
        if (!refreshOk || refreshesUsados.includes(r)) return json({ message: "invalid_grant" }, 400);
        refreshesUsados.push(r);
        renovacoes++;
        tokenValido = `A${renovacoes + 1}`;
        return json({ access_token: tokenValido, refresh_token: `R${renovacoes + 1}`, expires_in: 21600, user_id: Number(VENDEDOR) });
      }
      return f.get("code") === "bom" ? json({ access_token: "A1", refresh_token: "R1", expires_in: 21600, user_id: Number(VENDEDOR) }) : json({ message: "invalid_grant" }, 400);
    }
    if (req.headers.authorization !== `Bearer ${tokenValido}`) return json({ message: "invalid_token" }, 401);
    const m = req.method ?? "GET";
    const P = url.pathname;
    chamadas.push(`${m} ${P}`);
    if (P === "/users/me") return json({ id: Number(VENDEDOR), nickname: "SALES.AUTOMOVEIS", email: "sales@exemplo.com" });
    if (P === `/users/${VENDEDOR}/classifieds_promotion_packs`) return json([{ id: "pk1", status: "active", package_content: "publications", remaining_listings: vagas }, { id: "pk2", status: "active", package_content: "upgrades", remaining_listings: 9 }]);
    if (P === "/items" && m === "POST") {
      const b = JSON.parse(corpo);
      const erro = (message: string) => json({ message: "validation error", error: "validation_error", status: 400, cause: [{ code: "x", message }] }, 400);
      if (b.category_id !== "MLB1744") return erro("categoria deve ser MLB1744");
      if (b.buying_mode !== "classified") return erro("buying_mode deve ser classified");
      if (!Array.isArray(b.channels) || !b.channels.includes("marketplace")) return erro("channels deve ter marketplace");
      if (b.available_quantity !== 1) return erro("available_quantity deve ser 1");
      if (b.currency_id !== "BRL" || !(b.price > 0)) return erro("preço e moeda obrigatórios");
      if (!Array.isArray(b.pictures) || b.pictures.length < 1) return erro("LTP_PICTURE_REQUIRED (173)");
      const sc = b.seller_contact ?? {};
      if (!sc.country_code2 || !sc.phone2) return erro("seller_contact.phone2.required");
      if (!/^\d+$/.test(String(sc.country_code2)) || !/^\d+$/.test(String(sc.phone2))) return erro("seller_contact.phone2.invalid");
      const ids = (b.attributes ?? []).map((a: any) => a.id);
      for (const o of ["BRAND", "MODEL", "LICENSE_PLATE", "VIN_LAST_DIGITS"]) if (!ids.includes(o)) return erro(`atributo ${o} obrigatório`);
      if (b.description) return erro("a descrição vai em POST /items/{id}/description");
      if (vagas <= 0) return json({ message: "sem pacote" }, 403);
      vagas--;
      const id = `MLB${4000 + proximo++}`;
      itens.set(id, { ...b, id, status: "active" });
      return json({ id, status: "active", permalink: `https://carro.mercadolivre.com.br/${id}` }, 201);
    }
    const mi = P.match(/^\/items\/([^/]+)(?:\/(description))?$/);
    if (mi) {
      const it = itens.get(mi[1]);
      if (!it) return json({ message: "item não encontrado" }, 404);
      if (mi[2] === "description") { it.description = JSON.parse(corpo).plain_text; return json({}, m === "POST" ? 201 : 200); }
      if (m === "GET") return json({ id: it.id, status: it.status, permalink: `https://carro.mercadolivre.com.br/${it.id}` });
      if (m === "PUT") {
        const b = JSON.parse(corpo);
        if (b.status) it.status = b.status;
        if (b.deleted) { if (it.status !== "closed") return json({ message: "só item fechado pode ser excluído" }, 400); it.deleted = true; }
        for (const k of ["price", "pictures", "attributes", "seller_contact"]) if (b[k] !== undefined) it[k] = b[k];
        return json({ id: it.id });
      }
    }
    json({ message: "rota desconhecida" }, 404);
  });
});
const n = (rotulo: string) => chamadas.filter((c) => c === rotulo).length;

async function main() {
  // ---- o mapa puro ----
  checa("combustível e câmbio da ficha", [combustivelMercadoLivre("Flex"), combustivelMercadoLivre("Híbrido"), combustivelMercadoLivre("GNV"), cambioMercadoLivre("CVT"), cambioMercadoLivre("Manual"), cambioMercadoLivre(null)], ["Flex", "Híbrido", "GNV", "Automática", "Manual", null]);
  checa("opcionais reconhecidos viram atributos do Mercado Livre", opcionaisMercadoLivre(["Ar-condicionado, Alarme", "Câmera de ré", "Tapete de borracha"]), ["HAS_AIR_CONDITIONING", "HAS_ALARM", "HAS_PARKING_SENSOR"]);
  checa("telefone da loja: com e sem 55, fixo e celular, lixo", [telefoneParaMercadoLivre("(21) 99393-9417"), telefoneParaMercadoLivre("5521993999417"), telefoneParaMercadoLivre("2133334444"), telefoneParaMercadoLivre("123")], [{ ddd: "21", numero: "993939417" }, { ddd: "21", numero: "993999417" }, { ddd: "21", numero: "33334444" }, null]);
  checa("descrição sem telefone, e-mail e site (o Mercado Livre penaliza)", descricaoParaMercadoLivre("Carro impecável! Ligue (21) 99393-9417 ou veja www.sales.com.br, joao@x.com. Único dono."), "Carro impecável! Ligue ou veja Único dono.");
  checa("título: cabe em 60 caracteres sem perder marca, modelo e ano", [tituloMercadoLivre({ marca: "Fiat", modelo: "Argo", versao: "1.0", anoModelo: 2021 }), tituloMercadoLivre({ marca: "Volkswagen", modelo: "Gol", versao: "1.6 MSI Total Flex Highline Automatizado 4 Portas Completo", anoModelo: 2021 }).length <= 60, tituloMercadoLivre({ marca: "Volkswagen", modelo: "Gol", versao: "1.6 MSI Total Flex Highline Automatizado 4 Portas Completo", anoModelo: 2021 }).startsWith("Volkswagen Gol")], ["Fiat Argo 1.0 2021", true, true]);
  const loja0 = { nome: "Sales", whatsapp: "21993999417", cep: "25085-015", endereco: "Rua Silva Fernandes, 395", email: null, site: null };
  const base0 = { id: "a", tipo: "CARRO", placa: "RMO1H85", chassi: "9BD195A12M0123456", renavam: null, marca: "Fiat", modelo: "Argo", versao: "1.0 4P", anoFabricacao: 2021, anoModelo: 2021, km: 31000, kmInformado: true, cor: "Branco", combustivel: "Flex", cambio: "Manual", portas: null, opcionais: ["Ar-condicionado"], precoCents: 5_599_999, descricao: "Ótimo estado", fotos: ["https://f/1.jpg"] } as any;
  const sem = montarItemMercadoLivre({ ...base0, kmInformado: false, chassi: null, placa: null, fotos: [] }, { ...loja0, whatsapp: null });
  checa("mapa: sem km, placa, chassi, foto e WhatsApp não monta e diz tudo o que falta", sem.ok === false && sem.faltando.length, 5);
  const com = montarItemMercadoLivre(base0, loja0);
  checa("mapa: classificado, categoria, quantidade 1, canal e pacote silver", com.ok && [com.item.category_id, com.item.buying_mode, com.item.available_quantity, com.item.channels, com.item.listing_type_id, com.item.currency_id, com.item.price], ["MLB1744", "classified", 1, ["marketplace"], "silver", "BRL", 56000]);
  checa("mapa: contato completo, só dígitos (country_code2 e phone2)", com.ok && [com.item.seller_contact], [{ contact: "Sales", country_code: "55", area_code: "21", phone: "993999417", country_code2: "55", phone2: "21993999417", email: "", webpage: "" }]);
  checa("mapa: placa, 6 últimos do chassi, km e condição nos atributos", com.ok && (com.item.attributes as any[]).filter((a) => ["LICENSE_PLATE", "VIN_LAST_DIGITS", "KILOMETERS", "ITEM_CONDITION", "TRANSMISSION"].includes(a.id)).map((a) => `${a.id}=${a.value_name}`), ["KILOMETERS=31000 km", "TRANSMISSION=Manual", "LICENSE_PLATE=RMO1H85", "VIN_LAST_DIGITS=123456", "ITEM_CONDITION=Usado"]);
  checa("mapa: a descrição NÃO vai no corpo do anúncio (é recurso à parte)", com.ok && ["description" in com.item, com.descricao], [false, "Ótimo estado"]);
  checa("mapa: no máximo 6 fotos (limite da documentação)", montarItemMercadoLivre({ ...base0, fotos: Array.from({ length: 9 }, (_, i) => `u${i}`) }, loja0).ok && (montarItemMercadoLivre({ ...base0, fotos: Array.from({ length: 9 }, (_, i) => `u${i}`) }, loja0) as any).item.pictures.length, 6);

  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  Object.assign(process.env, { MERCADOLIVRE_API_URL: base, MERCADOLIVRE_AUTH_URL: "https://auth.mercadolivre.com.br", MERCADOLIVRE_CLIENT_ID: "app-dilon", MERCADOLIVRE_CLIENT_SECRET: "segredo-ml" });
  const { prisma } = await import("@dilon-zap/db");
  const { cicloMercadoLivre, assinarFoto, guardarContaMercadoLivre, contaMercadoLivreGuardada, trocarCodigoMercadoLivre, appMercadoLivreDoAmbiente, urlDeAutorizacaoMercadoLivre, SessaoMercadoLivre } = await import("./index");

  // ---- OAuth (cliente confidencial) ----
  const app = appMercadoLivreDoAmbiente("https://zap.exemplo.com.br")!;
  const q = new URL(urlDeAutorizacaoMercadoLivre(app, "estado1")).searchParams;
  checa("URL de autorização com cliente, retorno e state", [q.get("client_id"), q.get("redirect_uri"), q.get("state"), q.get("response_type")], ["app-dilon", "https://zap.exemplo.com.br/api/portais/mercadolivre/retorno", "estado1", "code"]);
  const tk = await trocarCodigoMercadoLivre(app, "bom");
  checa("código vira token e a troca manda o segredo do app", [tk.access, tk.refresh, tk.userId, corpoDoToken.includes("client_secret=segredo-ml")], ["A1", "R1", VENDEDOR, true]);
  checa("código inválido é recusado", await trocarCodigoMercadoLivre(app, "ruim").then(() => "passou", (e) => e.message.startsWith("O Mercado Livre recusou")), true);
  const s0 = new SessaoMercadoLivre({ access: "A1", refresh: "R1", expiraEm: Date.now() + 3_600_000 }, VENDEDOR, app);
  checa("quem autorizou", await s0.eu(), { id: VENDEDOR, apelido: "SALES.AUTOMOVEIS", email: "sales@exemplo.com" });
  checa("vagas: só pacote de publicação ativo conta (destaque não)", await s0.vagas(), 5);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-ml", "teste-ml-b"] } } });
  const t0 = await prisma.tenant.create({ data: { name: "Loja ML", slug: "teste-ml" } });
  const tb = await prisma.tenant.create({ data: { name: "Outra loja", slug: "teste-ml-b" } });
  await prisma.veiculosConfig.create({ data: { tenantId: t0.id, nomeLoja: "Sales Automóveis", whatsapp: "21993999417", cepAnuncios: "25085015", endereco: "Rua Silva Fernandes, 395" } });
  const chave = randomBytes(32);
  const op = { chave, segredoFotos: "segredo-fotos", urlBase: "https://zap.exemplo.com.br" };
  const conta = await prisma.portalConta.create({ data: { tenantId: t0.id, portal: "MERCADO_LIVRE", status: "CONECTADA", accessTokenCripto: guardarContaMercadoLivre({ vendedorId: VENDEDOR, access: "A1", refresh: "R1", expiraEm: Date.now() + 3_600_000 }, chave) } });

  let seq = 0;
  const novo = async (tenantId: string, extra: object = {}) => {
    seq++;
    const v = await prisma.veiculo.create({ data: { tenantId, marca: "Fiat", modelo: "Argo", versao: "1.0 FIREFLY FLEX DRIVE MANUAL 4P", anoFabricacao: 2021, anoModelo: 2021, km: 31000, kmInformado: true, cor: "Branco", combustivel: "Flex", cambio: "Manual", opcionais: ["Ar condicionado"], precoCents: 5_599_900, status: "DISPONIVEL", origem: "COMPRA", placa: `RMO${seq}H${String(seq).padStart(2, "0")}`, chassi: `9BD195A12M01234${String(seq).padStart(2, "0")}`, descricao: "Carro revisado.", ...extra } });
    const fts = [await prisma.fotoVeiculo.create({ data: { tenantId, veiculoId: v.id, key: `k/${v.id}-1.jpg`, ordem: 0 } }), await prisma.fotoVeiculo.create({ data: { tenantId, veiculoId: v.id, key: `k/${v.id}-2.jpg`, ordem: 1 } })];
    await prisma.publicacaoPortal.create({ data: { tenantId, veiculoId: v.id, portal: "MERCADO_LIVRE", idEnviado: v.id.slice(-12) } });
    return { v, fts };
  };
  const estado = (v: { id: string }) => prisma.publicacaoPortal.findUniqueOrThrow({ where: { veiculoId_portal: { veiculoId: v.id, portal: "MERCADO_LIVRE" } } });

  const a = await novo(t0.id);
  const b = await novo(t0.id, { km: 0, kmInformado: false });
  const c = await novo(t0.id, { chassi: null });
  const deB = await novo(tb.id); // outra loja, sem conta no portal: nunca pode ser tocada

  // 1) Primeira rodada.
  const r1 = await cicloMercadoLivre(op);
  const pa = await estado(a.v);
  checa("Argo: publicado, com o código e o link do anúncio", [pa.status, pa.idExterno, pa.url, r1.enviados], ["PUBLICADO", "MLB4001", "https://carro.mercadolivre.com.br/MLB4001", 1]);
  const i1 = itens.get("MLB4001")!;
  checa("o anúncio chegou classificado, silver, com fotos por endereço assinado e contato completo", [i1.buying_mode, i1.listing_type_id, i1.pictures, i1.seller_contact.phone2], ["classified", "silver", a.fts.map((f) => ({ source: `https://zap.exemplo.com.br/api/portais/foto/${f.id}/${assinarFoto(f.id, "segredo-fotos")}.jpg` })), "21993999417"]);
  checa("a descrição foi enviada à parte, depois de criar", [i1.description, n("POST /items/MLB4001/description")], ["Carro revisado.", 1]);
  checa("sem km: NÃO publica e diz por quê", [(await estado(b.v)).status, (await estado(b.v)).idExterno, (await estado(b.v)).erro], ["FILA", null, "Falta para anunciar: Informar a quilometragem do carro (o Zap não anuncia carro sem km)"]);
  checa("sem chassi: pendência clara", (await estado(c.v)).erro?.includes("Informar o chassi"), true);
  checa("só 1 anúncio criado", n("POST /items"), 1);
  checa("isolamento: o carro de outra loja (sem conta no portal) não foi tocado", [(await estado(deB.v)).status, (await estado(deB.v)).idExterno], ["FILA", null]);

  // 2) Nada mudou.
  const antes = chamadas.length;
  await cicloMercadoLivre(op);
  checa("rodada sem mudança não escreve no Mercado Livre", chamadas.slice(antes).filter((x) => !x.startsWith("GET")), []);

  // 3) Preço novo: atualiza o mesmo anúncio (sem criar outro e sem gastar vaga).
  const vagasAntes = vagas;
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { precoCents: 5_299_900 } });
  await cicloMercadoLivre(op);
  checa("preço novo: PUT no mesmo anúncio, sem criar e sem gastar vaga", [itens.get("MLB4001")!.price, n("POST /items"), vagas === vagasAntes], [52999, 1, true]);

  // 4) Sem vaga no pacote: avisa e não cria; com vaga de novo, publica.
  vagas = 0;
  await prisma.veiculo.update({ where: { id: b.v.id }, data: { km: 20000, kmInformado: true } });
  const r4 = await cicloMercadoLivre(op);
  const pb = await estado(b.v);
  checa("sem vaga: não tenta criar, mostra o motivo e agenda nova tentativa", [n("POST /items"), pb.status, pb.erro?.includes("Sem vaga no pacote"), pb.proximaTentativaEm !== null, r4.erros], [1, "ERRO", true, true, 1]);
  const contaOk = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("sem vaga não derruba a conta", [contaOk.status, contaOk.erro], ["CONECTADA", null]);
  vagas = 3;
  await prisma.publicacaoPortal.update({ where: { id: pb.id }, data: { proximaTentativaEm: new Date(Date.now() - 1000) } });
  await cicloMercadoLivre(op);
  checa("com vaga de novo: publica e gasta 1 vaga", [(await estado(b.v)).status, n("POST /items"), vagas], ["PUBLICADO", 2, 2]);

  // 5) Reservado: pausa; volta: reativa o mesmo anúncio.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "RESERVADO" } });
  await cicloMercadoLivre(op);
  const pr = await estado(a.v);
  checa("reservado: anúncio pausado e código guardado", [pr.status, pr.idExterno, itens.get("MLB4001")!.status], ["REMOVIDO", "MLB4001", "paused"]);
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "DISPONIVEL" } });
  await cicloMercadoLivre(op);
  checa("voltou a disponível: ativo de novo, mesmo anúncio, sem criar outro", [(await estado(a.v)).status, itens.get("MLB4001")!.status, n("POST /items")], ["PUBLICADO", "active", 2]);

  // 6) Vendido: fecha. Desligado pela loja: fecha e exclui.
  await prisma.veiculo.update({ where: { id: a.v.id }, data: { status: "VENDIDO" } });
  await cicloMercadoLivre(op);
  const pv = await estado(a.v);
  checa("vendido: anúncio fechado, REMOVIDO e sem código", [pv.status, pv.idExterno, itens.get("MLB4001")!.status], ["REMOVIDO", null, "closed"]);
  await prisma.publicacaoPortal.update({ where: { veiculoId_portal: { veiculoId: b.v.id, portal: "MERCADO_LIVRE" } }, data: { ativo: false } });
  await cicloMercadoLivre(op);
  const idB = itens.get("MLB4002")!;
  checa("desligado pela loja: fechado e excluído no Mercado Livre", [(await estado(b.v)).status, (await estado(b.v)).idExterno, idB.status, idB.deleted], ["REMOVIDO", null, "closed", true]);

  // 7) Token vencido: renova sozinho; o refresh token novo é guardado (uso único).
  tokenValido = "ZZ";
  const d = await novo(t0.id);
  await cicloMercadoLivre(op);
  const g = contaMercadoLivreGuardada((await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } })).accessTokenCripto, chave);
  checa("401: renovou, publicou e guardou access e refresh novos", [(await estado(d.v)).status, renovacoes, g.access, g.refresh], ["PUBLICADO", 1, tokenValido, "R2"]);

  // 8) Mercado Livre fora do ar: a conta avisa, sem ir para erro.
  const e2 = await novo(t0.id);
  fora = true;
  await cicloMercadoLivre(op);
  fora = false;
  const cf = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("fora do ar: a conta avisa e continua conectada; o carro fica na fila", [cf.status, cf.erro, (await estado(e2.v)).status], ["CONECTADA", "O Mercado Livre não respondeu", "FILA"]);

  // 9) Renovação recusada: reconexão.
  refreshOk = false;
  tokenValido = "OUTRO";
  await cicloMercadoLivre(op);
  const ce = await prisma.portalConta.findUniqueOrThrow({ where: { id: conta.id } });
  checa("renovação recusada: conta em erro", [ce.status, ce.erro?.includes("recusou")], ["ERRO", true]);
  const antesErro = chamadas.length;
  await cicloMercadoLivre(op);
  checa("conta em erro não é chamada", chamadas.length, antesErro);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-ml", "teste-ml-b"] } } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((err) => { console.error(err); process.exit(1); });
