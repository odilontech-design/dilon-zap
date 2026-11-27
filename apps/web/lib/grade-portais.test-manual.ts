// Veículos > Anúncios (grade de portais). Rodar de apps/web com:
//   DATABASE_URL=postgresql://postgres@localhost:5439/zap npx tsx lib/grade-portais.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { atualizarAgora, gradeDePortais } from "./grade-portais";
import { anunciarNaWebmotors } from "./portais-webmotors";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const SLUGS = ["teste-grade-a", "teste-grade-b"];

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const a = await prisma.tenant.create({ data: { name: SLUGS[0], slug: SLUGS[0] } });
  const b = await prisma.tenant.create({ data: { name: SLUGS[1], slug: SLUGS[1] } });
  const conta = (tenantId: string, portal: "WEBMOTORS" | "NAPISTA" | "MOBIAUTO", status: "CONECTADA" | "ERRO") => prisma.portalConta.create({ data: { tenantId, portal, status, accessTokenCripto: "x" } as never });
  await conta(a.id, "WEBMOTORS", "CONECTADA");
  await conta(a.id, "NAPISTA", "ERRO");
  await conta(b.id, "MOBIAUTO", "CONECTADA");

  const base = { marca: "Fiat", modelo: "Argo", anoFabricacao: 2022, anoModelo: 2023, km: 10000, kmInformado: true, origem: "COMPRA", status: "DISPONIVEL", precoCents: 5_000_000 };
  const mk = (tenantId: string, extra: object) => prisma.veiculo.create({ data: { tenantId, ...base, ...extra } as never });
  const pub = (tenantId: string, veiculoId: string, portal: "WEBMOTORS" | "NAPISTA", status: "PUBLICADO" | "FILA" | "ERRO", extra: object = {}) =>
    prisma.publicacaoPortal.create({ data: { tenantId, veiculoId, portal, idEnviado: `${portal}-${veiculoId}`.slice(0, 30), status, ...extra } });

  const c1 = await mk(a.id, { modelo: "Publicado" });
  const c2 = await mk(a.id, { modelo: "NaFila" });
  const c3 = await mk(a.id, { modelo: "ComErro" });
  const c4 = await mk(a.id, { modelo: "Fora", kmInformado: false });
  const c5 = await mk(a.id, { modelo: "Reservado", status: "RESERVADO" });
  const c6 = await mk(a.id, { modelo: "Desligado" });
  await mk(a.id, { modelo: "Vendido", status: "VENDIDO" });
  const deB = await mk(b.id, { modelo: "DeOutraLoja" });
  await pub(a.id, c1.id, "WEBMOTORS", "PUBLICADO", { url: "https://w/1", plano: "Controle" });
  await pub(a.id, c2.id, "WEBMOTORS", "FILA");
  await pub(a.id, c3.id, "WEBMOTORS", "ERRO", { erro: "recusado" });
  await pub(a.id, c6.id, "WEBMOTORS", "PUBLICADO", { ativo: false });
  await pub(a.id, c1.id, "NAPISTA", "PUBLICADO");
  void c4; void c5;

  const g = await gradeDePortais(a.id);
  checa("colunas: Webmotors e NaPista (a conta de MobiAuto é de outra loja)", g.portais.map((p) => p.portal), ["WEBMOTORS", "NAPISTA"]);
  const w = g.portais.find((p) => p.portal === "WEBMOTORS")!;
  checa("Webmotors: conectada, 1 publicado, 1 na fila, 1 com erro (o desligado não conta)", [w.conectado, w.publicados, w.naFila, w.comErro], [true, 1, 1, 1]);
  checa("Webmotors: à venda fora do portal = 'Fora' e o desligado (vendido e reservado não contam)", w.fora, 2);
  checa("Webmotors: dos que faltam, 1 está sem km", w.foraSemKm, 1);
  checa("Webmotors: pendentes para o Atualizar agora = 1 na fila + 1 com erro", w.pendentes, 2);
  const n = g.portais.find((p) => p.portal === "NAPISTA")!;
  checa("NaPista: conta com erro aparece como desconectada", [n.conectado, n.situacaoConta], [false, "ERRO"]);
  checa("linhas: 6 carros à venda ou reservados (vendido e de outra loja ficam de fora)", g.carros.length, 6);
  const l1 = g.carros.find((c) => c.id === c1.id)!;
  checa("célula: publicado traz link e plano", [l1.anuncios.WEBMOTORS?.status, l1.anuncios.WEBMOTORS?.url, l1.anuncios.WEBMOTORS?.plano], ["PUBLICADO", "https://w/1", "Controle"]);
  checa("célula: sem anúncio é nula", g.carros.find((c) => c.id === c4.id)!.anuncios.WEBMOTORS, null);
  checa("célula: erro traz o motivo", g.carros.find((c) => c.id === c3.id)!.anuncios.WEBMOTORS?.erro, "recusado");
  checa("carro sem km é marcado", g.carros.find((c) => c.id === c4.id)!.semKm, true);
  checa("à venda no topo: 5 (o reservado fica de fora do total)", g.aVenda, 5);
  checa("linha traz versão, ano do modelo, vitrine, km e os dois preços", [l1.versao, l1.anoModelo, l1.naVitrine, l1.km, l1.precoClassificadosCents], [null, 2023, true, 10000, null]);
  checa("linha sem foto: capa nula e zero fotos", [l1.capaId, l1.totalFotos], [null, 0]);

  const ag = await atualizarAgora(a.id, "WEBMOTORS");
  checa("Atualizar agora: reenfileira a fila e o erro (o publicado e o desligado ficam)", ag.reenviados, 2);
  const depois = await gradeDePortais(a.id);
  const c3d = depois.carros.find((c) => c.id === c3.id)!.anuncios.WEBMOTORS;
  checa("o anúncio com erro voltou à fila sem o erro antigo", [c3d?.status, c3d?.erro], ["FILA", null]);
  checa("Atualizar agora de outra loja não mexe nesta", (await atualizarAgora(b.id, "WEBMOTORS")).reenviados, 0);
  const gb = await gradeDePortais(b.id);
  checa("outra loja vê só a coluna e o carro dela", [gb.portais.map((p) => p.portal), gb.carros.length], [["MOBIAUTO"], 1]);

  // anunciar com id de outra loja não cria nada (a rota já filtra, e a função também)
  const r = await anunciarNaWebmotors(a.id, [deB.id]);
  checa("anunciar carro de outra loja: nenhum ligado e nada criado", [r.ligados, await prisma.publicacaoPortal.count({ where: { veiculoId: deB.id } })], [0, 0]);
  const aberta = await anunciarNaWebmotors(a.id, [c4.id]);
  checa("anunciar um carro desta loja liga e avisa que está sem km", [aberta.ligados, aberta.semKm], [1, 1]);

  // Link público do carro (menu "Compartilhar"/"QR Code"): só com a vitrine ligada, o carro nela e, se reservado, "mostrar reservados".
  process.env.NEXTAUTH_URL = "https://zap.exemplo.com.br";
  const links = async (t: string) => Object.fromEntries((await gradeDePortais(t)).carros.map((c) => [c.nome.split(" ")[1], c.linkPublico]));
  checa("vitrine desligada ou sem configuração: nenhum link", Object.values(await links(a.id)).every((l) => l === null), true);
  await prisma.veiculosConfig.create({ data: { tenantId: a.id, vitrineAtiva: true } });
  await prisma.veiculo.update({ where: { id: c6.id }, data: { naVitrine: false } });
  await prisma.veiculosConfig.update({ where: { tenantId: a.id }, data: { mostrarReservados: false } });
  const comVitrine = await links(a.id);
  checa("vitrine ligada: link do carro na vitrine", comVitrine["Publicado"], `https://zap.exemplo.com.br/loja/${SLUGS[0]}/${c1.id}`);
  checa("carro fora da vitrine: sem link", comVitrine["Desligado"], null);
  checa("reservado sem 'mostrar reservados': sem link", comVitrine["Reservado"], null);
  await prisma.veiculosConfig.update({ where: { tenantId: a.id }, data: { mostrarReservados: true } });
  checa("reservado com 'mostrar reservados': com link", (await links(a.id))["Reservado"], `https://zap.exemplo.com.br/loja/${SLUGS[0]}/${c5.id}`);
  checa("a outra loja (sem vitrine) não ganha link de ninguém", Object.values(await links(b.id)).every((l) => l === null), true);

  const vazio = await prisma.tenant.create({ data: { name: "v", slug: "teste-grade-vazio" } });
  const gv = await gradeDePortais(vazio.id);
  checa("loja sem portal nem carro: grade vazia, sem erro", [gv.portais.length, gv.carros.length], [0, 0]);

  await prisma.tenant.deleteMany({ where: { slug: { in: [...SLUGS, "teste-grade-vazio"] } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.tenant.deleteMany({ where: { slug: { in: [...SLUGS, "teste-grade-vazio"] } } }).catch(() => {}); process.exit(1); });
