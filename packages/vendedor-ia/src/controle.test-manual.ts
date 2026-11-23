// Controle do Vendedor IA de carros no Inbox (assumir / devolver / automático). Rodar com:
//   DATABASE_URL=postgresql://postgres@localhost:5439/zap npx tsx packages/vendedor-ia/src/controle.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { ErroDoControle, definirControleDeCarros, obterControleDeCarros } from "./controle";
import { ciclo, type ClienteIa } from "./executar";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
async function recusa(nome: string, f: () => Promise<unknown>, status: number) {
  try {
    await f();
    checa(nome, "aceitou", `recusou ${status}`);
  } catch (e) {
    checa(nome, e instanceof ErroDoControle ? `recusou ${e.status}` : `erro ${String(e)}`, `recusou ${status}`);
  }
}

const SLUGS = ["teste-ctrl-a", "teste-ctrl-b"];
const autor = { id: "u1", name: "Vendedor Joana" };

async function loja(slug: string, ativo: boolean) {
  const t = await prisma.tenant.create({ data: { name: slug, slug } });
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VENDEDOR_IA", ativo: true } });
  await prisma.vendedorIaConfig.create({ data: { tenantId: t.id, ativo, ativadoEm: new Date("2026-11-01T00:00:00Z") } });
  const sessao = await prisma.whatsAppSession.create({ data: { tenantId: t.id, status: "CONNECTED" } });
  const contato = await prisma.contact.create({ data: { tenantId: t.id, waJid: `5521999${slug.length}0000@s.whatsapp.net`, name: "Cliente" } });
  const conversa = await prisma.conversation.create({ data: { tenantId: t.id, contactId: contato.id, sessionId: sessao.id } });
  return { t, sessao, conversa };
}

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const a = await loja(SLUGS[0], true);
  const b = await loja(SLUGS[1], true);
  const agora = new Date("2026-11-23T15:00:00Z");

  // sem controle gravado
  const inicial = await obterControleDeCarros(a.t.id, a.conversa.id);
  checa("começa sem controle nem estado", [inicial.ligadoNaLoja, inicial.controle, inicial.estado], [true, null, null]);

  // isolamento entre empresas
  await recusa("conversa de outra empresa: não enxerga", () => obterControleDeCarros(b.t.id, a.conversa.id), 404);
  await recusa("conversa de outra empresa: não assume", () => definirControleDeCarros(b.t.id, a.conversa.id, { acao: "desligar" }, autor, agora), 404);
  checa("nada foi gravado pela tentativa de outra empresa", await prisma.conversaAgente.count({ where: { conversationId: a.conversa.id } }), 0);

  // pedido inválido
  let invalido = false;
  try { await definirControleDeCarros(a.t.id, a.conversa.id, { acao: "apagar" }, autor, agora); } catch { invalido = true; }
  checa("ação desconhecida é recusada", invalido, true);
  invalido = false;
  try { await definirControleDeCarros(a.t.id, a.conversa.id, { acao: "ligar", tenantId: "x" }, autor, agora); } catch { invalido = true; }
  checa("campo extra (tenantId do cliente) é recusado", invalido, true);

  // grupo
  const grupo = await prisma.contact.create({ data: { tenantId: a.t.id, waJid: "1203630000@g.us", name: "Grupo", grupo: true } });
  const convGrupo = await prisma.conversation.create({ data: { tenantId: a.t.id, contactId: grupo.id, sessionId: a.sessao.id } });
  await recusa("grupo não tem Vendedor IA", () => definirControleDeCarros(a.t.id, convGrupo.id, { acao: "ligar" }, autor, agora), 409);

  // assumir: cancela a fila da IA, mas não mexe em mensagem de pessoa
  await prisma.vendedorIaConversa.create({ data: { conversationId: a.conversa.id, tenantId: a.t.id, turnos: 2, iniciadaEm: new Date("2026-11-23T14:00:00Z") } });
  const msg = (i: number, extra: object) => prisma.message.create({ data: { conversationId: a.conversa.id, sessionId: a.sessao.id, waMessageId: `m${i}`, direction: "OUTBOUND", body: "x", status: "PENDING", ...extra } });
  const daIa = await msg(1, { referenciaExterna: "vendedor-ia:abc" });
  const daPessoa = await msg(2, { referenciaExterna: null });
  const r1 = await definirControleDeCarros(a.t.id, a.conversa.id, { acao: "desligar" }, autor, agora);
  checa("assumir: fica DESLIGADO com o nome de quem assumiu", [r1.controle, r1.alteradoPor], ["DESLIGADO", "Vendedor Joana"]);
  checa("assumir: a conversa com a IA vira TRANSFERIDA", [r1.estado?.status, r1.estado?.motivo], ["TRANSFERIDA", "assumida por Vendedor Joana"]);
  checa("assumir: cancelou 1 resposta da IA na fila", r1.canceladas, 1);
  checa("assumir: resposta da IA ficou FALHA e a da pessoa continua PENDING", [(await prisma.message.findUniqueOrThrow({ where: { id: daIa.id } })).status, (await prisma.message.findUniqueOrThrow({ where: { id: daPessoa.id } })).status], ["FAILED", "PENDING"]);

  // o worker respeita o freio. Conversa nova (sem estado da IA), cliente falou há 1 minuto: sem o freio a IA tentaria a API.
  let chamadas = 0;
  const cliente: ClienteIa = { beta: { messages: { create: async () => { chamadas++; throw new Error("chamou a API"); } } } };
  const novaConversa = async (n: number) => {
    const ct = await prisma.contact.create({ data: { tenantId: a.t.id, waJid: `552197777000${n}@s.whatsapp.net` } });
    const cv = await prisma.conversation.create({ data: { tenantId: a.t.id, contactId: ct.id, sessionId: a.sessao.id } });
    await prisma.message.create({ data: { conversationId: cv.id, sessionId: a.sessao.id, waMessageId: `inb${n}`, direction: "INBOUND", body: "ainda tem o polo?", createdAt: new Date(Date.now() - 60_000) } });
    return cv;
  };
  const livre = await novaConversa(1);
  await ciclo({ cliente, agora: () => new Date() });
  checa("worker (controle do teste): conversa sem freio tenta chamar a API", chamadas >= 1, true);
  await prisma.conversation.deleteMany({ where: { id: livre.id } });
  chamadas = 0;
  const freada = await novaConversa(2);
  await prisma.conversaAgente.create({ data: { conversationId: freada.id, tenantId: a.t.id, estado: "DESLIGADO" } });
  await ciclo({ cliente, agora: () => new Date() });
  checa("worker: conversa com a IA parada não chama a API", chamadas, 0);
  await prisma.conversation.deleteMany({ where: { id: freada.id } });

  // devolver à IA: recomeça a conversa
  await prisma.vendedorIaConversa.update({ where: { conversationId: a.conversa.id }, data: { turnos: 20, resumo: "antigo" } });
  const r2 = await definirControleDeCarros(a.t.id, a.conversa.id, { acao: "ligar" }, autor, agora);
  checa("devolver: LIGADO e conversa recomeça (ATIVA, 0 respostas, sem motivo/resumo)", [r2.controle, r2.estado?.status, r2.estado?.turnos, r2.estado?.motivo, r2.estado?.resumo], ["LIGADO", "ATIVA", 0, null, null]);

  // voltar ao automático
  const r3 = await definirControleDeCarros(a.t.id, a.conversa.id, { acao: "automatico" }, autor, agora);
  checa("automático: tira o controle (o estado da conversa fica)", [r3.controle, r3.alteradoPor], [null, null]);

  // limite do mês só barra conversa nova na IA
  const convNova = await prisma.conversation.create({ data: { tenantId: a.t.id, contactId: (await prisma.contact.create({ data: { tenantId: a.t.id, waJid: "5521988880001@s.whatsapp.net" } })).id, sessionId: a.sessao.id } });
  await prisma.vendedorIaConfig.update({ where: { tenantId: a.t.id }, data: { limiteLeadsMes: 1 } });
  await recusa("limite de leads do mês: conversa nova não entra", () => definirControleDeCarros(a.t.id, convNova.id, { acao: "ligar" }, autor, agora), 409);
  const jaLead = await definirControleDeCarros(a.t.id, a.conversa.id, { acao: "ligar" }, autor, agora);
  checa("limite atingido: quem já era lead pode ser devolvido", jaLead.controle, "LIGADO");

  // IA desligada na loja
  await prisma.vendedorIaConfig.update({ where: { tenantId: a.t.id }, data: { ativo: false } });
  await recusa("loja com a IA desligada: não dá para devolver", () => definirControleDeCarros(a.t.id, convNova.id, { acao: "ligar" }, autor, agora), 409);
  checa("loja com a IA desligada: faixa sabe disso", (await obterControleDeCarros(a.t.id, convNova.id)).ligadoNaLoja, false);

  // controle de uma empresa nunca vaza para outra (linha com tenant trocado é ignorada)
  await prisma.conversaAgente.upsert({ where: { conversationId: b.conversa.id }, create: { conversationId: b.conversa.id, tenantId: a.t.id, estado: "DESLIGADO" }, update: {} });
  checa("linha de controle de outro tenant não vale", (await obterControleDeCarros(b.t.id, b.conversa.id)).controle, null);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } }).catch(() => {}); process.exit(1); });
