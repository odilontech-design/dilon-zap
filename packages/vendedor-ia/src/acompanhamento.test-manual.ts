// Acompanhamento automático dos leads. Rodar com:
//   cd apps/web && DATABASE_URL=<banco de teste> npx tsx ../../packages/vendedor-ia/src/acompanhamento.test-manual.ts
// As regras puras rodam sem banco: npx tsx src/acompanhamento.test-manual.ts --sem-banco (de packages/vendedor-ia).
import { prisma } from "@dilon-zap/db";
import type { ClienteIa } from "./executar";
import { cicloDeAcompanhamento, decidirAcompanhamento, dentroDoHorarioDoAcompanhamento, montarAcompanhamento, pediuParaParar, contatoAlcancavel, varianteDaConversa, type MensagemDaConversa } from "./acompanhamento";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const quarta = new Date("2026-11-25T15:00:00Z"); // quarta, 12h em Brasília
const horas = (h: number, base = quarta) => new Date(base.getTime() - h * 3_600_000);
const m = (de: MensagemDaConversa["de"], h: number, texto = "x"): MensagemDaConversa => ({ de, em: horas(h), texto });
const decide = (mensagens: MensagemDaConversa[], toquesEnviados = 0) => decidirAcompanhamento({ mensagens, toquesEnviados, agora: quarta });

async function main() {
  // ---- partes puras
  checa(
    "pediu para parar: pega os jeitos de dizer",
    ["Pare de me mandar mensagem", "não quero mais", "Me tire da lista", "PARAR", "não tenho interesse", "chega", "sem interesse", "pode parar"].map(pediuParaParar),
    [true, true, true, true, true, true, true, true]
  );
  checa("pediu para parar: conversa normal não pega", ["Quero ver o carro", "Qual o horário de vocês?", "Tem financiamento?", "Pode me mandar as fotos", "Tenho interesse no Argo"].map(pediuParaParar), [false, false, false, false, false]);
  checa(
    "horário: quarta 12h ok, 8h e 19h não, domingo não, sábado 10h ok",
    [
      dentroDoHorarioDoAcompanhamento(quarta, "America/Sao_Paulo"),
      dentroDoHorarioDoAcompanhamento(new Date("2026-11-25T11:00:00Z"), "America/Sao_Paulo"), // 8h
      dentroDoHorarioDoAcompanhamento(new Date("2026-11-25T22:00:00Z"), "America/Sao_Paulo"), // 19h
      dentroDoHorarioDoAcompanhamento(new Date("2026-11-29T15:00:00Z"), "America/Sao_Paulo"), // domingo
      dentroDoHorarioDoAcompanhamento(new Date("2026-11-28T13:00:00Z"), "America/Sao_Paulo"), // sábado 10h
    ],
    [true, false, false, false, true]
  );
  checa(
    "alcançável: quem já escreveu (inclusive @lid) sim; sem mensagem dele, só celular em @s.whatsapp.net; grupo nunca",
    [
      contatoAlcancavel("198823062335678@lid", true),
      contatoAlcancavel("198823062335678@lid", false),
      contatoAlcancavel("5521987654321@s.whatsapp.net", false),
      contatoAlcancavel("552133334444@s.whatsapp.net", false),
      contatoAlcancavel("552133334444@s.whatsapp.net", true),
      contatoAlcancavel("120363@g.us", true),
    ],
    [true, false, true, false, true, false]
  );

  checa("IA falou há 30h e o cliente sumiu: 1º toque", decide([m("ia", 30)]), { acao: "enviar", tentativa: 1 });
  checa("IA falou há 10h: ainda cedo", decide([m("ia", 10)]).acao, "esperar");
  checa("a última palavra é do cliente: é a vez da IA, não do toque", decide([m("ia", 40), m("cliente", 30)]).acao, "esperar");
  checa("mensagem automática (menu) não conta como fala da loja", decide([m("automatica", 30)]).acao, "esperar");
  checa("pessoa da loja já falou: ignora", decide([m("ia", 40), m("pessoa", 30)]), { acao: "ignorar", motivo: "uma pessoa da loja já falou com o cliente" });
  checa("cliente pediu para parar: ignora", decide([m("ia", 50), m("cliente", 40, "pode parar de me mandar"), m("ia", 39)]), { acao: "ignorar", motivo: "o cliente pediu para parar" });
  checa("depois de 6 dias não retoma", decide([m("ia", 24 * 7)]).acao, "ignorar");
  checa("2º toque: com 1 já enviado, só depois de 72 h de silêncio", [decide([m("ia", 40)], 1).acao, decide([m("ia", 80)], 1)], ["esperar", { acao: "enviar", tentativa: 2 }]);
  checa("nunca um 3º toque", decide([m("ia", 200)], 2).acao, "ignorar");
  checa("cliente respondeu depois do toque e sumiu de novo: conta a partir da última fala da loja", decide([m("ia", 100), m("cliente", 90), m("ia", 80)], 1), { acao: "enviar", tentativa: 2 });

  const t1 = montarAcompanhamento({ tentativa: 1, nome: "ana souza", assistente: "Bia", loja: "Sales", carro: "Fiat Argo 2022/2023", variante: 0 });
  checa("1º toque com carro: nome, loja e carro; sem preço, sem 'última'", [t1.startsWith("Oi, Ana! Aqui é Bia da Sales."), t1.includes("Fiat Argo 2022/2023"), /R\$/.test(t1), /parar|última/i.test(t1)], [true, true, false, false]);
  const t2 = montarAcompanhamento({ tentativa: 2, nome: "?", assistente: "Bia", loja: "Sales", carro: null, variante: 1 });
  checa("2º toque: dá uma saída fácil e não se apresenta de novo", [t2.startsWith("Oi!"), /me avisar|me dizer|paro de escrever/.test(t2), t2.includes("Aqui é")], [true, true, false]);
  const todos = [1, 2].flatMap((t) => [0, 1].flatMap((v) => [null, "Fiat Argo 2022/2023"].map((c) => montarAcompanhamento({ tentativa: t as 1 | 2, nome: "Ana", assistente: "Bia", loja: "Sales", carro: c, variante: v }))));
  checa("nenhum texto fala de preço, juros, parcela ou promete desconto", todos.some((x) => /R\$|juros|parcela|desconto|oferta|promo/i.test(x)), false);
  checa("variante estável por conversa e as duas aparecem", [varianteDaConversa("abc") === varianteDaConversa("abc"), ["cmwdsum7q00vnlhcgwzl3ir8d", "cmwdz2yn101helhcg2x0kj13r", "cmwv0wj6816ayyfctx2tufe10", "cmwec2nsm000mqi5qlqubgga6", "cmwec2nss000rqi5q4t5c5akl", "cmwec2nsh000hqi5qnygl2quq", "cmww8kxig00hq14031mu94tqi", "cmwm4he4p02o5lb2cp5q1zimo", "a1", "b2"].map(varianteDaConversa).filter((v) => v === 0).length > 1 && ["cmwdsum7q00vnlhcgwzl3ir8d", "cmwdz2yn101helhcg2x0kj13r", "cmwv0wj6816ayyfctx2tufe10", "cmwec2nsm000mqi5qlqubgga6", "cmwec2nss000rqi5q4t5c5akl", "cmwec2nsh000hqi5qnygl2quq", "cmww8kxig00hq14031mu94tqi", "cmwm4he4p02o5lb2cp5q1zimo", "a1", "b2"].map(varianteDaConversa).filter((v) => v === 1).length > 1], [true, true]);

  if (process.argv.includes("--sem-banco")) {
    console.log(falhas === 0 ? "\ntudo certo (sem banco)" : `\n${falhas} falha(s)`);
    process.exit(falhas === 0 ? 0 : 1);
  }

  // ---- ciclo com banco
  const SLUGS = ["teste-acomp-a", "teste-acomp-b"];
  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  const semApi: ClienteIa = { beta: { messages: { create: async () => { throw new Error("o acompanhamento não deve chamar a API"); } } } };
  const mk = async (slug: string, ligado: boolean) => {
    const t = await prisma.tenant.create({ data: { name: slug, slug } });
    await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "VENDEDOR_IA", ativo: true } });
    await prisma.vendedorIaConfig.create({ data: { tenantId: t.id, ativo: true, ativadoEm: horas(24 * 30), nomeAssistente: "Bia", acompanhamento: ligado, acompanhamentoDesde: ligado ? horas(24 * 20) : null, acompanhamentoPorHora: 2 } });
    const sessao = await prisma.whatsAppSession.create({ data: { tenantId: t.id, status: "CONNECTED" } });
    return { t, sessao };
  };
  const A = await mk(SLUGS[0], true);
  const B = await mk(SLUGS[1], false);

  let n = 0;
  async function conversa(L: typeof A, o: { msgs: { direction: "INBOUND" | "OUTBOUND"; h: number; extra?: object; body?: string }[]; jid?: string; responsavel?: boolean; freio?: boolean; ia?: "ATIVA" | "TRANSFERIDA" | null }) {
    n++;
    const contato = await prisma.contact.create({ data: { tenantId: L.t.id, waJid: o.jid ?? `5521987${String(n).padStart(6, "0")}@s.whatsapp.net`, name: `Cliente Teste ${n}` } });
    const ultimaH = Math.min(...o.msgs.map((x) => x.h));
    const u = o.responsavel ? await prisma.user.create({ data: { tenantId: L.t.id, name: `V${n}`, email: `v${n}-acomp@t.com`, passwordHash: "x", role: "AGENT" } }) : null;
    const conv = await prisma.conversation.create({ data: { tenantId: L.t.id, contactId: contato.id, sessionId: L.sessao.id, lastMessageAt: horas(ultimaH), assignedToId: u?.id ?? null } });
    for (const x of o.msgs) {
      await prisma.message.create({ data: { conversationId: conv.id, sessionId: L.sessao.id, direction: x.direction, body: x.body ?? "x", status: "SENT", createdAt: horas(x.h), waMessageId: `a${Math.random()}`, ...(x.extra ?? {}) } });
    }
    if (o.ia !== null) await prisma.vendedorIaConversa.create({ data: { conversationId: conv.id, tenantId: L.t.id, status: o.ia ?? "ATIVA", iniciadaEm: horas(24 * 10) } });
    if (o.freio) await prisma.conversaAgente.create({ data: { conversationId: conv.id, tenantId: L.t.id, estado: "DESLIGADO" } });
    return conv;
  }
  const ia = (h: number) => ({ direction: "OUTBOUND" as const, h, extra: { referenciaExterna: `vendedor-ia:${Math.random()}` } });
  const cli = (h: number, body = "oi") => ({ direction: "INBOUND" as const, h, body });
  const toque = (conv: { id: string }, tentativa: number, h: number) => prisma.acompanhamentoIa.create({ data: { tenantId: A.t.id, conversationId: conv.id, tentativa, resultado: "enviada", enviadoEm: horas(h) } });

  const c1 = await conversa(A, { msgs: [ia(40), cli(35), ia(30)], jid: "198823062335678@lid" }); // 30h de silêncio: 1º toque
  const c2 = await conversa(A, { msgs: [ia(10)] }); // cedo
  const c3 = await conversa(A, { msgs: [ia(60), cli(50, "pode parar de me mandar mensagem"), ia(49)] }); // pediu para parar
  const c4 = await conversa(A, { msgs: [ia(60), { direction: "OUTBOUND", h: 40, extra: { deCelular: true } }] }); // pessoa já falou
  const c5 = await conversa(A, { msgs: [ia(60), cli(30)] }); // cliente esperando a IA
  const c6 = await conversa(A, { msgs: [ia(24 * 7 + 1)] }); // 7 dias: tarde demais
  const c7 = await conversa(A, { msgs: [ia(110), ia(80)] }); // já teve 1 toque (às 80h): vai o 2º
  await toque(c7, 1, 80);
  const c8 = await conversa(A, { msgs: [ia(150), ia(100)] }); // já teve os 2 toques
  await toque(c8, 1, 140);
  await toque(c8, 2, 100);
  const c9 = await conversa(A, { msgs: [ia(40)], responsavel: true }); // com responsável: fora
  const c10 = await conversa(A, { msgs: [ia(40)], freio: true }); // "Assumir": fora
  const c11 = await conversa(A, { msgs: [ia(40)], jid: "123456789012@lid" }); // sem celular
  const c12 = await conversa(A, { msgs: [ia(26)] }); // 1º toque (fica para depois do teto)
  const c13 = await conversa(A, { msgs: [ia(40)], ia: "TRANSFERIDA" }); // IA já passou para a equipe: fora
  const c14 = await conversa(A, { msgs: [ia(40)], ia: null }); // nunca foi da IA: fora
  const cB = await conversa(B, { msgs: [ia(40)] }); // loja com o recurso desligado

  const rodar = (agora: Date) => cicloDeAcompanhamento({ cliente: semApi, agora: () => agora, acordarFila: async () => {} });
  const mais = (s: number) => new Date(quarta.getTime() + s * 1000);
  const linhas = (id: string) => prisma.acompanhamentoIa.findMany({ where: { conversationId: id }, orderBy: { tentativa: "asc" }, select: { tentativa: true, resultado: true } });
  const saidas = (id: string) => prisma.message.findMany({ where: { conversationId: id, direction: "OUTBOUND", status: "PENDING" }, select: { body: true, referenciaExterna: true } });

  // fora do horário e domingo: nada sai
  checa("às 3h da manhã: nada", (await rodar(new Date("2026-11-25T06:00:00Z"))).enviados, 0);
  checa("domingo: nada", (await rodar(new Date("2026-11-29T15:00:00Z"))).enviados, 0);
  checa("nada foi marcado fora do horário (só os 3 toques de partida)", await prisma.acompanhamentoIa.count({ where: { tenantId: A.t.id } }), 3);

  // 1ª volta: sai UM toque por volta, o da conversa parada há mais tempo que ainda cabe: c7 (2º toque)
  let r = await rodar(quarta);
  checa("volta 1: 1 toque enviado", r.enviados, 1);
  const s7 = await saidas(c7.id);
  checa("volta 1: foi o 2º toque da c7, com a marca do acompanhamento", [s7.length, s7[0]?.referenciaExterna?.startsWith("vendedor-ia:acomp:"), /Última mensagem|Não quero te incomodar/.test(s7[0]?.body ?? "")], [1, true, true]);
  checa("volta 1: registrado como tentativa 2", (await linhas(c7.id)).map((x) => [x.tentativa, x.resultado]), [[1, "enviada"], [2, "enviada"]]);

  checa("30 s depois: respeita o espaçamento de 90 s", (await rodar(mais(30))).enviados, 0);

  // 2ª volta (2 min depois): c1 (1º toque)
  r = await rodar(mais(120));
  const s1 = await saidas(c1.id);
  checa("volta 2: 1º toque da c1 (Oi... Aqui é Bia da loja)", [r.enviados, s1.length, /^Oi/.test(s1[0]?.body ?? ""), (s1[0]?.body ?? "").includes("Aqui é Bia da teste-acomp-a")], [1, 1, true, true]);

  // teto por hora = 2: a c12 espera
  checa("teto de 2 por hora: a terceira não sai", (await rodar(mais(300))).enviados, 0);
  checa("a c12 continua sem toque", (await linhas(c12.id)).length, 0);
  checa("1 h depois: a c12 recebe o 1º toque", (await rodar(mais(3600 + 400))).enviados, 1);

  // as ignoradas foram marcadas (tentativa 0) e as de esperar não
  const marcado = async (id: string) => (await linhas(id)).find((x) => x.tentativa === 0)?.resultado ?? null;
  checa("c3 pediu para parar: marcada", await marcado(c3.id), "ignorada: o cliente pediu para parar");
  checa("c4 pessoa já falou: marcada", await marcado(c4.id), "ignorada: uma pessoa da loja já falou com o cliente");
  checa("c6 tarde demais: marcada", await marcado(c6.id), "ignorada: faz tempo demais para retomar");
  checa("c8 já fez os 2 toques: marcada", await marcado(c8.id), "ignorada: já fez os 2 toques");
  checa("c11 sem celular: marcada", await marcado(c11.id), "ignorada: contato sem celular de WhatsApp");
  checa("c2 (cedo) e c5 (cliente esperando) não foram marcadas", [(await linhas(c2.id)).length, (await linhas(c5.id)).length], [0, 0]);
  const intocadas = await Promise.all([c9, c10, c13, c14].map(async (c) => (await linhas(c.id)).length + (await saidas(c.id)).length));
  checa("c9 (com responsável), c10 (IA parada), c13 (transferida) e c14 (nunca da IA): sem registro nem mensagem", intocadas, [0, 0, 0, 0]);
  checa("loja com o recurso desligado: nada", [(await linhas(cB.id)).length, (await saidas(cB.id)).length], [0, 0]);
  checa("os 3 toques ficaram PENDING na fila (o worker do WhatsApp é quem manda)", await prisma.message.count({ where: { conversation: { tenantId: A.t.id }, referenciaExterna: { startsWith: "vendedor-ia:acomp:" }, status: "PENDING" } }), 3);

  await prisma.tenant.deleteMany({ where: { slug: { in: SLUGS } } });
  console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
  await prisma.$disconnect();
  process.exit(falhas === 0 ? 0 : 1);
}
main().catch(async (e) => {
  console.error(e);
  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-acomp-a", "teste-acomp-b"] } } }).catch(() => {});
  process.exit(1);
});
