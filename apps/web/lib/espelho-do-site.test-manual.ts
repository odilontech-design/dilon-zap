// Espelho do site atual. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/espelho-do-site.test-manual.ts
import fs from "node:fs";
import { prisma } from "@dilon-zap/db";
import { ErroPagina } from "./buscar-pagina";
import { pendentesDeConfirmacao, reativarCarroDoSite, registrarFalhaDoEspelho, sincronizarComSite } from "./espelho-do-site";
import { importarDoSite, ErroImportacaoSite } from "./importar-site-estoque";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const detalhe = fs.readFileSync("test-fixtures/site-autocerto-detalhe.html", "utf8");
// Um card no formato do AutoCerto, inventado.
const card = (id: number, modelo: string) => `<div class="result-item"><div class="col-md-6 fotoVeiculo"><a href="Veiculo/${modelo.toLowerCase()}-${id}/${id}/detalhes" class="media-box"><img src="https://www.autocerto.com/fotos/520/${id}/4_1.jpg"></a><span class="label vehicle-age">Flex</span></div><div class="col-md-6"><h4 class="result-item-title"><a href="Veiculo/${modelo.toLowerCase()}-${id}/${id}/detalhes">FIAT ${modelo}<br /><span class="versaoVeiculo">1.0</span></a></h4><div class="result-item-pricing"><div class="price">R$ Sob Consulta</div></div><ul class="listaEspecificacoes"><li><span>Ano</span><p>2020</p></li><li><span>Km</span><p>N/I</p></li><li><span>Cor</span><p>Branco</p></li><li><span>Câmbio</span><p>Manual</p></li></ul></div></div>`;
const pagina = (ids: [number, string][]) => `<div class="lista-veiculos">${ids.map(([i, m]) => card(i, m)).join("")}</div>`;

let site: [number, string][] = [];
let fora = false;
const buscar = async (url: string) => {
  if (fora) throw new ErroPagina("o site não respondeu");
  if (/detalhes$/.test(url)) return { html: detalhe, urlFinal: url };
  return { html: pagina(site), urlFinal: url };
};

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-espelho", "teste-espelho-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Loja Espelho", slug: "teste-espelho" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "Dono", email: "dono@espelho.teste", passwordHash: "x", role: "OWNER" } });
  const base = { tenantId: t.id, userId: u.id, buscar };
  const carro = (siteId: string) => prisma.veiculo.findFirstOrThrow({ where: { tenantId: t.id, siteOrigemId: `autocerto:${siteId}` } });

  const semConfig = await sincronizarComSite(base).then(() => null, (e) => (e instanceof ErroImportacaoSite ? e.message.slice(0, 41) : String(e)));
  checa("loja sem importação prévia", semConfig, "esta loja ainda não importou o estoque de");

  site = [[1, "ARGO"], [2, "MOBI"], [3, "PULSE"]];
  await importarDoSite({ tenantId: t.id, userId: u.id, endereco: "www.espelho.com.br", simular: false, buscar });
  checa("a importação guarda o site de origem", (await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } })).siteOrigemUrl, "https://www.espelho.com.br");
  await prisma.veiculo.updateMany({ where: { tenantId: t.id }, data: { status: "DISPONIVEL", precoCents: 5_000_000 } });

  const r0 = await sincronizarComSite(base);
  checa("nada mudou: nada acontece", [r0.noSite, r0.novos, r0.sumiram, r0.voltaram, r0.travado], [3, 0, 0, 0, false]);

  // Saiu do site: escondido, não vendido.
  site = [[1, "ARGO"], [3, "PULSE"]];
  const r1 = await sincronizarComSite(base);
  const mobi = await carro("2");
  checa("saiu 1: escondido da vitrine, ainda à venda e marcado", [r1.sumiram, mobi.naVitrine, mobi.status, !!mobi.sumiuDoSiteEm], [1, false, "DISPONIVEL", true]);
  checa("os outros seguem na vitrine", [(await carro("1")).naVitrine, (await carro("3")).naVitrine], [true, true]);
  checa("fica na lista de confirmação", (await pendentesDeConfirmacao(t.id)).map((c) => c.modelo), ["MOBI"]);
  checa("histórico diz o que houve", (await prisma.eventoVeiculo.findFirstOrThrow({ where: { veiculoId: mobi.id, tipo: "site" } })).descricao.startsWith("Saiu do site www.espelho.com.br"), true);
  checa("resumo da sincronização guardado", (await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } })).siteSincResumo?.includes("1 saiu(ram) do site"), true);
  checa("sincronizar de novo não conta duas vezes", (await sincronizarComSite(base)).sumiram, 0);

  // Voltou ao site.
  site = [[1, "ARGO"], [2, "MOBI"], [3, "PULSE"]];
  const r2 = await sincronizarComSite(base);
  const mobi2 = await carro("2");
  checa("voltou: de volta à vitrine e fora da lista", [r2.voltaram, mobi2.naVitrine, mobi2.sumiuDoSiteEm, (await pendentesDeConfirmacao(t.id)).length], [1, true, null, 0]);

  // Saiu e a gestão diz "foi engano": não é escondido de novo e não duplica se reaparecer.
  site = [[1, "ARGO"], [3, "PULSE"]];
  await sincronizarComSite(base);
  checa("reativar um carro que não saiu devolve falso", await reativarCarroDoSite(t.id, (await carro("1")).id, u.id), false);
  checa("reativar o que saiu", await reativarCarroDoSite(t.id, (await carro("2")).id, u.id), true);
  await sincronizarComSite(base);
  const mobi3 = await carro("2");
  checa("reativado: continua na vitrine e não é escondido de novo", [mobi3.naVitrine, mobi3.sumiuDoSiteEm, mobi3.seguirSite], [true, null, false]);
  site = [[1, "ARGO"], [2, "MOBI"], [3, "PULSE"]];
  const r3 = await sincronizarComSite(base);
  checa("reapareceu no site depois de reativado: não duplica", [r3.novos, await prisma.veiculo.count({ where: { tenantId: t.id } })], [0, 3]);

  // Carro novo no site.
  site = [[1, "ARGO"], [2, "MOBI"], [3, "PULSE"], [4, "CRONOS"]];
  const r4 = await sincronizarComSite(base);
  const novo = await carro("4");
  checa("carro novo entra em preparação, com fotos a baixar", [r4.novos, novo.status, novo.fotosParaImportar.length > 0], [1, "PREPARACAO", true]);

  // Vendido no Zap e manual não são tocados.
  await prisma.veiculo.update({ where: { id: (await carro("3")).id }, data: { status: "VENDIDO" } });
  const manual = await prisma.veiculo.create({ data: { tenantId: t.id, marca: "VW", modelo: "Gol", anoFabricacao: 2015, anoModelo: 2015, km: 1, precoCents: 100, status: "DISPONIVEL", origem: "COMPRA" } });
  site = [[1, "ARGO"], [2, "MOBI"], [4, "CRONOS"]];
  const r5 = await sincronizarComSite(base);
  checa("vendido no Zap e carro cadastrado à mão não são mexidos", [r5.sumiram, (await carro("3")).naVitrine, (await prisma.veiculo.findUniqueOrThrow({ where: { id: manual.id } })).sumiuDoSiteEm], [0, true, null]);

  // Site fora do ar ou vazio: erro, nada muda.
  fora = true;
  const erroFora = await sincronizarComSite(base).then(() => "sem erro", (e) => (e instanceof ErroImportacaoSite ? "erro" : String(e)));
  fora = false;
  site = [];
  const erroVazio = await sincronizarComSite(base).then(() => "sem erro", (e) => (e instanceof ErroImportacaoSite ? "erro" : String(e)));
  checa("site fora do ar ou vazio dá erro em vez de esconder tudo", [erroFora, erroVazio, (await carro("1")).naVitrine], ["erro", "erro", true]);
  await registrarFalhaDoEspelho(t.id, "o site não respondeu");
  checa("a falha fica visível para a gestão", (await prisma.veiculosConfig.findUniqueOrThrow({ where: { tenantId: t.id } })).siteSincResumo?.startsWith("Falhou em"), true);

  // Trava: sumir carro demais de uma vez.
  const t2 = await prisma.tenant.create({ data: { name: "Loja Espelho 2", slug: "teste-espelho-2" } });
  site = Array.from({ length: 10 }, (_, i) => [100 + i, `M${i}`] as [number, string]);
  await importarDoSite({ tenantId: t2.id, userId: null, endereco: "www.espelho2.com.br", simular: false, buscar });
  await prisma.veiculo.updateMany({ where: { tenantId: t2.id }, data: { status: "DISPONIVEL", precoCents: 100 } });
  site = site.slice(0, 2);
  const r6 = await sincronizarComSite({ tenantId: t2.id, userId: null, buscar });
  checa("8 de 10 sumiram de uma vez: nada é escondido e avisa", [r6.travado, r6.sumiram, await prisma.veiculo.count({ where: { tenantId: t2.id, naVitrine: false } }), r6.resumo.includes("ATENÇÃO")], [true, 0, 0, true]);
  site = Array.from({ length: 10 }, (_, i) => [100 + i, `M${i}`] as [number, string]).slice(0, 8); // agora só 2 saíram
  const r7 = await sincronizarComSite({ tenantId: t2.id, userId: null, buscar });
  checa("2 de 10 sumiram: é normal, esconde", [r7.travado, r7.sumiram], [false, 2]);
  checa("importação sem autor (agendamento) funciona", (await prisma.eventoVeiculo.findFirst({ where: { veiculo: { tenantId: t2.id }, tipo: "site" } }))?.porId, null);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-espelho", "teste-espelho-2"] } } });
  await prisma.$disconnect();
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
