// Falha da API do Vendedor IA (passa para a equipe) e saúde da conexão. Rodar com:
//   cd apps/web && DATABASE_URL=postgresql://postgres@localhost:5439/zap npx tsx ../../packages/vendedor-ia/src/falha-e-saude.test-manual.ts
import { prisma } from "@dilon-zap/db";
import { ciclo, MOTIVO_DA_FALHA, type ClienteIa } from "./executar";
import { explicarErro, MODELO_DO_TESTE, precisaVerificar, verificarConexao } from "./saude";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const SLUG = "teste-falha-ia";
class ErroHttp extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}
const clienteQueFalha = (e: Error): ClienteIa => ({ beta: { messages: { create: async () => { throw e; } } } });
const clienteQueResponde = (modelos: string[]): ClienteIa => ({ beta: { messages: { create: async (p) => { modelos.push(p.model); return {} as never; } } } });

async function main() {
  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
  await prisma.vendedorIaSaude.deleteMany({});
  const t = await prisma.tenant.create({ data: { name: SLUG, slug: SLUG } });
  await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VENDEDOR_IA", ativo: true } });
  const setor = await prisma.setor.create({ data: { tenantId: t.id, nome: "Vendas" } });
  await prisma.vendedorIaConfig.create({ data: { tenantId: t.id, ativo: true, ativadoEm: new Date("2026-11-01T00:00:00Z"), setorTransferenciaId: setor.id, modelo: "claude-sonnet-5-5" } });
  const sessao = await prisma.whatsAppSession.create({ data: { tenantId: t.id, status: "CONNECTED" } });
  const contato = await prisma.contact.create({ data: { tenantId: t.id, waJid: "5521955550000@s.whatsapp.net", name: "Cliente" } });
  const conversa = await prisma.conversation.create({ data: { tenantId: t.id, contactId: contato.id, sessionId: sessao.id, lastMessageAt: new Date() } });
  await prisma.message.create({ data: { conversationId: conversa.id, sessionId: sessao.id, waMessageId: "in1", direction: "INBOUND", body: "ainda tem o polo?", createdAt: new Date(Date.now() - 60_000) } });

  // --- a API cai: o cliente não fica sem resposta e a equipe fica sabendo
  const r = await ciclo({ cliente: clienteQueFalha(new ErroHttp(529, "overloaded")), agora: () => new Date() });
  checa("API falhou: a rodada não conta resposta nem erro (foi tratada)", [r.respondidas, r.erros], [0, 0]);
  const estado = await prisma.vendedorIaConversa.findUniqueOrThrow({ where: { conversationId: conversa.id } });
  checa("API falhou: conversa TRANSFERIDA com o motivo certo", [estado.status, estado.motivo], ["TRANSFERIDA", MOTIVO_DA_FALHA]);
  const conv = await prisma.conversation.findUniqueOrThrow({ where: { id: conversa.id } });
  checa("API falhou: conversa vai para Pendentes, no setor de vendas", [conv.status, conv.setorId], ["PENDING", setor.id]);
  const saida = await prisma.message.findMany({ where: { conversationId: conversa.id, direction: "OUTBOUND" } });
  checa("API falhou: o cliente recebe um aviso (1 mensagem da IA na fila)", [saida.length, saida[0]?.status, saida[0]?.referenciaExterna?.startsWith("vendedor-ia:"), /vendedores/.test(saida[0]?.body ?? "")], [1, "PENDING", true, true]);

  // --- não repete: a próxima rodada não manda outro aviso
  await ciclo({ cliente: clienteQueFalha(new ErroHttp(529, "overloaded")), agora: () => new Date() });
  checa("não repete o aviso nas rodadas seguintes", await prisma.message.count({ where: { conversationId: conversa.id, direction: "OUTBOUND" } }), 1);

  // --- explicação do erro em português, sem vazar chave
  checa("401 → chave recusada", explicarErro(new ErroHttp(401, "x")).startsWith("A Anthropic recusou a chave"), true);
  checa("429 → limite/saldo", /saldo/.test(explicarErro(new ErroHttp(429, "x"))), true);
  checa("5xx → fora do ar", /fora do ar/.test(explicarErro(new ErroHttp(503, "x"))), true);
  checa("erro com chave no texto não vaza", explicarErro(new Error("falha com sk-ant-api03-SEGREDO123 aqui")).includes("SEGREDO"), false);

  // --- saúde da conexão
  checa("nunca conferiu: precisa conferir", await precisaVerificar(), true);
  const sem = await verificarConexao(null);
  const l1 = await prisma.vendedorIaSaude.findUniqueOrThrow({ where: { id: "global" } });
  checa("sem chave: registra, sem chamar a API", [sem.ok, l1.chaveConfigurada, l1.ok], [false, false, false]);
  checa("acabou de conferir: não precisa de novo", await precisaVerificar(), false);

  const modelos: string[] = [];
  const bom = await verificarConexao(clienteQueResponde(modelos));
  checa("com chave: testa o modelo barato e o da loja ligada", modelos, [MODELO_DO_TESTE, "claude-sonnet-5-5"]);
  checa("com chave e tudo respondendo: ok", [bom.ok, (await prisma.vendedorIaSaude.findUniqueOrThrow({ where: { id: "global" } })).ok], [true, true]);

  const ruim = await verificarConexao(clienteQueFalha(new ErroHttp(401, "invalid x-api-key")));
  const l3 = await prisma.vendedorIaSaude.findUniqueOrThrow({ where: { id: "global" } });
  checa("chave recusada: não ok, com a explicação por modelo", [ruim.ok, l3.ok, (l3.resultados as { erro: string }[])[0].erro.startsWith("A Anthropic recusou")], [false, false, true]);

  await prisma.vendedorIaSaude.update({ where: { id: "global" }, data: { testeSolicitadoEm: new Date(Date.now() + 1000) } });
  checa("teste pedido depois da última conferência: confere já", await precisaVerificar(), true);
  await prisma.vendedorIaSaude.update({ where: { id: "global" }, data: { testeSolicitadoEm: null, verificadoEm: new Date(Date.now() - 16 * 60_000) } });
  checa("passou de 15 minutos: confere de novo", await precisaVerificar(), true);

  await prisma.tenant.deleteMany({ where: { slug: SLUG } });
  await prisma.vendedorIaSaude.deleteMany({});
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.tenant.deleteMany({ where: { slug: SLUG } }).catch(() => {}); process.exit(1); });
