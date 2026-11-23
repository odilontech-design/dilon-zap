// "Sob consulta" e "Km n/a" no site público. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/vitrine-privacidade.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { fichaParaCliente } from "@dilon-zap/vendedor-ia";
import { aplicarPrivacidade, carroDaVitrine, carrosDaVitrine, lojaPublica } from "./vitrine";
import { descricaoDoCarro, llmsTxtDaLoja, textosDoGrupo, tituloDoCarro } from "./vitrine-seo";
import { feedJson, feedMetaCsv, feedXml, type CarroDoFeed } from "./feeds-estoque";
import { carroParaJsonLd } from "../app/loja/[slug]/dados-estruturados";
import { kmTexto, precoTexto, resumo } from "../app/loja/[slug]/comum";

const semNbsp = (t: string) => t.replace(/\u00a0/g, " ");
let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

async function main() {
  // regra pura
  const base = { ocultarKm: false, ocultarPreco: false, kmInformado: true, km: 31000, precoCents: 9_000_000 };
  const livre = { ocultarPrecoNoSite: false, ocultarKmNoSite: false };
  checa("nada escondido: tudo como está", aplicarPrivacidade(base, livre), base);
  checa("carro 'sob consulta': preço some (0) e a km fica", [aplicarPrivacidade({ ...base, ocultarPreco: true }, livre).precoCents, aplicarPrivacidade({ ...base, ocultarPreco: true }, livre).km], [0, 31000]);
  const km = aplicarPrivacidade({ ...base, ocultarKm: true }, livre);
  checa("carro 'km n/a': km some e vira não informada, preço fica", [km.kmInformado, km.km, km.ocultarKm, km.precoCents], [false, 0, true, 9_000_000]);
  const tudo = aplicarPrivacidade(base, { ocultarPrecoNoSite: true, ocultarKmNoSite: true });
  checa("regra da loja vale para todos os carros", [tudo.precoCents, tudo.ocultarPreco, tudo.ocultarKm, tudo.kmInformado], [0, true, true, false]);

  // textos do site
  checa("preço na tela: 'Sob consulta' ou o valor", [semNbsp(precoTexto({ precoCents: 9_000_000, ocultarPreco: false })), precoTexto({ precoCents: 0, ocultarPreco: true })], ["R$ 90.000", "Sob consulta"]);
  checa("km na tela: 'Km n/a', o valor, ou nada se nunca informada", [kmTexto({ km: 0, kmInformado: false, ocultarKm: true }), kmTexto({ km: 31000, kmInformado: true, ocultarKm: false }), kmTexto({ km: 0, kmInformado: false, ocultarKm: false })], ["Km n/a", "31.000 km", null]);
  checa("resumo do card com km n/a", resumo({ km: 0, kmInformado: false, ocultarKm: true, cambio: "Manual", combustivel: "Flex" }), "Km n/a · Manual · Flex");

  const carro = { id: "c1", marca: "Honda", modelo: "Civic", versao: "EXL", anoFabricacao: 2017, anoModelo: 2018, km: 0, kmInformado: false, cor: "Prata", combustivel: "Flex", cambio: "Automático", portas: 4, opcionais: [], descricao: null, status: "DISPONIVEL", tipo: "CARRO", entradaEm: new Date(), updatedAt: new Date(), fotos: [], caracteristicas: [], carroceria: null, videoUrl: null, ocultarKm: true, ocultarPreco: true, precoCents: 0 } as never;
  const loja = { nome: "Sales", endereco: "Av. X, 1 · Centro · Caxias/RJ" };
  checa("título do Google sem o preço", tituloDoCarro(carro, loja), "Honda Civic EXL 2017/2018 | Sales");
  checa("descrição do Google sem o preço nem 'R$'", /R\$/.test(descricaoDoCarro(carro, loja)), false);
  const llms = llmsTxtDaLoja({ nome: "Sales", slug: "s", dominio: null, endereco: null, whatsapp: null, horario: [], instagram: null, facebook: null, quemSomosTexto: null, quemSomosTitulo: null, sobre: null } as never, [carro]);
  checa("llms.txt diz 'valor sob consulta' e não traz R$", [llms.includes("valor sob consulta"), /R\$/.test(llms)], [true, false]);
  const g = textosDoGrupo(loja, "Honda", [carro]);
  checa("página da marca sem 'a partir de' quando nenhum preço aparece", [/a partir de/.test(g.descricao), /a partir de/.test(g.abertura)], [false, false]);
  const visivel = { ...(carro as object), ocultarPreco: false, precoCents: 8_000_000 } as never;
  checa("página da marca: o 'a partir de' conta só os preços à mostra", semNbsp(textosDoGrupo(loja, "Honda", [carro, visivel]).abertura).includes("a partir de R$ 80.000"), true);

  // Google (dados estruturados)
  checa("dados estruturados: sem oferta (sem preço) e sem km", ["offers" in carroParaJsonLd(carro, "https://x/c1", []), "mileageFromOdometer" in carroParaJsonLd(carro, "https://x/c1", [])], [false, false]);
  checa("dados estruturados: com preço, a oferta existe", "offers" in carroParaJsonLd(visivel, "https://x/c1", []), true);

  // feeds públicos
  const doFeed = (precoCents: number | null, id: string): CarroDoFeed => ({ id, marca: "Honda", modelo: "Civic", versao: null, anoFabricacao: 2017, anoModelo: 2018, km: null, cor: null, combustivel: null, cambio: null, portas: 4, opcionais: [], precoCents, descricao: null, status: "DISPONIVEL", diasEmEstoque: 1, url: "https://x/" + id, fotos: [] });
  const semPreco = doFeed(null, "oculto"), comPreco = doFeed(8_000_000, "aberto");
  const csv = feedMetaCsv({ nome: "L", endereco: null }, [semPreco, comPreco]);
  checa("catálogo da Meta: carro sob consulta fica de fora (a Meta exige preço)", [csv.includes("oculto"), csv.includes("aberto")], [false, true]);
  const xml = feedXml({ nome: "L", endereco: null }, [semPreco], new Date());
  checa("XML: sem o valor, com a marca de sob consulta", [xml.includes("<preco>"), xml.includes("<preco_sob_consulta>true")], [false, true]);
  const json = feedJson({ nome: "L", endereco: null }, [semPreco, comPreco], new Date()).veiculos;
  checa("JSON: preço nulo e aviso só no sob consulta; o outro segue igual", [json[0].preco, (json[0] as { precoSobConsulta?: boolean }).precoSobConsulta, json[1].preco, "precoSobConsulta" in json[1]], [null, true, 80000, false]);

  // WhatsApp (ficha)
  const f = { marca: "Honda", modelo: "Civic", anoFabricacao: 2017, anoModelo: 2018, km: 31000, kmInformado: true, precoCents: 9_000_000 };
  checa("ficha do WhatsApp padrão: valor e km (decisão humana no Inbox)", [fichaParaCliente(f).includes("R$"), fichaParaCliente(f).includes("31.000 km")], [true, true]);
  const fo = fichaParaCliente({ ...f, precoOculto: true, kmOculto: true });
  checa("ficha da IA: 'Valor sob consulta' e 'Km n/a', sem R$ nem a km", [fo.includes("Valor sob consulta"), fo.includes("Km n/a"), /R\$|31\.000/.test(fo)], [true, true, false]);

  // banco: o site público de verdade
  await prisma.tenant.deleteMany({ where: { slug: "teste-privacidade" } });
  const t = await prisma.tenant.create({ data: { name: "Loja Priv", slug: "teste-privacidade" } });
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VEICULOS", ativo: true, motivo: "teste" } });
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, vitrineAtiva: true } });
  const mk = (extra: object) => prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Argo", anoFabricacao: 2021, anoModelo: 2021, km: 45000, kmInformado: true, precoCents: 6_000_000, status: "DISPONIVEL", origem: "COMPRA", naVitrine: true, ...extra } });
  const a = await mk({}), b = await mk({ ocultarPreco: true }), c = await mk({ ocultarKm: true });
  let l = (await lojaPublica("teste-privacidade"))!;
  let carros = await carrosDaVitrine(l);
  const por = (id: string) => carros.find((x) => x.id === id)!;
  checa("site de verdade: A normal, B sem preço, C sem km", [por(a.id).precoCents, por(b.id).precoCents, por(b.id).ocultarPreco, por(c.id).km, por(c.id).ocultarKm, por(c.id).precoCents], [6_000_000, 0, true, 0, true, 6_000_000]);
  checa("página de um carro aplica a mesma regra", (await carroDaVitrine(l, b.id))?.precoCents, 0);
  await prisma.veiculosConfig.update({ where: { tenantId: t.id }, data: { ocultarPrecoNoSite: true, ocultarKmNoSite: true } });
  l = (await lojaPublica("teste-privacidade"))!;
  carros = await carrosDaVitrine(l);
  checa("regra da loja: todos sem preço e sem km", [carros.every((x) => x.precoCents === 0 && x.ocultarPreco), carros.every((x) => x.km === 0 && x.ocultarKm)], [true, true]);
  const real = await prisma.veiculo.findUniqueOrThrow({ where: { id: a.id } });
  checa("no banco o valor real continua intacto (portais, CRM e relatórios leem de lá)", [real.precoCents, real.km, real.ocultarPreco], [6_000_000, 45000, false]);

  await prisma.tenant.delete({ where: { id: t.id } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
