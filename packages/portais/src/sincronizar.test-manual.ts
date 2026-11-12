// Sincronização com a OLX de ponta a ponta: Postgres de verdade + servidor falso da OLX.
// Rodar com: DATABASE_URL=postgresql://... npx tsx packages/portais/src/sincronizar.test-manual.ts
// (apaga e recria uma empresa de teste "teste-portais").
import http from "node:http";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

type Pedido = { metodo: string; caminho: string; corpo: any };
const pedidos: Pedido[] = [];
// O que o falso responde: por id, "erro -4" no import; e o status de cada id nos lotes.
const recusarNoImport = new Map<string, string>();
const statusPorId = new Map<string, { status: string; list_id?: string; url?: string; message?: string[] }>();
let tokenValido = "tok-loja-1";
let lotes = 0;

const servidor = http.createServer((req, res) => {
  let dados = "";
  req.on("data", (c) => (dados += c));
  req.on("end", () => {
    const corpo = dados ? JSON.parse(dados) : null;
    pedidos.push({ metodo: req.method!, caminho: req.url!, corpo });
    const responder = (s: number, j: unknown) => {
      res.writeHead(s, { "Content-Type": "application/json" });
      res.end(JSON.stringify(j));
    };
    if (corpo?.access_token !== tokenValido) return responder(401, { error: "invalid_token" });
    if (req.method === "PUT" && req.url === "/autoupload/import") {
      const erros = corpo.ad_list.filter((a: any) => recusarNoImport.has(a.id)).map((a: any) => ({ id: a.id, status: "error", messages: [{ category: recusarNoImport.get(a.id) }] }));
      if (erros.length) return responder(200, { token: null, statusCode: -4, statusMessage: "An ad had problems on import", errors: erros });
      lotes++;
      return responder(200, { token: `lote-${lotes}`, statusCode: 0, statusMessage: "The ads were imported and will be processed", errors: [] });
    }
    const m = req.url!.match(/^\/autoupload\/import\/(.+)$/);
    if (req.method === "POST" && m) {
      const ultimoDoLote = [...pedidos].reverse().find((p) => p.metodo === "PUT");
      const ids: string[] = ultimoDoLote?.corpo.ad_list.map((a: any) => a.id) ?? [];
      const ads = Object.fromEntries(ids.map((id) => [id, statusPorId.get(id) ?? { status: "pending" }]));
      const pronto = Object.values(ads).every((a: any) => a.status === "accepted" || a.status === "error" || a.status === "refused");
      return responder(200, { autoupload_status: pronto ? "done" : "pending", ads });
    }
    responder(404, {});
  });
});

async function main() {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  process.env.OLX_API_URL = base;
  process.env.OLX_AUTH_URL = base;

  const { prisma } = await import("@dilon-zap/db");
  const { cicloPortais, cifrar, idParaOlx, assinarFoto } = await import("./index");

  await prisma.tenant.deleteMany({ where: { slug: "teste-portais" } });
  const t = await prisma.tenant.create({ data: { name: "Loja Teste Portais", slug: "teste-portais" } });
  const chave = randomBytes(32);
  const segredo = "segredo-fotos";
  const op = { chave, segredoFotos: segredo, urlBase: "https://zap.exemplo.com.br" };
  await prisma.portalConta.create({ data: { tenantId: t.id, portal: "OLX", status: "CONECTADA", accessTokenCripto: cifrar(tokenValido, chave) } });
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, cepAnuncios: "24020005", telefoneAnuncios: "21993999417" } });

  const novo = (marca: string, modelo: string, placa: string | null, preco: number) =>
    prisma.veiculo.create({
      data: { tenantId: t.id, marca, modelo, versao: "1.0", anoFabricacao: 2022, anoModelo: 2023, km: 30000, combustivel: "Flex", cambio: "Manual", precoCents: preco, status: "DISPONIVEL", origem: "COMPRA", placa },
    });
  const a = await novo("Fiat", "Argo", "ABC1D23", 7_500_000);
  const b = await novo("Fiat", "Mobi", "XYZ9A87", 5_500_000);
  const c = await novo("Fiat", "Pulse", "QWE1R23", 9_900_000);
  const fotoA = await prisma.fotoVeiculo.create({ data: { tenantId: t.id, veiculoId: a.id, key: "k/a1.jpg", ordem: 0 } });
  await prisma.fotoVeiculo.create({ data: { tenantId: t.id, veiculoId: b.id, key: "k/b1.jpg", ordem: 0 } });
  await prisma.fotoVeiculo.create({ data: { tenantId: t.id, veiculoId: c.id, key: "k/c1.jpg", ordem: 0 } });
  const cat = { marca: "21", modelo: "100", versao: "7" };
  const pub = (v: { id: string }, catalogo: object | null) =>
    prisma.publicacaoPortal.create({ data: { tenantId: t.id, veiculoId: v.id, portal: "OLX", idEnviado: idParaOlx(v.id), catalogo: catalogo ?? undefined } });
  await pub(a, cat);
  await pub(b, null); // sem catálogo: não pode ir
  await pub(c, cat);
  const estado = async (v: { id: string }) => prisma.publicacaoPortal.findUniqueOrThrow({ where: { veiculoId_portal: { veiculoId: v.id, portal: "OLX" } } });
  const puts = () => pedidos.filter((p) => p.metodo === "PUT");

  // 1) A OLX recusa o Pulse: o lote inteiro volta, o Pulse fica com o motivo.
  recusarNoImport.set(idParaOlx(c.id), "ERROR_VEHICLE_VERSION_INVALID");
  await cicloPortais(op);
  checa("lote recusado por um anúncio", puts().length, 1);
  checa("Pulse com o motivo em português", [(await estado(c)).status, (await estado(c)).erro], ["ERRO", "Versão do catálogo da OLX inválida: escolha de novo"]);
  checa("Argo continua na fila", (await estado(a)).status, "FILA");
  checa("Mobi bloqueado sem catálogo", [(await estado(b)).status, (await estado(b)).erro?.startsWith("Falta para anunciar: Escolher marca")], ["FILA", true]);

  // 2) Próxima rodada: o Argo vai sozinho (o Pulse espera a próxima tentativa).
  await cicloPortais(op);
  const lote = puts().at(-1)!.corpo.ad_list;
  checa("só o Argo no lote", lote.map((x: any) => x.id), [idParaOlx(a.id)]);
  checa("token da loja no corpo", puts().at(-1)!.corpo.access_token, tokenValido);
  checa("foto com link assinado", lote[0].images, [`https://zap.exemplo.com.br/api/portais/foto/${fotoA.id}/${assinarFoto(fotoA.id, segredo)}.jpg`]);
  checa("preço em reais", lote[0].price, 75000);
  checa("Argo enviado", [(await estado(a)).status, (await estado(a)).loteToken], ["ENVIADO", "lote-1"]);

  // 3) A OLX aceita: fica no ar com o link.
  statusPorId.set(idParaOlx(a.id), { status: "accepted", list_id: "1234567", url: "https://www.olx.com.br/vi/1234567.htm" });
  await cicloPortais(op);
  const pa = await estado(a);
  checa("Argo no ar", [pa.status, pa.idExterno, pa.url], ["PUBLICADO", "1234567", "https://www.olx.com.br/vi/1234567.htm"]);
  const antes = puts().length;
  await cicloPortais(op);
  checa("nada mudou, nada enviado", puts().length, antes);

  // 4) Baixou o preço: reenvia o mesmo id (na OLX, insert com o mesmo id atualiza).
  await prisma.veiculo.update({ where: { id: a.id }, data: { precoCents: 7_290_000 } });
  await cicloPortais(op);
  checa("preço novo reenviado", [puts().length, puts().at(-1)!.corpo.ad_list[0].price, puts().at(-1)!.corpo.ad_list[0].operation], [antes + 1, 72900, "insert"]);
  await cicloPortais(op); // aceito de novo
  checa("de volta no ar", (await estado(a)).status, "PUBLICADO");

  // 5) Corrigiu o catálogo do Pulse: tenta na hora, sem esperar.
  recusarNoImport.clear();
  await prisma.publicacaoPortal.update({ where: { veiculoId_portal: { veiculoId: c.id, portal: "OLX" } }, data: { catalogo: { ...cat, versao: "8" } } });
  statusPorId.set(idParaOlx(c.id), { status: "refused", message: ["Fotos com marca d'água"] });
  await cicloPortais(op);
  checa("Pulse reenviado depois de corrigir", puts().at(-1)!.corpo.ad_list.map((x: any) => x.id), [idParaOlx(c.id)]);
  await cicloPortais(op);
  checa("recusa da moderação com o motivo", [(await estado(c)).status, (await estado(c)).erro], ["ERRO", "Fotos com marca d'água"]);

  // 6) Vendeu o Argo: sai do ar. Vendeu o Mobi (nunca foi): só some daqui.
  await prisma.veiculo.update({ where: { id: a.id }, data: { status: "VENDIDO" } });
  await prisma.veiculo.update({ where: { id: b.id }, data: { status: "VENDIDO" } });
  statusPorId.set(idParaOlx(a.id), { status: "accepted" });
  await cicloPortais(op);
  checa("delete do Argo", puts().at(-1)!.corpo.ad_list, [{ id: idParaOlx(a.id), operation: "delete" }]);
  checa("Argo saindo do ar", (await estado(a)).status, "REMOVENDO");
  checa("Mobi descartado sem chamar a OLX", (await estado(b)).status, "REMOVIDO");
  await cicloPortais(op);
  checa("Argo fora do ar", (await estado(a)).status, "REMOVIDO");

  // 7) A loja revogou o acesso na OLX: a conta pede reconexão.
  await prisma.veiculo.update({ where: { id: a.id }, data: { status: "DISPONIVEL" } });
  tokenValido = "outro";
  await cicloPortais(op);
  const conta = await prisma.portalConta.findFirstOrThrow({ where: { tenantId: t.id } });
  checa("conta em erro pedindo reconexão", [conta.status, conta.erro?.includes("reconecte")], ["ERRO", true]);
  const n = pedidos.length;
  await cicloPortais(op);
  checa("conta em erro não é chamada", pedidos.length, n);

  // 8) Plano sem permissão (-6): pela mensagem, a loja sabe o que contratar.
  tokenValido = "tok-loja-1";
  await prisma.portalConta.update({ where: { id: conta.id }, data: { status: "CONECTADA", erro: null } });
  servidor.removeAllListeners("request");
  servidor.on("request", (req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: null, statusCode: -6, statusMessage: "Without permission", errors: [] }));
    });
  });
  await cicloPortais(op);
  const c6 = await prisma.portalConta.findFirstOrThrow({ where: { tenantId: t.id } });
  checa("sem plano profissional", [c6.status, c6.erro], ["ERRO", "A conta da OLX não tem permissão para integrar: precisa de plano profissional"]);

  await prisma.tenant.delete({ where: { id: t.id } });
  await prisma.$disconnect();
  servidor.close();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
