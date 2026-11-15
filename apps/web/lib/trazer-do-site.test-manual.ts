// "Trazer do site atual". Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/trazer-do-site.test-manual.ts [home.html empresa.html]
// Com os dois arquivos (páginas salvas de um site AutoCerto), também mostra o que sairia deles.
import { readFileSync } from "node:fs";
import { prisma } from "@dilon-zap/db";
import { PREFIXO_BANNER, bannersDaPagina, enderecoDaEmpresa, ofertasDaPagina, quemSomosDaPagina, trazerDoSite } from "./trazer-do-site";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// No formato do AutoCerto: cada banner repetido, ofertas depois do título, resumo cortado no rodapé.
const banner = (a: string) => `<li class="parallax"><div class="banner" style="background: url(https://www.autocerto.com/bannerscliente/0/${a}) center center no-repeat; height: 500px"></div></li>`;
const carro = (slug: string, id: number) => `<div class="result-item"><a href="/Veiculo/${slug}/${id}/detalhes" class="media-box"><img src="https://www.autocerto.com/fotos/520/${id}/1.jpg"></a><a href="/Veiculo/${slug}/${id}/detalhes">ver</a></div>`;
const HOME = `<html><body>
<nav><a href="/Empresa" title="Quem Somos">Empresa</a></nav>
${banner("banner73.jpg")}${banner("banner73.jpg")}${banner("banner64.jpg")}<div class="banner" style="height:3px"></div><div class="banner" style="background:url(/x.gif)"></div>
<a href="/Veiculo/gol-2010/111/detalhes">carro do topo, fora das ofertas</a>
<div class="section-header-1"><h3>ÚLTIMAS OFERTAS</h3></div>
${carro("cronos-2025", 5750506)}${carro("onix-2020", 5750507)}${carro("hb20-2019", 5750508)}
<div class="section-header-1"><h3>Marcas</h3></div>${carro("ka-2015", 999)}
<footer>…</footer></body></html>`;
const EMPRESA = `<html><body><div class="main" role="main">
<div class="listing-header"><span>Quem <strong>Somos</strong></span></div>
<p class="lead">Temos nos consagrado como uma das ag&#234;ncias de maior prest&#237;gio </p>
<div style="text-align: justify;"><p>N&#243;s da Loja somos especializados na venda de ve&#237;culos.<br />Nossos vendedores ter&#227;o o prazer em atend&#234;-lo.</p><p>Visite a loja e fa&#231;a um test drive com a gente.</p></div>
</div><footer><p style="text-align: justify">N&#243;s da Loja somos especializados na venda de ve&#237;culos. Nossos vendedores ter&#227;o o <a href="/empresa">[...]</a></p></footer></body></html>`;

async function main() {
  // leitura das páginas
  checa("banners: só os fundos de imagem dos blocos .banner, sem repetir, na ordem", bannersDaPagina(HOME, "https://loja.com.br/"), ["https://www.autocerto.com/bannerscliente/0/banner73.jpg", "https://www.autocerto.com/bannerscliente/0/banner64.jpg"]);
  checa("ofertas: só os carros do bloco Últimas ofertas, sem repetir", ofertasDaPagina(HOME), ["autocerto:5750506", "autocerto:5750507", "autocerto:5750508"]);
  checa("sem bloco de ofertas não inventa nada", ofertasDaPagina("<html><a href='/Veiculo/x/1/detalhes'></a></html>"), []);
  const qs = quemSomosDaPagina(EMPRESA);
  checa("quem somos: título da frase em destaque, texto completo do corpo (nada do rodapé cortado)", qs, { titulo: "Temos nos consagrado como uma das agências de maior prestígio", texto: "Nós da Loja somos especializados na venda de veículos.\nNossos vendedores terão o prazer em atendê-lo.\n\nVisite a loja e faça um test drive com a gente." });
  checa("página da empresa achada pelo menu", enderecoDaEmpresa(HOME, "https://loja.com.br/"), "https://loja.com.br/Empresa");

  // de ponta a ponta, com o site e as imagens falsos
  await prisma.tenant.deleteMany({ where: { slug: "teste-trazer-site" } });
  const t = await prisma.tenant.create({ data: { name: "Loja Trazer", slug: "teste-trazer-site" } });
  const mk = (siteOrigemId: string, status: "DISPONIVEL" | "VENDIDO" = "DISPONIVEL") => prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Cronos", anoFabricacao: 2025, anoModelo: 2025, km: 1, kmInformado: true, precoCents: 9_000_000, status, origem: "COMPRA", naVitrine: true, siteOrigemId } });
  const a = await mk("autocerto:5750506"), b = await mk("autocerto:5750508");
  await mk("autocerto:5750507", "VENDIDO");
  const buscados: string[] = [];
  const subidos: string[] = [];
  let baixados = 0;
  const dep = {
    buscar: async (u: string) => (buscados.push(u), { html: u.toLowerCase().includes("empresa") ? EMPRESA : HOME, urlFinal: u.toLowerCase().includes("empresa") ? u : "https://www.loja.com.br/" }),
    baixar: async (u: string) => {
      baixados++;
      if (u.includes("banner64")) throw new Error("o endereço respondeu 404");
      return { bytes: Buffer.from("img"), contentType: "image/jpeg" };
    },
    subir: async (k: string) => void subidos.push(k),
  };

  checa("sem endereço e sem site importado pede o endereço", await trazerDoSite(t.id, {}, dep), { ok: false, erro: "informe o endereço do site atual da loja" });
  const r1 = await trazerDoSite(t.id, { endereco: "loja.com.br/Veiculos?x=1" }, dep);
  checa("busca a página inicial (mesmo digitando outra página) e a da empresa", buscados, ["https://loja.com.br/", "https://www.loja.com.br/Empresa"]);
  const res1 = r1.ok ? r1.resultado : null;
  checa("banners: um trazido, o que falhou é contado com o motivo", [res1?.banners.trazidos, res1?.banners.falhas], [1, ["banner64: o endereço respondeu 404"]]);
  checa("banner trazido com título marcado e imagem enviada", [(await prisma.bannerVitrine.findMany({ where: { tenantId: t.id } })).map((x) => x.titulo), subidos.length], [[`${PREFIXO_BANNER}banner73`], 1]);
  checa("ofertas: só os carros importados e à venda, na ordem do site", [res1?.ofertas, (await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } })).destaques], [{ achadas: 3, noZap: 2, aplicadas: true }, [a.id, b.id]]);
  const cfg = await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } });
  checa("quem somos preenchido e o endereço não é guardado (não liga o espelho do estoque)", [res1?.quemSomos.aplicado, cfg.quemSomosTitulo?.startsWith("Temos nos consagrado"), cfg.siteOrigemUrl], [true, true, null]);

  // de novo: nada duplica nem sobrescreve
  await prisma.veiculosConfig.update({ where: { tenantId: t.id }, data: { destaques: [b.id], quemSomosTexto: "Meu texto" } });
  baixados = 0;
  const r2 = await trazerDoSite(t.id, { endereco: "https://loja.com.br" }, dep);
  const res2 = r2.ok ? r2.resultado : null;
  checa("segunda vez: banner já trazido não é baixado de novo", [res2?.banners.jaTinha, res2?.banners.trazidos, baixados, await prisma.bannerVitrine.count({ where: { tenantId: t.id } })], [1, 0, 1, 1]);
  const cfg2 = await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } });
  checa("segunda vez: destaques e Quem somos já preenchidos ficam como estão", [res2?.ofertas.aplicadas, res2?.quemSomos.aplicado, cfg2.destaques, cfg2.quemSomosTexto], [false, false, [b.id], "Meu texto"]);
  await trazerDoSite(t.id, { endereco: "https://loja.com.br", substituir: true }, dep);
  const cfg3 = await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } });
  checa("com 'substituir': troca destaques e Quem somos", [cfg3.destaques, cfg3.quemSomosTexto?.startsWith("Nós da Loja")], [[a.id, b.id], true]);

  const falhou = await trazerDoSite(t.id, { endereco: "https://loja.com.br" }, { ...dep, buscar: async () => { throw new Error("o site não respondeu"); } });
  checa("site fora do ar: erro claro", falhou, { ok: false, erro: "não consegui abrir o site: o site não respondeu" });

  await prisma.tenant.delete({ where: { id: t.id } });

  // páginas reais salvas (opcional)
  const [home, empresa] = process.argv.slice(2);
  if (home && empresa) {
    const h = readFileSync(home, "utf8"), e = readFileSync(empresa, "utf8");
    console.log("\nsite real:", { banners: bannersDaPagina(h, "https://site/"), ofertas: ofertasDaPagina(h), empresa: enderecoDaEmpresa(h, "https://site/"), quemSomos: quemSomosDaPagina(e) });
  }

  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
