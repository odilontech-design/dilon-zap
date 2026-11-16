// "Meu site": banners, destaques, páginas e o painel. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/meu-site.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { completarDestaques, carrosEmDestaque, criarBanner, dadosDoSite, editarBanner, excluirBanner, imagemDoBanner, linkDeBanner, painelDoSite, salvarDestaques, salvarPaginas, bannersDaLoja } from "./meu-site";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const subidos: string[] = [];
const apagados: string[] = [];
const subir = async (key: string) => void subidos.push(key);
const img = (tipo = "image/jpeg", tamanho = 1000) => ({ tipo, tamanho, bytes: async () => Buffer.from("x") });

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-meu-site", "teste-meu-site-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Loja Site", slug: "teste-meu-site" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra", slug: "teste-meu-site-2" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "Gestor", email: "g-meu-site@t.com", passwordHash: "x", role: "OWNER" } });
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, vitrineAtiva: true } });
  const mk = (tenantId: string, extra: object = {}) => prisma.veiculo.create({ data: { tenantId, marca: "Fiat", modelo: "Argo", anoFabricacao: 2021, anoModelo: 2021, km: 1, kmInformado: true, precoCents: 5_000_000, status: "DISPONIVEL", origem: "COMPRA", naVitrine: true, ...extra } });
  const a = await mk(t.id), b = await mk(t.id), c = await mk(t.id, { status: "VENDIDO" }), x = await mk(t2.id);

  // links de banner
  checa("link de banner: página do site e https valem; http, javascript e lixo não", [linkDeBanner("/financiamento"), linkDeBanner("https://x.com/a"), linkDeBanner("http://x.com"), linkDeBanner("javascript:alert(1)"), linkDeBanner("//evil.com"), linkDeBanner("")], ["/financiamento", "https://x.com/a", null, null, null, null]);

  // banners
  checa("banner sem formato aceito é recusado", (await criarBanner(t.id, { desktop: img("image/gif") }, subir)).ok, false);
  checa("banner grande demais é recusado", (await criarBanner(t.id, { desktop: img("image/png", 7 * 1024 * 1024) }, subir)).ok, false);
  checa("banner com link inválido é recusado", (await criarBanner(t.id, { desktop: img(), link: "http://x" }, subir)).ok, false);
  const b1 = await criarBanner(t.id, { desktop: img(), celular: img("image/webp"), titulo: "Ofertas", link: "/financiamento" }, subir);
  const b2 = await criarBanner(t.id, { desktop: img(), titulo: "Black Friday" }, subir);
  checa("dois banners criados, com imagens de computador e celular enviadas", [b1.ok, b2.ok, subidos.length, subidos.every((k) => k.startsWith(`${t.id}/vitrine/banners/`))], [true, true, 3, true]);
  const id1 = b1.ok ? b1.id : "", id2 = b2.ok ? b2.id : "";
  checa("ordem: o primeiro enviado vem primeiro", (await bannersDaLoja(t.id)).map((x) => x.titulo), ["Ofertas", "Black Friday"]);
  await editarBanner(t.id, id2, { mover: "cima" });
  checa("subir o segundo troca a ordem", (await bannersDaLoja(t.id)).map((x) => x.titulo), ["Black Friday", "Ofertas"]);
  await editarBanner(t.id, id1, { ativo: false });
  checa("banner fora do ar some do site e a imagem dele não é servida", [(await bannersDaLoja(t.id)).map((x) => x.titulo), await imagemDoBanner(t.id, id1, false)], [["Black Friday"], null]);
  checa("imagem de celular: a do celular se houver, senão a do computador", [await imagemDoBanner(t.id, id2, true) === (await prisma.bannerVitrine.findUniqueOrThrow({ where: { id: id2 } })).chaveDesktop], [true]);
  checa("outra loja não mexe no banner", [(await editarBanner(t2.id, id2, { titulo: "x" })).ok, await excluirBanner(t2.id, id2, async (k) => void apagados.push(k)), await imagemDoBanner(t2.id, id2, false)], [false, false, null]);
  checa("apagar banner apaga as imagens dele", [await excluirBanner(t.id, id1, async (k) => void apagados.push(k)), apagados.length], [true, 2]);

  // destaques
  const s = await salvarDestaques(t.id, [b.id, a.id, b.id, x.id, "inexistente"], a.id);
  checa("destaques: só carros da loja, sem repetição, na ordem escolhida", s, { destaques: [b.id, a.id], ofertaVeiculoId: a.id });
  checa("oferta de outra loja vira 'sem oferta'", (await salvarDestaques(t.id, [a.id], x.id)).ofertaVeiculoId, null);
  checa("no máximo 8 destaques", (await salvarDestaques(t.id, Array.from({ length: 12 }, () => a.id).concat([b.id]), undefined)).destaques.length <= 8, true);
  await salvarDestaques(t.id, [c.id, b.id, a.id], null);
  checa("no site, destaque vendido cai fora sozinho", carrosEmDestaque([c.id, b.id, a.id], [a, b]).map((v) => v.id), [b.id, a.id]);

  const ids = (xs: { id: string }[]) => xs.map((v) => v.id);
  const c4 = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => ({ id }));
  checa("grade de destaques: completa a linha com os mais recentes (7 → 8; 4 fica 4; 0 fica 0; 3 → 4)", [ids(completarDestaques(c4.slice(0, 7), c4)), ids(completarDestaques(c4.slice(0, 4), c4)), ids(completarDestaques([], c4)), ids(completarDestaques([c4[8], c4[0], c4[1]], c4))], [["a", "b", "c", "d", "e", "f", "g", "h"], ["a", "b", "c", "d"], [], ["i", "a", "b", "c"]]);

  // páginas
  await salvarPaginas(t.id, { quemSomosTitulo: "  Tradição em Caxias  ", quemSomosTexto: "Somos a loja.", instagram: "@loja" });
  const dados = await dadosDoSite(t.id);
  checa("páginas salvas (com espaços tirados) e a lista de carros à venda", [dados.quemSomosTitulo, dados.quemSomosTexto, dados.instagram, dados.carros.length, dados.banners.length], ["Tradição em Caxias", "Somos a loja.", "@loja", 2, 1]);

  // painel
  const funil = await prisma.funil.create({ data: { tenantId: t.id, nome: "F" } }).catch(() => null);
  void funil;
  const contato = await prisma.contact.create({ data: { tenantId: t.id, waJid: "5521999990000@s.whatsapp.net", name: "Cliente" } });
  const etapa = await prisma.stage.findFirst({ where: { tenantId: t.id } }) ?? await prisma.stage.create({ data: { tenantId: t.id, funilId: (await prisma.funil.findFirstOrThrow({ where: { tenantId: t.id } })).id, name: "Novos", position: 0 } });
  const neg = (origem: string, dias: number) => prisma.negociacao.create({ data: { tenantId: t.id, contactId: contato.id, funilId: etapa.funilId!, stageId: etapa.id, titulo: "x", valorCents: 0, origem, createdAt: new Date(Date.now() - dias * 86_400_000) } });
  await neg("Site", 1); await neg("Site", 2); await neg("Site · Financiamento", 3); await neg("Site · Venda seu carro", 5); await neg("OLX", 1); await neg("Site", 40); await neg("Site", 45);
  const p = await painelDoSite(t.id);
  checa("painel: site no ar, carros à venda, contatos por formulário e variação", [p.site.noAr, p.veiculosNoSite, p.contatos30d, p.formularios, p.variacao], [true, 2, 4, { anuncio: 2, financiamento: 1, vendaSeuCarro: 1 }, 100]);
  checa("painel: avisa o destaque vendido e a falta de logo", [p.atencao.some((a) => a.texto.includes("já não estão à venda")), p.atencao.some((a) => a.texto.startsWith("Sem logo"))], [true, true]);
  void u;

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-meu-site", "teste-meu-site-2"] } } });
  await prisma.$disconnect();
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
