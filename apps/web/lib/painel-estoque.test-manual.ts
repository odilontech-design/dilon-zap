// Veículos > Painel (estoque). Rodar de apps/web com:
//   DATABASE_URL=postgresql://postgres@localhost:5439/zap npx tsx lib/painel-estoque.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { diferencaParaFipe, faixaDeDias, faixaDeFipe, painelDoEstoque } from "./painel-estoque";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const SLUGS = ["teste-painel-est-a", "teste-painel-est-b"];
const agora = new Date("2026-11-25T15:00:00Z");
const diasAtras = (d: number) => new Date(agora.getTime() - d * 86_400_000);

async function main() {
  checa("faixas de dias nas bordas", [30, 31, 60, 61, 89, 90].map(faixaDeDias), ["ate30", "ate60", "ate60", "ate90", "ate90", "mais90"]);
  checa("diferença para a FIPE: sem FIPE ou sem preço é nula", [diferencaParaFipe(100, null), diferencaParaFipe(0, 100), diferencaParaFipe(112, 100)], [null, null, 12]);
  checa("faixas de FIPE nas bordas (10 = na faixa, 10,1 = acima, -5 = abaixo, -4,9 = na faixa)", [10, 10.1, -5, -4.9, 0].map(faixaDeFipe), ["naFaixa", "acima", "abaixo", "naFaixa", "naFaixa"]);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const a = await prisma.tenant.create({ data: { name: SLUGS[0], slug: SLUGS[0] } });
  const b = await prisma.tenant.create({ data: { name: SLUGS[1], slug: SLUGS[1] } });
  const base = { marca: "Fiat", modelo: "Argo", anoFabricacao: 2022, anoModelo: 2023, km: 10000, kmInformado: true, origem: "COMPRA", status: "DISPONIVEL", naVitrine: true, precoCents: 5_000_000, fipeCents: 5_000_000 };
  const mk = (tenantId: string, extra: object) => prisma.veiculo.create({ data: { tenantId, ...base, ...extra } as never });

  const novo = await mk(a.id, { modelo: "Novo", entradaEm: diasAtras(5) });
  await prisma.fotoVeiculo.create({ data: { tenantId: a.id, veiculoId: novo.id, key: "k1", ordem: 0 } });
  await prisma.publicacaoPortal.create({ data: { tenantId: a.id, veiculoId: novo.id, portal: "NAPISTA", idEnviado: "x1", status: "PUBLICADO" } });
  const parado = await mk(a.id, { modelo: "Parado", entradaEm: diasAtras(100), precoCents: 5_600_000 }); // +12% da FIPE
  const escondido = await mk(a.id, { modelo: "Escondido", entradaEm: diasAtras(70), naVitrine: false });
  const semPreco = await mk(a.id, { modelo: "SemPreco", entradaEm: diasAtras(10), precoCents: 0 });
  const semKm = await mk(a.id, { modelo: "SemKm", entradaEm: diasAtras(20), kmInformado: false });
  const comErro = await mk(a.id, { modelo: "ComErro", entradaEm: diasAtras(40) });
  await prisma.publicacaoPortal.create({ data: { tenantId: a.id, veiculoId: comErro.id, portal: "WEBMOTORS", idEnviado: "x2", status: "ERRO", erro: "recusado" } });
  await mk(a.id, { modelo: "Preparacao", status: "PREPARACAO", naVitrine: false, entradaEm: diasAtras(3) });
  await mk(a.id, { modelo: "Vendido", status: "VENDIDO", entradaEm: diasAtras(200) });
  await mk(b.id, { modelo: "DeOutraLoja", entradaEm: diasAtras(300), naVitrine: false });
  void parado; void escondido; void semPreco; void semKm;

  const p = await painelDoEstoque(a.id, agora);
  checa("total: 7 no pátio (vendido e carros de outra loja não contam)", p.total, 7);
  checa("publicados: os que aparecem no site ou têm anúncio publicado (5 na vitrine)", p.publicados, 5);
  checa("mais de 60 dias: o de 100 e o de 70", p.maisDe60Dias, 2);
  checa("fora do site: só o à venda escondido (preparação não conta)", p.inativosNoSite, 1);
  checa("idade média (5+100+70+10+20+40+3)/7 = 35", p.idadeMediaDias, 35);
  checa("dias em estoque por faixa", p.porDias, { ate30: 4, ate60: 1, ate90: 1, mais90: 1 });
  checa("preço × FIPE: 1 acima, 5 na faixa, 1 fora da conta (o sem preço)", [p.porFipe.acima, p.porFipe.naFaixa, p.porFipe.semFipe], [1, 5, 1]);
  const r = p.recomendacoes;
  checa("sem publicação: só o escondido (à venda e sem canal)", r.semPublicacao.itens.map((i) => i.nome.split(" ")[1]), ["Escondido"]);
  checa("parados e acima da FIPE: o de 100 dias, com o detalhe em %", [r.paradosAcimaDaFipe.total, r.paradosAcimaDaFipe.itens[0].detalhe], [1, "+12% da FIPE"]);
  checa("sem preço: 1", r.semPreco.total, 1);
  checa("sem km: 1", r.semKm.total, 1);
  checa("sem fotos: todos menos o que tem foto (6)", r.semFotos.total, 6);
  checa("problema nos portais: o com erro", r.problemaNosPortais.itens.map((i) => i.nome.split(" ")[1]), ["ComErro"]);
  checa("mais antigos: o de 100 dias vem primeiro", p.maisAntigos[0].dias, 100);
  checa("qualidade média existe e está entre 0 e 100", p.qualidadeMedia !== null && p.qualidadeMedia >= 0 && p.qualidadeMedia <= 100, true);

  const pb = await painelDoEstoque(b.id, agora);
  checa("outra loja vê só o dela", [pb.total, pb.recomendacoes.semPublicacao.total], [1, 1]);
  const vazio = await painelDoEstoque((await prisma.tenant.create({ data: { name: "vazio", slug: "teste-painel-est-vazio" } })).id, agora);
  checa("loja sem carros: tudo zerado, sem erro", [vazio.total, vazio.qualidadeMedia, vazio.idadeMediaDias], [0, null, 0]);

  await prisma.tenant.deleteMany({ where: { slug: { in: [...SLUGS, "teste-painel-est-vazio"] } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.tenant.deleteMany({ where: { slug: { in: [...SLUGS, "teste-painel-est-vazio"] } } }).catch(() => {}); process.exit(1); });
