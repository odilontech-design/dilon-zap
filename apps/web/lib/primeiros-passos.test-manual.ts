// "Primeiros passos" da revenda. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/primeiros-passos.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { primeirosPassosDaRevenda } from "./primeiros-passos";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const estados = (r: NonNullable<Awaited<ReturnType<typeof primeirosPassosDaRevenda>>>) => Object.fromEntries(r.passos.map((p) => [p.id, p.estado]));

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-passos", "teste-passos-2", "teste-passos-sem"] } } });
  const sem = await prisma.tenant.create({ data: { name: "Sem revenda", slug: "teste-passos-sem" } });
  checa("empresa sem o recurso de veículos não tem checklist", await primeirosPassosDaRevenda(sem.id), null);
  checa("empresa que não existe também não", await primeirosPassosDaRevenda("nao-existe"), null);

  const agora = new Date("2026-11-30T12:00:00Z");
  const t = await prisma.tenant.create({ data: { name: "Loja Passos", slug: "teste-passos", createdAt: new Date("2026-11-20T12:00:00Z") } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra", slug: "teste-passos-2" } });
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VEICULOS", ativo: true, motivo: "teste" } });
  const dono = await prisma.user.create({ data: { tenantId: t.id, name: "Dono", email: "dono-passos@t.com", passwordHash: "x", role: "OWNER" } });

  let r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("loja nova: nada feito, 0%, 10 dias desde a entrada", [r.feitos, r.percentual, r.concluido, r.resumo.diasDesdeAEntrada], [0, 0, false, 10]);
  checa("loja nova: equipe pendente (só o dono) e Vendedor IA nem aparece", [estados(r).equipe, r.passos.some((p) => p.id === "ia")], ["pendente", false]);

  // dados da loja
  await prisma.veiculosConfig.create({ data: { tenantId: t.id, endereco: "Av. X, 100 · Centro · Duque de Caxias/RJ", vitrineAtiva: true } });
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("só endereço: dados da loja em andamento; site no ar vira feito", [estados(r).dados, estados(r).site], ["parcial", "feito"]);
  await prisma.veiculosConfig.update({ where: { tenantId: t.id }, data: { telefones: [{ tipo: "WHATSAPP", numero: "5521967629631" }] } });

  // estoque: 3 carros — 1 pronto, 1 sem km, 1 sem preço e sem foto; carro de outra loja não conta
  const mk = (tenantId: string, extra: object) => prisma.veiculo.create({ data: { tenantId, marca: "Fiat", modelo: "Argo", anoFabricacao: 2021, anoModelo: 2021, km: 1, kmInformado: true, precoCents: 5_000_000, status: "DISPONIVEL", origem: "COMPRA", ...extra } });
  const pronto = await mk(t.id, {});
  await prisma.fotoVeiculo.create({ data: { tenantId: t.id, veiculoId: pronto.id, key: "x/a.jpg", ordem: 0 } });
  const semKm = await mk(t.id, { kmInformado: false });
  await prisma.fotoVeiculo.create({ data: { tenantId: t.id, veiculoId: semKm.id, key: "x/b.jpg", ordem: 0 } });
  await mk(t.id, { precoCents: 0 });
  await mk(t2.id, {});
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("estoque: 3 carros (o de outra loja fora); dados da loja feito", [r.resumo.noPatio, estados(r).estoque, estados(r).dados], [3, "feito", "feito"]);
  checa("fichas: 1 de 3 prontos, com o que falta dito", [estados(r).fichas, r.passos.find((p) => p.id === "fichas")!.detalhe], ["parcial", "1 de 3 prontos · faltam: km em 1, preço em 1, foto em 1"]);
  checa("resumo: sem km 1, sem foto 1, sem preço 1", [r.resumo.semKm, r.resumo.semFoto, r.resumo.semPreco], [1, 1, 1]);

  // WhatsApp, equipe, uso
  await prisma.whatsAppSession.create({ data: { tenantId: t.id, status: "CONNECTED" } });
  await prisma.whatsAppSession.create({ data: { tenantId: t2.id, status: "CONNECTED" } });
  await prisma.user.create({ data: { tenantId: t.id, name: "Vendedor", email: "vend-passos@t.com", passwordHash: "x", role: "AGENT" } });
  await prisma.user.create({ data: { tenantId: t.id, name: "Saiu", email: "saiu-passos@t.com", passwordHash: "x", role: "AGENT", deactivatedAt: new Date() } });
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("WhatsApp conectado; equipe = dono + vendedor (o desativado não conta)", [estados(r).whatsapp, estados(r).equipe, r.passos.find((p) => p.id === "equipe")!.detalhe], ["feito", "feito", "2 pessoas com acesso"]);
  checa("uso: sem mensagem da equipe ainda", [estados(r).uso, r.resumo.usouOInbox], ["pendente", false]);

  const contato = await prisma.contact.create({ data: { tenantId: t.id, waJid: "5521999990000@s.whatsapp.net", name: "Cliente" } });
  const sessao = await prisma.whatsAppSession.findFirstOrThrow({ where: { tenantId: t.id } });
  const conversa = await prisma.conversation.create({ data: { tenantId: t.id, contactId: contato.id, sessionId: sessao.id } });
  const msg = (i: number, quando: Date) => prisma.message.create({ data: { conversationId: conversa.id, sessionId: sessao.id, waMessageId: `m${i}`, direction: "OUTBOUND", body: "oi", senderUserId: dono.id, createdAt: quando } });
  await msg(1, new Date("2026-11-29T12:00:00Z"));
  await msg(2, new Date("2026-10-01T12:00:00Z")); // fora dos 14 dias
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("uso: 1 mensagem recente (a de outubro não conta) = em andamento", [estados(r).uso, r.resumo.usouOInbox], ["parcial", true]);
  for (let i = 3; i < 8; i++) await msg(i, new Date("2026-11-28T12:00:00Z"));
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("uso: 6 mensagens recentes = feito", estados(r).uso, "feito");

  // portais e IA
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("portais: nenhum conectado = pendente e opcional (não entra na porcentagem)", [estados(r).portais, r.passos.find((p) => p.id === "portais")!.obrigatorio, r.total], ["pendente", false, 7]);
  await prisma.portalConta.create({ data: { tenantId: t.id, portal: "WEBMOTORS", status: "CONECTADA", accessTokenCripto: "x" } });
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("portal conectado sem anúncio no ar = em andamento", estados(r).portais, "parcial");
  await prisma.publicacaoPortal.create({ data: { tenantId: t.id, veiculoId: pronto.id, portal: "WEBMOTORS", status: "PUBLICADO", idEnviado: "a" } });
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("portal com anúncio no ar = feito; detalhe cita o portal", [estados(r).portais, r.passos.find((p) => p.id === "portais")!.detalhe], ["feito", "Webmotors · 1 anúncio no ar"]);

  checa("com as fichas ainda em andamento, não está concluída (6 de 7)", [r.feitos, r.total, r.percentual, r.concluido], [6, 7, 86, false]);
  await prisma.veiculo.updateMany({ where: { tenantId: t.id, OR: [{ kmInformado: false }, { precoCents: 0 }] }, data: { kmInformado: true, precoCents: 4_000_000 } });
  const ids = (await prisma.veiculo.findMany({ where: { tenantId: t.id }, select: { id: true } })).map((v) => v.id);
  for (const id of ids) if (!(await prisma.fotoVeiculo.count({ where: { veiculoId: id } }))) await prisma.fotoVeiculo.create({ data: { tenantId: t.id, veiculoId: id, key: `x/${id}.jpg`, ordem: 0 } });
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("tudo pronto: 7 de 7, 100%, concluída", [r.feitos, r.total, r.percentual, r.concluido], [7, 7, 100, true]);

  // Vendedor IA contratado
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VENDEDOR_IA", ativo: true, motivo: "teste" } });
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("Vendedor IA contratado aparece como opcional pendente e não derruba os 100%", [estados(r).ia, r.passos.find((p) => p.id === "ia")!.obrigatorio, r.percentual], ["pendente", false, 100]);
  await prisma.vendedorIaConfig.create({ data: { tenantId: t.id, ativo: true, ativadoEm: agora } });
  r = (await primeirosPassosDaRevenda(t.id, agora))!;
  checa("Vendedor IA ligado = feito", estados(r).ia, "feito");

  await prisma.tenant.deleteMany({ where: { id: { in: [sem.id, t.id, t2.id] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  process.exit(falhas ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
