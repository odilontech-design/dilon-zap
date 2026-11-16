// Relatórios da revenda e contagem do site. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/relatorios-veiculos.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { diaDeBrasilia, ehRobo, registrarEventoDoSite } from "./estatisticas-vitrine";
import { estoqueEmCsv, relatorioDesempenho, relatorioEstoque, relatorioIntegracao, relatorioVisitas } from "./relatorios-veiculos";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

async function main() {
  checa("dia de Brasília: 01h UTC ainda é o dia anterior", diaDeBrasilia(new Date("2026-11-16T01:00:00Z")).toISOString().slice(0, 10), "2026-11-15");
  checa("robôs não contam", [ehRobo("Googlebot/2.1"), ehRobo("WhatsApp/2.23"), ehRobo(null), ehRobo("Mozilla/5.0 (iPhone) Safari")], [true, true, true, false]);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-relatorios", "teste-relatorios-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Rel", slug: "teste-relatorios" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra", slug: "teste-relatorios-2" } });
  const agora = new Date("2026-11-16T15:00:00Z");
  const mk = (extra: object) => prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Argo", anoFabricacao: 2021, anoModelo: 2021, km: 30000, kmInformado: true, precoCents: 6_000_000, status: "DISPONIVEL", origem: "COMPRA", ...extra } });
  const velho = await mk({ entradaEm: new Date("2026-07-01T12:00:00Z") });
  const novo = await mk({ entradaEm: new Date("2026-11-10T12:00:00Z"), modelo: "Cronos", precoCents: 9_000_000 });
  await mk({ status: "PREPARACAO", precoCents: 0, kmInformado: false });
  await mk({ status: "VENDIDO" });
  const outra = await prisma.veiculo.create({ data: { tenantId: t2.id, marca: "VW", modelo: "Gol", anoFabricacao: 2020, anoModelo: 2020, km: 1, precoCents: 1, status: "DISPONIVEL", origem: "COMPRA" } });
  await prisma.custoVeiculo.create({ data: { tenantId: t.id, veiculoId: velho.id, tipo: "COMPRA", valorCents: 5_000_000 } });
  await prisma.custoVeiculo.create({ data: { tenantId: t.id, veiculoId: velho.id, tipo: "MECANICA", valorCents: 300_000 } });

  const e = await relatorioEstoque(t.id, agora);
  const lv = e.linhas.find((l) => l.id === velho.id)!;
  checa("estoque: só o pátio, contagens e valor à venda", [e.total, e.porStatus, e.valorAVendaCents, e.parados90, e.semFotos], [3, { PREPARACAO: 1, DISPONIVEL: 2, RESERVADO: 0 }, 15_000_000, 1, 3]);
  checa("estoque: custo somado, margem e dias do carro antigo; mais antigo primeiro", [lv.custoCents, lv.margemCents, lv.dias, e.linhas[0].id], [5_300_000, 700_000, 138, velho.id]);
  const csv = estoqueEmCsv(e.linhas);
  checa("CSV para Excel: BOM, ponto e vírgula, vírgula decimal", [csv.startsWith("﻿Veículo;Placa"), csv.includes(";60000,00;"), csv.split("\r\n").length], [true, true, 4]);

  // site: 3 visitas no carro velho, 1 no geral, 1 WhatsApp e 1 formulário no novo; carro de outra loja não conta
  for (let i = 0; i < 3; i++) await registrarEventoDoSite(t.id, velho.id, "visita", agora);
  await registrarEventoDoSite(t.id, null, "visita", agora);
  await registrarEventoDoSite(t.id, novo.id, "whatsapp", agora);
  await registrarEventoDoSite(t.id, novo.id, "formulario", agora);
  await registrarEventoDoSite(t.id, outra.id, "visita", agora);
  await registrarEventoDoSite(t.id, velho.id, "visita", new Date("2026-10-20T15:00:00Z")); // no período anterior
  checa("contagem agrupada por dia e carro (outra loja fora)", await prisma.estatisticaVitrine.count({ where: { tenantId: t.id } }), 4);

  const v = await relatorioVisitas(t.id, 7, agora);
  checa("visitas: totais, um dia por posição, conversão e variação", [v.totais, v.porDia.length, v.porDia[6].visitas, v.conversao, v.variacao], [{ visitas: 4, whatsapp: 1, formularios: 1 }, 7, 4, 50, null]);
  checa("visitas: mais vistos", v.maisVistos.map((c) => [c.id === velho.id, c.visitas]), [[true, 3], [false, 0]]);
  const v30 = await relatorioVisitas(t.id, 30, agora);
  checa("visitas 30 dias: período anterior não tinha nada → sem variação; a visita de outubro entra", [v30.totais.visitas, v30.variacao], [5, null]);

  await prisma.leadPortal.create({ data: { tenantId: t.id, portal: "OLX", chave: "x1", origem: "whatsapp", nome: "Ana", mensagem: "oi", veiculoId: novo.id, recebidoEm: agora } });
  const d = await relatorioDesempenho(t.id, 30, agora);
  const dn = d.linhas.find((l) => l.id === novo.id)!, dv = d.linhas.find((l) => l.id === velho.id)!;
  checa("desempenho: contatos somam WhatsApp, formulário e lead de portal; ordem por contatos", [dn.contatos, dn.leadsPortais, d.linhas[0].id === novo.id], [3, 1, true]);
  checa("desempenho: carro antigo sem contato ganha alerta", [dv.contatos, dv.alerta], [0, "138 dias sem contato no período"]);

  await prisma.portalConta.create({ data: { tenantId: t.id, portal: "WEBMOTORS", status: "CONECTADA", accessTokenCripto: "x" } });
  await prisma.publicacaoPortal.create({ data: { tenantId: t.id, veiculoId: velho.id, portal: "WEBMOTORS", status: "PUBLICADO", idEnviado: "a" } });
  await prisma.publicacaoPortal.create({ data: { tenantId: t.id, veiculoId: novo.id, portal: "WEBMOTORS", status: "ERRO", erro: "versão não encontrada", idEnviado: "b" } });
  const i = await relatorioIntegracao(t.id);
  const wm = i.portais.find((p) => p.portal === "WEBMOTORS")!;
  checa("integração: publicados, erros e carros à venda fora do portal", [wm.publicados, wm.comErro, wm.foraDoPortal, i.erros.map((x) => x.erro)], [1, 1, 0, ["versão não encontrada"]]);
  checa("integração: Webmotors conectada, OLX sem conta não", [wm.conectado, i.portais.find((p) => p.portal === "OLX")!.conectado], [true, false]);

  await prisma.tenant.deleteMany({ where: { id: { in: [t.id, t2.id] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
