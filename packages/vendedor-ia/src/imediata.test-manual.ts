// Resposta imediata ao lead de portal. Rodar com:
//   cd apps/web && DATABASE_URL=postgresql://postgres@localhost:5439/zap npx tsx ../../packages/vendedor-ia/src/imediata.test-manual.ts
import { prisma } from "@dilon-zap/db";
import type { ClienteIa } from "./executar";
import { celular, cicloDeRespostaImediata, horaNaLoja, montarSaudacao, primeiroNome } from "./imediata";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const SLUGS = ["teste-imediata-a", "teste-imediata-b"];
const meioDia = new Date("2026-11-25T15:00:00Z"); // 12h em Brasília
const antes = (min: number, base = meioDia) => new Date(base.getTime() - min * 60_000);
const semApi: ClienteIa = { beta: { messages: { create: async () => { throw new Error("a resposta imediata não deve chamar a API"); } } } };

async function main() {
  // partes puras
  checa("primeiro nome: só nome de verdade", [primeiroNome("  adilson MATTOS"), primeiroNome("123"), primeiroNome("x"), primeiroNome("João da Silva")], ["Adilson", "", "", "João"]);
  checa("celular: 55 + DDD + 9 + 8 dígitos", [celular("5521987654321"), celular("552133334444"), celular(null), celular("5521887654321")], [true, false, false, false]);
  checa("hora na loja (Brasília)", horaNaLoja(meioDia, "America/Sao_Paulo"), 12);
  const s = montarSaudacao({ nome: "Ana Souza", assistente: "Bia", loja: "Sales", carro: "Fiat Argo 2022/2023", portal: "Na Pista" });
  checa("saudação com carro: nome, loja, carro, portal; sem preço", [s.startsWith("Olá, Ana! Aqui é Bia da Sales."), s.includes("Fiat Argo 2022/2023"), s.includes("Na Pista"), /R\$/.test(s)], [true, true, true, false]);
  checa("saudação sem carro e sem nome", montarSaudacao({ nome: "?", assistente: "Bia", loja: "Sales", carro: null, portal: "MobiAuto" }).startsWith("Olá! Aqui é Bia da Sales. Vi o seu contato pelo MobiAuto."), true);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const mk = async (slug: string, ligada: boolean) => {
    const t = await prisma.tenant.create({ data: { name: slug, slug } });
    await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VENDEDOR_IA", ativo: true } });
    await prisma.vendedorIaConfig.create({ data: { tenantId: t.id, ativo: true, ativadoEm: antes(60 * 24 * 10), nomeAssistente: "Bia", respostaImediata: ligada, respostaImediataDesde: ligada ? antes(120) : null, respostaImediataPorHora: 3 } });
    const sessao = await prisma.whatsAppSession.create({ data: { tenantId: t.id, status: "CONNECTED" } });
    const funil = await prisma.funil.create({ data: { tenantId: t.id, nome: "Vendas" } });
    const etapa = await prisma.stage.create({ data: { tenantId: t.id, funilId: funil.id, name: "Novos", position: 0 } });
    const carro = await prisma.veiculo.create({ data: { tenantId: t.id, marca: "Fiat", modelo: "Argo", anoFabricacao: 2022, anoModelo: 2023, km: 1000, kmInformado: true, precoCents: 7_000_000, cor: "Branco", origem: "COMPRA", status: "DISPONIVEL" } as never });
    return { t, sessao, funil, etapa, carro };
  };
  const A = await mk(SLUGS[0], true);
  const B = await mk(SLUGS[1], false);

  let n = 0;
  async function lead(L: typeof A, o: { minAtras: number; telefone?: string; semConversaPrevia?: boolean }) {
    n++;
    const tel = o.telefone ?? `5521987${String(n).padStart(6, "0")}`;
    const contato = await prisma.contact.create({ data: { tenantId: L.t.id, waJid: `${tel}@s.whatsapp.net`, name: `Cliente ${n}` } });
    const neg = await prisma.negociacao.create({ data: { tenantId: L.t.id, contactId: contato.id, funilId: L.funil.id, stageId: L.etapa.id, titulo: `N${n}` } });
    const l = await prisma.leadPortal.create({ data: { tenantId: L.t.id, portal: "NAPISTA", chave: `i${n}`, origem: "email", nome: `Cliente Teste ${n}`, telefone: tel, mensagem: "oi", recebidoEm: antes(o.minAtras), negociacaoId: neg.id, veiculoId: L.carro.id } });
    return { l, contato };
  }
  const estado = (id: string) => prisma.leadPortal.findUniqueOrThrow({ where: { id }, select: { automaticoResultado: true } }).then((x) => x.automaticoResultado);
  const saidas = (tenantId: string) => prisma.message.count({ where: { conversation: { tenantId }, direction: "OUTBOUND", referenciaExterna: { startsWith: "vendedor-ia:" } } });
  const rodar = (agora: Date) => cicloDeRespostaImediata({ cliente: semApi, agora: () => agora });

  // 1) lead novo, celular, em horário: sai saudação + ficha
  const l1 = await lead(A, { minAtras: 1 });
  let r = await rodar(meioDia);
  checa("lead novo: 1 enviada", r.enviadas, 1);
  checa("lead novo: marcado como enviada", await estado(l1.l.id), "enviada");
  const msgs = await prisma.message.findMany({ where: { conversation: { tenantId: A.t.id }, direction: "OUTBOUND" }, orderBy: { createdAt: "asc" } });
  checa("saem 2 mensagens (saudação e ficha), pendentes, da IA, sem remetente", [msgs.length, msgs.every((m) => m.status === "PENDING" && m.senderUserId === null && m.referenciaExterna?.startsWith("vendedor-ia:"))], [2, true]);
  checa("a saudação cita o carro e a ficha vem depois", [msgs[0].body.includes("Fiat Argo"), msgs[1].body.length > 10], [true, true]);
  const conv = await prisma.vendedorIaConversa.findFirst({ where: { tenantId: A.t.id } });
  checa("a conversa fica com a IA (ATIVA) e conta como lead do mês", conv?.status, "ATIVA");

  // 2) não repete
  await rodar(new Date(meioDia.getTime() + 60_000));
  checa("rodar de novo não manda outra", await saidas(A.t.id), 2);

  // 3) travas
  const novo = new Date(meioDia.getTime() + 5 * 60_000); // 12h05, passou do espaçamento
  const antigo = await lead(A, { minAtras: 61 + 5 });
  const anteriorAoLigar = await lead(A, { minAtras: 200 });
  const semCelular = await lead(A, { minAtras: 2, telefone: "552133334444" });
  const jaConversa = await lead(A, { minAtras: 3 });
  const convJa = await prisma.conversation.create({ data: { tenantId: A.t.id, contactId: jaConversa.contato.id, sessionId: A.sessao.id } });
  await prisma.message.create({ data: { conversationId: convJa.id, sessionId: A.sessao.id, direction: "OUTBOUND", body: "oi", status: "SENT", senderUserId: null, deCelular: true, waMessageId: "x1", createdAt: antes(30, novo) } });
  const parada = await lead(A, { minAtras: 3 });
  const convP = await prisma.conversation.create({ data: { tenantId: A.t.id, contactId: parada.contato.id, sessionId: A.sessao.id } });
  await prisma.conversaAgente.create({ data: { conversationId: convP.id, tenantId: A.t.id, estado: "DESLIGADO" } });
  await rodar(novo);
  checa("mais de 60 min: nem é tratado (fica sem marca)", await estado(antigo.l.id), null);
  checa("chegou antes de ligar o recurso: não é tratado", await estado(anteriorAoLigar.l.id), null);
  checa("telefone fixo: ignorado com motivo", await estado(semCelular.l.id), "ignorada: telefone não é celular");
  checa("já falaram com ele (celular da loja): ignorado", await estado(jaConversa.l.id), "ignorada: já em conversa com a loja");
  checa("IA parada na conversa: ignorado", await estado(parada.l.id), "ignorada: IA parada nesta conversa");

  // 4) espaçamento de 20 s e teto por hora (3 por hora na config; o primeiro envio foi às 12h00)
  const a1 = await lead(A, { minAtras: 1 });
  await rodar(novo);
  checa("12h05: envia (2º da hora)", await estado(a1.l.id), "enviada");
  const a = await lead(A, { minAtras: 1 });
  await rodar(new Date(novo.getTime() + 10_000));
  checa("10 s depois do último envio: espera (sem marca)", await estado(a.l.id), null);
  const t3 = new Date(novo.getTime() + 40_000);
  await rodar(t3);
  checa("passou de 20 s: envia (3º da hora)", await estado(a.l.id), "enviada");
  const b = await lead(A, { minAtras: 1 });
  await rodar(new Date(t3.getTime() + 60_000));
  checa("teto de 3 por hora: o quarto espera", await estado(b.l.id), null);

  // 5) horário: 2h da manhã em Brasília
  const madrugada = new Date("2026-11-25T05:00:00Z");
  const noite = await lead(A, { minAtras: 1 });
  await prisma.leadPortal.update({ where: { id: noite.l.id }, data: { recebidoEm: antes(1, madrugada) } });
  await prisma.vendedorIaConfig.update({ where: { tenantId: A.t.id }, data: { respostaImediataDesde: antes(600, madrugada), respostaImediataPorHora: 50 } });
  await prisma.leadPortal.updateMany({ where: { tenantId: A.t.id, automaticoResultado: "enviada" }, data: { automaticoEm: antes(600, madrugada) } });
  await rodar(madrugada);
  checa("fora do horário (2h): ignorado com motivo", (await estado(noite.l.id))?.startsWith("ignorada: fora do horário"), true);

  // 6) limite do mês
  await prisma.vendedorIaConfig.update({ where: { tenantId: A.t.id }, data: { limiteLeadsMes: 1 } });
  const lim = await lead(A, { minAtras: 1 });
  await prisma.leadPortal.update({ where: { id: lim.l.id }, data: { recebidoEm: antes(1, new Date(meioDia.getTime() + 3_600_000 * 2)) } });
  await prisma.vendedorIaConfig.update({ where: { tenantId: A.t.id }, data: { respostaImediataDesde: antes(600) } });
  await rodar(new Date(meioDia.getTime() + 3_600_000 * 2));
  checa("limite de leads do mês: ignorado", await estado(lim.l.id), "ignorada: limite do mês");

  // 7) outra empresa, recurso desligado: nada sai
  const lb = await lead(B, { minAtras: 1 });
  await rodar(meioDia);
  checa("empresa com a resposta imediata desligada: nada sai", [await estado(lb.l.id), await saidas(B.t.id)], [null, 0]);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } }).catch(() => {}); process.exit(1); });
