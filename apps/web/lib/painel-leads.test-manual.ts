// Veículos > Leads (painel de atenção e tempo de resposta). Rodar de apps/web com:
//   DATABASE_URL=postgresql://postgres@localhost:5439/zap npx tsx lib/painel-leads.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { faixaDoTempo, mediana, painelDeLeads, resumoDoTempo, variacaoEmPercentual } from "./painel-leads";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const SLUGS = ["teste-painel-a", "teste-painel-b"];
const agora = new Date("2026-11-24T15:00:00Z");
const antes = (min: number) => new Date(agora.getTime() - min * 60_000);

async function main() {
  // partes puras
  checa("faixas: 15 excelente, 16 atenção, 30 atenção, 31 crítico", [faixaDoTempo(15), faixaDoTempo(16), faixaDoTempo(30), faixaDoTempo(31)], ["excelente", "atencao", "atencao", "critico"]);
  checa("mediana: vazia, ímpar e par", [mediana([]), mediana([5, 1, 9]), mediana([4, 10])], [null, 5, 7]);
  checa("variação: sem base não calcula", [variacaoEmPercentual(5, 0), variacaoEmPercentual(15, 10), variacaoEmPercentual(5, 10)], [null, 50, -50]);
  const r = resumoDoTempo([
    { recebidoEm: antes(100), respostaEm: antes(95) }, // 5 min: excelente
    { recebidoEm: antes(100), respostaEm: antes(80) }, // 20 min: atenção
    { recebidoEm: antes(100), respostaEm: antes(20) }, // 80 min: crítico
    { recebidoEm: antes(100), respostaEm: null }, // sem resposta há 100 min: crítico
    { recebidoEm: antes(10), respostaEm: null }, // chegou há 10 min: aguardando
  ], agora);
  checa("resumo: faixas, aguardando e mediana só dos respondidos", [r.excelente, r.atencao, r.critico, r.aguardando, r.respondidos, r.semResposta, r.medianaMin], [1, 1, 2, 1, 3, 2, 20]);

  // com banco
  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const a = await prisma.tenant.create({ data: { name: SLUGS[0], slug: SLUGS[0] } });
  const b = await prisma.tenant.create({ data: { name: SLUGS[1], slug: SLUGS[1] } });
  const sessao = await prisma.whatsAppSession.create({ data: { tenantId: a.id, status: "CONNECTED" } });
  const sessaoB = await prisma.whatsAppSession.create({ data: { tenantId: b.id, status: "CONNECTED" } });
  const vendedora = await prisma.user.create({ data: { tenantId: a.id, name: "Joana", email: "joana-painel@t.com", passwordHash: "x", role: "AGENT" } });
  const funil = await prisma.funil.create({ data: { tenantId: a.id, nome: "Vendas" } });
  const etapa = await prisma.stage.create({ data: { tenantId: a.id, funilId: funil.id, name: "Novos", position: 0 } });
  const carro = await prisma.veiculo.create({ data: { tenantId: a.id, marca: "Fiat", modelo: "Argo", anoFabricacao: 2022, anoModelo: 2023, km: 1000, kmInformado: true, precoCents: 7_000_000, cor: "Branco", origem: "COMPRA" } as never });

  let n = 0;
  async function lead(opts: { portal: "NAPISTA" | "MOBIAUTO" | "WEBMOTORS"; minutosAtras: number; telefone?: boolean; ganha?: boolean; responsavel?: string | null; respondidoMinAtras?: number; tenant?: typeof a; veiculo?: boolean }) {
    n++;
    const t = opts.tenant ?? a;
    const sess = t.id === a.id ? sessao : sessaoB;
    let negociacaoId: string | null = null;
    let conversaId: string | null = null;
    let contatoId: string | null = null;
    if (opts.telefone !== false) {
      const contato = await prisma.contact.create({ data: { tenantId: t.id, waJid: `55219999${String(n).padStart(5, "0")}@s.whatsapp.net`, name: `Lead ${n}` } });
      contatoId = contato.id;
      const conv = await prisma.conversation.create({ data: { tenantId: t.id, contactId: contato.id, sessionId: sess.id } });
      conversaId = conv.id;
      const neg = await prisma.negociacao.create({ data: { tenantId: t.id, contactId: contato.id, funilId: funil.id, stageId: etapa.id, titulo: `Neg ${n}`, status: opts.ganha ? "GANHA" : "ABERTA", ...(opts.responsavel !== null && t.id === a.id ? { responsavelId: opts.responsavel ?? vendedora.id } : {}) } });
      negociacaoId = neg.id;
    }
    const l = await prisma.leadPortal.create({
      data: { tenantId: t.id, portal: opts.portal, chave: `k${n}`, origem: "email", nome: `Lead ${n}`, mensagem: "oi", semTelefone: opts.telefone === false, recebidoEm: antes(opts.minutosAtras), negociacaoId, ...(opts.veiculo ? { veiculoId: carro.id } : {}), ...(opts.respondidoMinAtras !== undefined ? { respondidoEm: antes(opts.respondidoMinAtras) } : {}) },
    });
    return { lead: l, conversaId, contatoId, sessaoId: sess.id };
  }
  const saida = (x: { conversaId: string | null; sessaoId: string }, minAtras: number, extra: object) =>
    prisma.message.create({ data: { conversationId: x.conversaId!, sessionId: x.sessaoId, direction: "OUTBOUND", body: "oi", status: "SENT", createdAt: antes(minAtras), waMessageId: `w${Math.random()}`, ...extra } });

  // 1) respondido por uma pessoa 5 min depois (excelente)
  const l1 = await lead({ portal: "NAPISTA", minutosAtras: 60, veiculo: true, ganha: true });
  await saida(l1, 55, { senderUserId: vendedora.id });
  // 2) só mensagem automática (sem remetente): NÃO conta, fica sem resposta (crítico)
  const l2 = await lead({ portal: "NAPISTA", minutosAtras: 120 });
  await saida(l2, 119, {});
  // 3) respondido pela IA 2 min depois (excelente)
  const l3 = await lead({ portal: "MOBIAUTO", minutosAtras: 50, veiculo: true });
  await saida(l3, 48, { referenciaExterna: "vendedor-ia:abc" });
  // 4) mensagem de pessoa ANTES do lead chegar: não conta
  const l4 = await lead({ portal: "NAPISTA", minutosAtras: 40 });
  await saida(l4, 400, { senderUserId: vendedora.id });
  // 5) marcado "já respondi" 25 min depois (atenção), sem telefone
  await lead({ portal: "WEBMOTORS", minutosAtras: 90, telefone: false, respondidoMinAtras: 65 });
  // 6) chegou há 10 min (aguardando)
  await lead({ portal: "NAPISTA", minutosAtras: 10, responsavel: null });
  // 7) de um mês atrás: fora do período de 7 dias, ainda sem resposta (entra no "sem resposta agora" de 30 dias)
  await lead({ portal: "NAPISTA", minutosAtras: 20 * 1440 });
  // 8) mensagem com falha não conta como resposta
  const l8 = await lead({ portal: "MOBIAUTO", minutosAtras: 200 });
  await saida(l8, 190, { senderUserId: vendedora.id, status: "FAILED" });
  // outra empresa: não pode aparecer
  await lead({ portal: "NAPISTA", minutosAtras: 30, tenant: b });

  const p = await painelDeLeads(a.id, 7, agora);
  checa("período de 7 dias: 7 leads (o de 20 dias fica de fora)", p.recebidos, 7);
  checa("isolamento: o lead de outra empresa não entra", p.origem.reduce((s, o) => s + o.leads, 0), 7);
  checa("respondidos: 3 (pessoa, IA e 'já respondi')", p.tempo.respondidos, 3);
  checa("excelente 2 (pessoa e IA), atenção 1 (já respondi)", [p.tempo.excelente, p.tempo.atencao], [2, 1]);
  checa("crítico: 3 (só mensagem automática, mensagem de antes do lead e mensagem que falhou)", p.tempo.critico, 3);
  checa("aguardando: o de 10 min", p.tempo.aguardando, 1);
  checa("sem resposta nos últimos 30 dias: l2, l4, l6, l7, l8", p.nuncaAtendidos, 5);
  checa("lista de atenção: mais novo primeiro, e traz a conversa para abrir", [p.paraAtender.length, p.paraAtender[0].esperaMin, p.paraAtender[0].conversaId !== null], [5, 10, true]);
  checa("sem telefone contado", p.semTelefone, 1);
  checa("mediana dos respondidos (5, 2 e 25 min) = 5", p.medianaMin, 5);
  checa("até 15 min: 2 de 3 = 67%", p.percentualAte15Min, 67);

  const napista = p.origem.find((o) => o.portal === "NAPISTA")!;
  checa("origem Na Pista: 4 leads no período e 1 venda", [napista.leads, napista.vendas], [4, 1]);
  checa("origem em ordem do maior para o menor", p.origem.map((o) => o.portal), ["NAPISTA", "MOBIAUTO", "WEBMOTORS"]);
  const joana = p.vendedores.find((v) => v.nome === "Joana")!;
  checa("vendedora: leads do período e quantos sem resposta (l2, l4, l8, l7)", [joana.leads, joana.semRespostaAgora], [5, 4]);
  checa("lead sem vendedor aparece em 'Sem vendedor definido'", p.vendedores.some((v) => v.nome === "Sem vendedor definido"), true);
  checa("14 dias, o último é hoje", [p.porDia.length, p.porDia[13].dia, p.porDia[13].leads], [14, "2026-11-24", 7]);

  const p30 = await painelDeLeads(a.id, 30, agora);
  checa("período de 30 dias inclui o de 20 dias", p30.recebidos, 8);
  const pOutra = await painelDeLeads(b.id, 7, agora);
  checa("a outra empresa só vê o dela", [pOutra.recebidos, pOutra.nuncaAtendidos], [1, 1]);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } }).catch(() => {}); process.exit(1); });
