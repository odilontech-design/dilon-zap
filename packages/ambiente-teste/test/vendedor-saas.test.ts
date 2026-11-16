import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { prisma } from "@dilon-zap/db";
import { ErroSdrCore } from "@dilon-zap/sdr-core";
import type { PedidoAoProvedor, Provedores } from "../../sdr-core/src/ia/provedores";
import { cicloDoVendedor, definirControleDaConversa, descartarSugestao, enviarSugestao, listarConversasDoVendedor, obterConfigDoVendedor, obterControleDaConversa, salvarConfigDoVendedor } from "../../vendedor-ia/src/saas/vendedor";
import { decidir, dentroDoHorario, ESPERA_MS, linksNaoPermitidos, montarHistorico, paraWhatsApp, PREFIXO_DA_IA, type EstadoDaConversa, type MensagemDaConversa } from "../../vendedor-ia/src/saas/regras";
import { cnpjDe } from "./dados";

/**
 * O vendedor de SaaS do SDR: as regras (puras, com datas fixas) e o ciclo completo com um provedor de IA falso.
 * Nada aqui chama Gemini, Claude ou WhatsApp: o falso devolve o JSON que o teste manda, e as mensagens da IA só
 * chegam à tabela Message como PENDING.
 */

// Quarta-feira, 12:00 em Brasília.
const AGORA = new Date("2026-11-18T15:00:00Z");
const ATIVADO = new Date("2026-11-18T12:00:00Z");
const minutosAtras = (n: number, de = AGORA) => new Date(de.getTime() - n * 60_000);

/* ---------------------------------------------------------------- regras puras ---- */

const msg = (direction: "INBOUND" | "OUTBOUND", quando: Date, extra: Partial<MensagemDaConversa> = {}): MensagemDaConversa => ({
  direction, body: direction === "INBOUND" ? "Oi, quanto custa?" : "Olá, tudo bem?", mediaType: null, createdAt: quando, senderUserId: null, deCelular: false, isDeleted: false, referenciaExterna: null, ...extra,
});
const abertura = (quando: Date) => msg("OUTBOUND", quando, { senderUserId: "u1", body: "Olá! Aqui é o Felipe, da Dilon Tech." });
const resposta = (quando: Date, extra: Partial<MensagemDaConversa> = {}) => msg("INBOUND", quando, extra);

const estado = (mensagens: MensagemDaConversa[], extra: Partial<EstadoDaConversa> = {}): EstadoDaConversa => ({
  conversa: null, mensagens, janela: 40, ativadoEm: ATIVADO, limiteTurnos: 8, horaInicio: 8, horaFim: 20, ...extra,
});
const ativa = (extra: Partial<NonNullable<EstadoDaConversa["conversa"]>> = {}) => ({ status: "ATIVA" as const, respondidoAte: null, turnos: 0, iniciadaEm: minutosAtras(8), proximaTentativaEm: null, ...extra });

describe("regras: quando o vendedor responde", () => {
  test("responde a quem respondeu a uma abordagem nossa", () => {
    assert.deepEqual(decidir(estado([abertura(minutosAtras(10)), resposta(minutosAtras(2))]), AGORA), { acao: "responder" });
  });
  test("espera o fim da digitação", () => {
    const d = decidir(estado([abertura(minutosAtras(10)), resposta(new Date(AGORA.getTime() - ESPERA_MS + 1_000))]), AGORA);
    assert.equal(d.acao, "esperar");
  });
  test("nunca puxa assunto: sem resposta da empresa, ou sem abordagem nossa antes, ignora", () => {
    assert.equal(decidir(estado([abertura(minutosAtras(10))]), AGORA).acao, "ignorar");
    assert.equal(decidir(estado([resposta(minutosAtras(2))]), AGORA).acao, "ignorar");
    // A empresa escreveu primeiro (não veio de uma abordagem do SDR).
    assert.equal(decidir(estado([resposta(minutosAtras(20)), abertura(minutosAtras(10)), resposta(minutosAtras(2))]), AGORA).acao, "ignorar");
  });
  test("mensagem de antes de ligar o vendedor não é respondida", () => {
    assert.equal(decidir(estado([abertura(minutosAtras(400)), resposta(minutosAtras(300))]), AGORA).acao, "ignorar");
  });
  test("se uma pessoa já tinha respondido a empresa antes de a IA chegar, a IA nem entra", () => {
    const ms = [abertura(minutosAtras(30)), resposta(minutosAtras(20)), msg("OUTBOUND", minutosAtras(15), { deCelular: true }), resposta(minutosAtras(2))];
    assert.deepEqual(decidir(estado(ms), AGORA), { acao: "ignorar", motivo: "a equipe já atendia" });
  });
  test("robô de menu e a própria IA não contam como equipe", () => {
    const ms = [abertura(minutosAtras(30)), resposta(minutosAtras(20)), msg("OUTBOUND", minutosAtras(19)), msg("OUTBOUND", minutosAtras(18), { referenciaExterna: `${PREFIXO_DA_IA}x` }), resposta(minutosAtras(2))];
    assert.equal(decidir(estado(ms), AGORA).acao, "responder");
  });
  test("pessoa da equipe falou depois que a IA começou: passa a conversa e não responde", () => {
    const ms = [abertura(minutosAtras(30)), resposta(minutosAtras(20)), msg("OUTBOUND", minutosAtras(10), { senderUserId: "u1" }), resposta(minutosAtras(2))];
    assert.deepEqual(decidir(estado(ms, { conversa: ativa({ iniciadaEm: minutosAtras(25) }) }), AGORA), { acao: "transferir", motivo: "equipe respondeu" });
  });
  test("já transferida ou encerrada nunca volta para a IA", () => {
    const ms = [abertura(minutosAtras(10)), resposta(minutosAtras(2))];
    assert.equal(decidir(estado(ms, { conversa: { ...ativa(), status: "TRANSFERIDA" } }), AGORA).acao, "ignorar");
    assert.equal(decidir(estado(ms, { conversa: { ...ativa(), status: "ENCERRADA" } }), AGORA).acao, "ignorar");
  });
  test("mensagem já tratada não é respondida de novo", () => {
    const ms = [abertura(minutosAtras(10)), resposta(minutosAtras(5))];
    assert.equal(decidir(estado(ms, { conversa: ativa({ respondidoAte: minutosAtras(5) }) }), AGORA).acao, "ignorar");
  });
  test("depois do limite de respostas, passa para uma pessoa", () => {
    const ms = [abertura(minutosAtras(10)), resposta(minutosAtras(2))];
    assert.deepEqual(decidir(estado(ms, { conversa: ativa({ turnos: 8 }) }), AGORA), { acao: "transferir", motivo: "limite de respostas da IA na conversa" });
  });
  test("espera a próxima tentativa depois de uma falha", () => {
    const ms = [abertura(minutosAtras(10)), resposta(minutosAtras(2))];
    assert.equal(decidir(estado(ms, { conversa: ativa({ proximaTentativaEm: new Date(AGORA.getTime() + 60_000) }) }), AGORA).acao, "esperar");
  });
  test("conversa longa demais para a janela não é assumida", () => {
    const longa = Array.from({ length: 40 }, (_, i) => msg(i % 2 ? "OUTBOUND" : "INBOUND", minutosAtras(100 - i), { deCelular: i % 2 === 1 }));
    assert.equal(decidir(estado([...longa.slice(0, 39), resposta(minutosAtras(2))]), AGORA).acao, "ignorar");
  });
  test("mensagem com mais de 48 h não é respondida por robô", () => {
    const antigo = new Date(AGORA.getTime() - 49 * 3_600_000);
    assert.deepEqual(decidir(estado([abertura(minutosAtras(60, antigo)), resposta(antigo)], { ativadoEm: new Date(antigo.getTime() - 3_600_000) }), AGORA), { acao: "ignorar", motivo: "mensagem velha" });
  });
});

describe("regras: controle manual da conversa", () => {
  const ms = [abertura(minutosAtras(10)), resposta(minutosAtras(2))];
  test("desligado é o freio: nada é respondido, nem uma conversa que o automático atenderia", () => {
    assert.equal(decidir(estado(ms), AGORA).acao, "responder");
    assert.deepEqual(decidir(estado(ms, { controle: "DESLIGADO" }), AGORA), { acao: "ignorar", motivo: "desligado nesta conversa" });
  });
  test("ligado à mão responde fora do SDR: sem abordagem nossa antes, e também a mensagem que já esperava", () => {
    const soDaEmpresa = [resposta(minutosAtras(3))];
    assert.equal(decidir(estado(soDaEmpresa), AGORA).acao, "ignorar", "no automático, a empresa não escreveu depois de uma abordagem nossa");
    assert.deepEqual(decidir(estado(soDaEmpresa, { controle: "LIGADO" }), AGORA), { acao: "responder" });
    const antigaDeHoje = [resposta(new Date(AGORA.getTime() - 3 * 3_600_000))];
    assert.equal(decidir(estado(antigaDeHoje, { ativadoEm: minutosAtras(1) }), AGORA).acao, "ignorar", "automático: mensagem de antes de ligar o vendedor");
    assert.deepEqual(decidir(estado(antigaDeHoje, { ativadoEm: minutosAtras(1), controle: "LIGADO" }), AGORA), { acao: "responder" });
  });
  test("ligado à mão ainda respeita horário, limite de respostas e a equipe falando depois", () => {
    const noite = new Date("2026-11-19T01:00:00Z");
    assert.equal(decidir(estado([resposta(minutosAtras(2, noite))], { controle: "LIGADO" }), noite).acao, "esperar");
    assert.equal(decidir(estado([resposta(minutosAtras(2))], { controle: "LIGADO", conversa: ativa({ turnos: 8 }) }), AGORA).acao, "transferir");
    const comEquipe = [resposta(minutosAtras(7)), msg("OUTBOUND", minutosAtras(5), { senderUserId: "u1" }), resposta(minutosAtras(2))];
    assert.deepEqual(decidir(estado(comEquipe, { controle: "LIGADO", conversa: ativa({ iniciadaEm: minutosAtras(8) }) }), AGORA), { acao: "transferir", motivo: "equipe respondeu" });
  });
});

describe("regras: horário e textos", () => {
  test("segunda a sábado, das 8 às 20 (Brasília); domingo nunca", () => {
    assert.equal(dentroDoHorario(new Date("2026-11-18T11:00:00Z"), 8, 20), true); // qua 08:00
    assert.equal(dentroDoHorario(new Date("2026-11-18T10:59:00Z"), 8, 20), false); // qua 07:59
    assert.equal(dentroDoHorario(new Date("2026-11-18T22:59:00Z"), 8, 20), true); // qua 19:59
    assert.equal(dentroDoHorario(new Date("2026-11-18T23:00:00Z"), 8, 20), false); // qua 20:00
    assert.equal(dentroDoHorario(new Date("2026-11-21T15:00:00Z"), 8, 20), true); // sáb 12:00
    assert.equal(dentroDoHorario(new Date("2026-11-22T15:00:00Z"), 8, 20), false); // dom 12:00
  });
  test("fora do horário a IA espera, e dentro dele responde", () => {
    const noite = new Date("2026-11-18T23:30:00Z"); // 20:30
    const ms = [abertura(minutosAtras(10, noite)), resposta(minutosAtras(2, noite))];
    assert.deepEqual(decidir(estado(ms, { ativadoEm: minutosAtras(600, noite) }), noite), { acao: "esperar", motivo: "fora do horário" });
  });
  test("o histórico junta mensagens seguidas, marca mídia e só vale se a última é da empresa", () => {
    const h = montarHistorico([abertura(minutosAtras(10)), resposta(minutosAtras(5)), resposta(minutosAtras(4), { body: "", mediaType: "AUDIO" }), msg("OUTBOUND", minutosAtras(3), { senderUserId: "u1" }), resposta(minutosAtras(1), { body: "e o preço?" })]);
    assert.deepEqual(h?.map((t) => t.de), ["nos", "empresa", "nos", "empresa"]);
    assert.equal(h?.[1].texto, "Oi, quanto custa?\n[áudio]");
    assert.equal(montarHistorico([resposta(minutosAtras(5)), abertura(minutosAtras(1))]), null);
  });
  test("o WhatsApp usa um asterisco para negrito e não tem título", () => {
    assert.equal(paraWhatsApp("## Plano\n**Revenda** custa R$ 597\n\n\n\nOk"), "Plano\n*Revenda* custa R$ 597\n\nOk");
  });
  test("só o link da agenda e o site da Dilon Tech são permitidos", () => {
    const ok = ["https://agenda.teste/demo", "https://dilontech.com.br"];
    assert.deepEqual(linksNaoPermitidos("Agende em https://agenda.teste/demo e veja dilontech.com.br/zap", ok), []);
    assert.deepEqual(linksNaoPermitidos("Veja bit.ly/abc ou http://golpe.com/x", ok), ["bit.ly/abc", "http://golpe.com/x"]);
    assert.deepEqual(linksNaoPermitidos("Sem endereço nenhum, só texto.", ok), []);
    assert.equal(linksNaoPermitidos("https://agenda.teste.evil.com/demo", ok).length, 1);
  });
});

/* ------------------------------------------------------------------ ciclo ---- */

type RespostaFalsa = { resposta: string; acao: string; resumo?: string } | Error;
const chamadas: PedidoAoProvedor[] = [];
let proximas: RespostaFalsa[] = [];
const falso = {
  chamar: async (p: PedidoAoProvedor) => {
    chamadas.push(p);
    const r = proximas.shift();
    if (!r) throw new Error("o teste não programou esta chamada");
    if (r instanceof Error) throw r;
    return { texto: JSON.stringify({ resumo: "", ...r }), tokensEntrada: 100, tokensSaida: 50 };
  },
};
const provedores: Provedores = { anthropic: falso, gemini: falso };
const acordadas: string[] = [];
const deps = { provedores, agora: () => AGORA, acordarFila: async (t: string) => void acordadas.push(t) };
const programar = (...r: RespostaFalsa[]) => void (proximas = r);

let tenant = "";
let outro = "";
let sessao = "";
let funilId = "";
let etapaId = "";
let campanhaId = "";
let seq = 9700;
let telefone = 5521988200000;
const autor = { id: "u-vendedor", name: "Felipe" };

/** Uma empresa do SDR com negociação, conversa e a abordagem já enviada por uma pessoa. A empresa responde no minuto `-2`. */
async function montar(nome: string, opcoes: { etapa?: "CONTATADA" | "REUNIAO"; semAbertura?: boolean; semNegociacao?: boolean; t?: string; resposta?: string | null } = {}) {
  const t = opcoes.t ?? tenant;
  seq++;
  telefone++;
  const empresa = await prisma.sdrEmpresa.create({ data: { tenantId: t, razaoSocial: `${nome} Ltda`, nomeFantasia: nome, chaveNome: nome.toLowerCase(), uf: "RJ", cidade: "Niterói", segmento: "Revenda de veículos", cnpj: cnpjDe(seq), telefone: String(telefone) } });
  const contato = await prisma.contact.create({ data: { tenantId: t, waJid: `${telefone}@s.whatsapp.net`, phoneNumber: String(telefone), name: nome } });
  const sessaoDaEmpresa = t === tenant ? sessao : (await prisma.whatsAppSession.create({ data: { tenantId: t, label: "Outro" } })).id;
  const conversa = await prisma.conversation.create({ data: { tenantId: t, sessionId: sessaoDaEmpresa, contactId: contato.id, status: "OPEN", lastMessageAt: minutosAtras(2) } });
  let negociacaoId: string | null = null;
  if (!opcoes.semNegociacao) {
    const f = t === tenant ? funilId : (await prisma.funil.create({ data: { tenantId: t, nome: "Prospecção ativa" } })).id;
    const e = t === tenant ? etapaId : (await prisma.stage.create({ data: { tenantId: t, funilId: f, name: "Lista", position: 0 } })).id;
    negociacaoId = (await prisma.negociacao.create({ data: { tenantId: t, contactId: contato.id, funilId: f, stageId: e, titulo: nome, origem: "SDR" } })).id;
  }
  await prisma.sdrAcompanhamento.create({ data: { tenantId: t, empresaId: empresa.id, etapa: opcoes.etapa ?? "CONTATADA", negociacaoId } });
  if (t === tenant) await prisma.sdrProspecto.create({ data: { tenantId: t, empresaId: empresa.id, campanhaId, icpId: (await prisma.sdrCampanha.findUniqueOrThrow({ where: { id: campanhaId } })).icpId } });
  const base = { conversationId: conversa.id, sessionId: sessaoDaEmpresa };
  if (!opcoes.semAbertura) await prisma.message.create({ data: { ...base, direction: "OUTBOUND", status: "SENT", body: "Olá! Aqui é o Felipe, da Dilon Tech.", deCelular: true, createdAt: minutosAtras(10) } });
  if (opcoes.resposta !== null) await prisma.message.create({ data: { ...base, direction: "INBOUND", body: opcoes.resposta ?? "Oi, quanto custa?", createdAt: minutosAtras(2) } });
  return { empresaId: empresa.id, conversationId: conversa.id, sessionId: sessaoDaEmpresa, contatoId: contato.id };
}

const mensagensDaIa = (conversationId: string) => prisma.message.findMany({ where: { conversationId, referenciaExterna: { startsWith: PREFIXO_DA_IA } }, orderBy: { createdAt: "asc" } });
const estadoDe = (conversationId: string) => prisma.sdrVendedorConversa.findUnique({ where: { conversationId } });
const etapaDe = async (empresaId: string) => (await prisma.sdrAcompanhamento.findUniqueOrThrow({ where: { tenantId_empresaId: { tenantId: tenant, empresaId } } })).etapa;

async function configurar(modo: "SUGERIR" | "AUTOMATICO", extra: Record<string, unknown> = {}) {
  await prisma.sdrVendedorConfig.upsert({
    where: { tenantId: tenant },
    create: { tenantId: tenant, ativo: true, modo, ativadoEm: ATIVADO, nomeAssistente: "Assistente da Dilon Tech", instrucoes: "Nunca fale de preço de implantação.", ...extra },
    update: { ativo: true, modo, ativadoEm: ATIVADO, ...extra },
  });
}

// Dentro de um describe, e não no topo: os testes de guarda (nada de CRM nem de WhatsApp, só as empresas previstas têm o SDR)
// exigem o banco sem contato, conversa, mensagem, sessão nem recurso até rodarem, e o teste só deve criar isso quando chega a sua vez.
describe("vendedor de SaaS: ciclo, configuração e painel", () => {
before(async () => {
  tenant = (await prisma.tenant.create({ data: { name: "vendedor-saas", slug: "vendedor-saas-teste" } })).id;
  outro = (await prisma.tenant.create({ data: { name: "vendedor-saas-2", slug: "vendedor-saas-teste-2" } })).id;
  for (const t of [tenant, outro]) await prisma.tenantRecurso.create({ data: { tenantId: t, recurso: "SDR", ativo: true } });
  sessao = (await prisma.whatsAppSession.create({ data: { tenantId: tenant, label: "Principal" } })).id;
  funilId = (await prisma.funil.create({ data: { tenantId: tenant, nome: "Prospecção ativa" } })).id;
  etapaId = (await prisma.stage.create({ data: { tenantId: tenant, funilId, name: "Lista", position: 0 } })).id;
  const icp = await prisma.sdrIcp.create({ data: { tenantId: tenant, nome: "Revendas" } });
  campanhaId = (
    await prisma.sdrCampanha.create({
      data: {
        tenantId: tenant, nome: "Revendas AutoCerto", icpId: icp.id, status: "ATIVA", produto: "DILON_ZAP", linkAgenda: "https://agenda.teste/demo",
        publico: "Revendas de RJ e SP", argumento: "Equipe toda no WhatsApp da loja.", ofertas: "Revenda: R$ 597/mês até 70 carros.",
        objecoes: [{ objecao: "Já uso AutoCerto", resposta: "A migração é com a gente." }],
      },
    })
  ).id;
  const preco = { entradaMicroPorMilTokens: 0, saidaMicroPorMilTokens: 0 };
  await prisma.sdrIaConfig.create({
    data: {
      tenantId: tenant, ativa: true, orcamentoDiarioMicro: 1_000_000, orcamentoMensalMicro: 10_000_000, limiteTokensEntrada: 8000, limiteTokensSaida: 2000, cacheHoras: 0,
      modelos: { vendedor_saas: { principal: "gemini:gemini-3.5-flash-lite" } },
      precos: { "gemini:gemini-3.5-flash-lite": preco },
    },
  });
});
after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenant, outro] } } });
});

describe("ciclo: modo sugerir", () => {
  test("a IA escreve a resposta, mas não envia nem mexe na etapa", async () => {
    await configurar("SUGERIR");
    const c = await montar("Auto Sugestao");
    programar({ resposta: "Oi! O plano Revenda custa R$ 597/mês até 70 carros. Posso te mostrar em 20 minutos?", acao: "interesse", resumo: "Perguntou preço." });
    const r = await cicloDoVendedor(deps);
    assert.equal(r.sugeridas, 1);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 0);
    const e = await estadoDe(c.conversationId);
    assert.equal(e?.status, "ATIVA");
    assert.equal(e?.sugestaoAcao, "interesse");
    assert.ok(e?.sugestao?.includes("R$ 597"));
    assert.equal(await etapaDe(c.empresaId), "CONTATADA");
  });
  test("o modelo recebe o roteiro e o histórico como DADOS, e as regras no sistema; sem telefone nem CNPJ", async () => {
    const p = chamadas[chamadas.length - 1];
    assert.ok(p.sistema.includes("Nunca puxa assunto") || p.sistema.includes("nunca puxa assunto"));
    assert.ok(p.sistema.includes("Nunca fale de preço de implantação."));
    assert.ok(p.usuario.includes("R$ 597/mês até 70 carros"));
    assert.ok(p.usuario.includes("https://agenda.teste/demo"));
    assert.ok(p.usuario.includes("quanto custa"));
    assert.ok(!/\d{10,}/.test(p.usuario), "não pode ir telefone nem CNPJ ao modelo");
    assert.ok(!p.sistema.includes("quanto custa"), "texto da empresa nunca entra no sistema");
  });
  test("repetir o ciclo não chama a IA de novo, e uma nova mensagem da empresa gera outra sugestão", async () => {
    const antes = chamadas.length;
    assert.equal((await cicloDoVendedor(deps)).sugeridas, 0);
    assert.equal(chamadas.length, antes);
    const c = await prisma.sdrVendedorConversa.findFirstOrThrow({ where: { tenantId: tenant, status: "ATIVA", sugestao: { not: null } } });
    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: sessao, direction: "INBOUND", body: "Aceita Pix?", createdAt: minutosAtras(1) } });
    programar({ resposta: "Aceitamos, sim. Vou confirmar os detalhes com a equipe.", acao: "continuar" });
    assert.equal((await cicloDoVendedor(deps)).sugeridas, 1);
    assert.ok((await estadoDe(c.conversationId))?.sugestao?.includes("Pix") || (await estadoDe(c.conversationId))?.sugestao?.includes("Aceitamos"));
  });
  test("enviar a sugestão cria a mensagem PENDING, sobe a etapa e conta uma resposta", async () => {
    const c = await prisma.sdrVendedorConversa.findFirstOrThrow({ where: { tenantId: tenant, status: "ATIVA", sugestao: { not: null } } });
    const r = await enviarSugestao(tenant, c.conversationId, { texto: "Aceitamos, sim! Qual o melhor horário para uma demonstração de 20 minutos?" }, deps);
    assert.equal(r.enviada, true);
    const ms = await mensagensDaIa(c.conversationId);
    assert.equal(ms.length, 1);
    assert.equal(ms[0].status, "PENDING");
    assert.equal(ms[0].direction, "OUTBOUND");
    assert.ok(ms[0].body.startsWith("Aceitamos, sim!"));
    const e = await estadoDe(c.conversationId);
    assert.equal(e?.turnos, 1);
    assert.equal(e?.sugestao, null);
    assert.equal(await etapaDe(c.empresaId), "RESPONDEU");
    assert.ok(acordadas.includes(tenant));
    await assert.rejects(() => enviarSugestao(tenant, c.conversationId, {}, deps), (e: unknown) => e instanceof ErroSdrCore && e.status === 409);
  });
  test("o texto editado não pode ter endereço fora do roteiro", async () => {
    await prisma.sdrVendedorConversa.updateMany({ where: { tenantId: tenant, sugestao: null, status: "ATIVA" }, data: { sugestao: "Posso te ajudar?", sugestaoAcao: "continuar" } });
    const c = await prisma.sdrVendedorConversa.findFirstOrThrow({ where: { tenantId: tenant, status: "ATIVA", sugestao: { not: null } } });
    await assert.rejects(() => enviarSugestao(tenant, c.conversationId, { texto: "Veja http://golpe.com/x" }, deps), (e: unknown) => e instanceof ErroSdrCore && e.status === 400);
    assert.equal((await descartarSugestao(tenant, c.conversationId)).descartada, true);
    assert.equal((await estadoDe(c.conversationId))?.sugestao, null);
  });
});

describe("ciclo: modo automático", () => {
  before(() => configurar("AUTOMATICO"));

  test("responde, enfileira a mensagem e sobe a etapa para respondeu", async () => {
    const c = await montar("Auto Automatica");
    programar({ resposta: "Oi! Posso te explicar rapidinho como funciona. Vocês usam qual sistema hoje?", acao: "continuar", resumo: "Quer saber mais." });
    const r = await cicloDoVendedor(deps);
    assert.equal(r.respondidas >= 1, true);
    const ms = await mensagensDaIa(c.conversationId);
    assert.equal(ms.length, 1);
    assert.equal(ms[0].status, "PENDING");
    assert.equal(ms[0].sessionId, c.sessionId);
    assert.equal(await etapaDe(c.empresaId), "RESPONDEU");
    assert.equal((await estadoDe(c.conversationId))?.turnos, 1);
    // A empresa ainda não respondeu de novo: o próximo ciclo não faz nada.
    const antes = chamadas.length;
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes);
  });
  test("a empresa quer a demonstração: manda o link da agenda, vira reunião e passa para uma pessoa", async () => {
    const c = await montar("Auto Demonstracao", { resposta: "Quero ver funcionando, quando dá?" });
    programar({ resposta: "Claro! Vou deixar o melhor caminho para você.", acao: "demonstracao", resumo: "Quer demonstração, usa AutoCerto." });
    await cicloDoVendedor(deps);
    const ms = await mensagensDaIa(c.conversationId);
    assert.equal(ms.length, 1);
    assert.ok(ms[0].body.includes("https://agenda.teste/demo"), "o link da agenda é acrescentado mesmo que o modelo esqueça");
    assert.equal(await etapaDe(c.empresaId), "REUNIAO");
    const a = await prisma.sdrAcompanhamento.findUniqueOrThrow({ where: { tenantId_empresaId: { tenantId: tenant, empresaId: c.empresaId } } });
    assert.ok(a.proximaAcao?.includes("Confirmar a demonstração"));
    const e = await estadoDe(c.conversationId);
    assert.equal(e?.status, "TRANSFERIDA");
    assert.equal((await prisma.conversation.findUniqueOrThrow({ where: { id: c.conversationId } })).status, "PENDING");
    const nota = await prisma.sdrInteracao.findFirst({ where: { tenantId: tenant, empresaId: c.empresaId, tipo: "NOTA" } });
    assert.ok(nota?.texto?.includes("passou a conversa para a equipe"));
    // Transferida: não volta para a IA, mesmo que a empresa escreva.
    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "INBOUND", body: "Obrigado!", createdAt: minutosAtras(1) } });
    const antes = chamadas.length;
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes);
  });
  test("pediu para não ser contatada: texto fixo, entra na lista de bloqueio e a conversa encerra", async () => {
    const c = await montar("Auto Descadastro", { resposta: "Parem de me mandar mensagem" });
    programar({ resposta: "Desculpe o incômodo, vou parar. Fico à disposição.", acao: "nao_contatar", resumo: "Pediu para parar." });
    await cicloDoVendedor(deps);
    const ms = await mensagensDaIa(c.conversationId);
    assert.equal(ms.length, 1);
    assert.ok(ms[0].body.includes("não enviaremos mais mensagens"), "o texto de descadastro é fixo, não o do modelo");
    assert.equal(await etapaDe(c.empresaId), "NAO_CONTATAR");
    assert.equal((await estadoDe(c.conversationId))?.status, "ENCERRADA");
    const bloqueio = await prisma.sdrSupressao.count({ where: { tenantId: tenant, tipo: "CNPJ" } });
    assert.ok(bloqueio >= 1);
  });
  test("sem interesse: agradece, registra e encerra", async () => {
    const c = await montar("Auto Sem Interesse", { resposta: "Não temos interesse, obrigado" });
    programar({ resposta: "Tudo bem, obrigado pelo retorno!", acao: "sem_interesse", resumo: "Sem interesse." });
    await cicloDoVendedor(deps);
    assert.equal(await etapaDe(c.empresaId), "SEM_INTERESSE");
    assert.equal((await estadoDe(c.conversationId))?.status, "ENCERRADA");
    assert.equal((await mensagensDaIa(c.conversationId)).length, 1);
  });
  test("endereço fora do roteiro: nada é enviado e a conversa vai para uma pessoa", async () => {
    const c = await montar("Auto Link Falso", { resposta: "Tem site para eu ver?" });
    programar({ resposta: "Claro, veja em http://golpe.com/oferta", acao: "continuar" });
    await cicloDoVendedor(deps);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 0);
    const e = await estadoDe(c.conversationId);
    assert.equal(e?.status, "TRANSFERIDA");
    assert.ok(e?.motivo?.includes("endereço"));
  });
  test("resposta vazia vira transferência com um texto padrão, e acao fora da lista é descartada", async () => {
    const vazia = await montar("Auto Vazia", { resposta: "???" });
    programar({ resposta: "", acao: "continuar" });
    await cicloDoVendedor(deps);
    assert.ok((await mensagensDaIa(vazia.conversationId))[0].body.includes("colega da nossa equipe"));
    assert.equal((await estadoDe(vazia.conversationId))?.status, "TRANSFERIDA");

    const invalida = await montar("Auto Invalida", { resposta: "Oi" });
    programar({ resposta: "Olá!", acao: "apagar_tudo" }, { resposta: "Olá!", acao: "apagar_tudo" });
    const r = await cicloDoVendedor(deps);
    assert.equal(r.erros >= 1, true);
    assert.equal((await mensagensDaIa(invalida.conversationId)).length, 0);
    assert.equal(await etapaDe(invalida.empresaId), "CONTATADA");
  });
  test("a equipe responde por conta própria: a IA sai e não envia nada", async () => {
    const c = await montar("Auto Equipe", { resposta: "Bom dia" });
    programar({ resposta: "Bom dia! Como posso ajudar?", acao: "continuar" });
    await cicloDoVendedor(deps);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 1);
    // Cinco minutos depois, uma pessoa escreve pelo celular e a empresa responde: a IA não responde mais.
    const depois = new Date(AGORA.getTime() + 5 * 60_000);
    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "OUTBOUND", status: "SENT", body: "Aqui é o Felipe, vou assumir.", deCelular: true, createdAt: minutosAtras(2, depois) } });
    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "INBOUND", body: "Ok, obrigado", createdAt: minutosAtras(1, depois) } });
    // Com o relógio avançado, outras conversas pendentes de testes anteriores também entram no ciclo; vale só o que acontece nesta.
    await cicloDoVendedor({ ...deps, agora: () => depois });
    assert.equal((await mensagensDaIa(c.conversationId)).length, 1);
    const e = await estadoDe(c.conversationId);
    assert.equal(e?.status, "TRANSFERIDA");
    assert.equal(e?.motivo, "equipe respondeu");
  });
  test("falha do provedor: tenta de novo mais tarde e, na terceira, passa para uma pessoa; nada é enviado", async () => {
    const c = await montar("Auto Falha", { resposta: "Oi, tudo bem?" });
    const falha = () => new Error("429 limite do plano gratuito");
    programar(falha(), falha());
    const r1 = await cicloDoVendedor(deps);
    assert.equal(r1.erros >= 1, true);
    assert.equal((await estadoDe(c.conversationId))?.tentativas, 1);
    // Ainda dentro da espera: não chama.
    const antes = chamadas.length;
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes);
    // Passada a espera, tenta de novo (e falha de novo).
    for (const minutos of [1, 5]) {
      programar(falha(), falha());
      await cicloDoVendedor({ ...deps, agora: () => new Date(AGORA.getTime() + minutos * 60_000) });
    }
    assert.equal((await estadoDe(c.conversationId))?.status, "TRANSFERIDA");
    assert.equal((await mensagensDaIa(c.conversationId)).length, 0);
  });
  test("o limite de respostas passa a conversa para uma pessoa", async () => {
    await configurar("AUTOMATICO", { limiteTurnos: 1 });
    try {
      const c = await montar("Auto Limite", { resposta: "Oi" });
      programar({ resposta: "Olá! Em que posso ajudar?", acao: "continuar" });
      await cicloDoVendedor(deps);
      const depois = new Date(AGORA.getTime() + 5 * 60_000);
      await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "INBOUND", body: "Queria saber mais", createdAt: minutosAtras(1, depois) } });
      await cicloDoVendedor({ ...deps, agora: () => depois });
      assert.equal((await mensagensDaIa(c.conversationId)).length, 1, "a IA não responde depois do limite");
      assert.equal((await estadoDe(c.conversationId))?.motivo, "limite de respostas da IA na conversa");
    } finally {
      await configurar("AUTOMATICO", { limiteTurnos: 8 });
    }
  });
  test("fora do horário a IA espera, e responde quando abre a janela", async () => {
    const c = await montar("Auto Madrugada", { resposta: "Boa noite" });
    const noite = new Date("2026-11-19T01:00:00Z"); // 22:00 em Brasília
    await prisma.message.updateMany({ where: { conversationId: c.conversationId, direction: "OUTBOUND" }, data: { createdAt: minutosAtras(10, noite) } });
    await prisma.message.updateMany({ where: { conversationId: c.conversationId, direction: "INBOUND" }, data: { createdAt: minutosAtras(2, noite) } });
    await prisma.conversation.update({ where: { id: c.conversationId }, data: { lastMessageAt: minutosAtras(2, noite) } });
    const antes = chamadas.length;
    await cicloDoVendedor({ ...deps, agora: () => noite });
    assert.equal(chamadas.length, antes);
    programar({ resposta: "Bom dia! Como posso ajudar?", acao: "continuar" });
    await cicloDoVendedor({ ...deps, agora: () => new Date("2026-11-19T11:30:00Z") }); // 08:30
    assert.equal((await mensagensDaIa(c.conversationId)).length, 1);
  });
});

describe("ciclo: o que não é do vendedor", () => {
  test("conversa de contato sem negociação do SDR, empresa já em reunião e abordagem sem resposta são ignoradas", async () => {
    const semNegociacao = await montar("Auto Sem Negociacao", { semNegociacao: true });
    const emReuniao = await montar("Auto Em Reuniao", { etapa: "REUNIAO" });
    const semResposta = await montar("Auto Sem Resposta", { resposta: null });
    await cicloDoVendedor(deps);
    for (const c of [semNegociacao, emReuniao, semResposta]) {
      assert.equal(await estadoDe(c.conversationId), null);
      assert.equal((await mensagensDaIa(c.conversationId)).length, 0);
    }
  });
  test("a conversa que não começou por uma abordagem nossa (a empresa escreveu primeiro) não é assumida", async () => {
    const c = await montar("Auto Escreveu Primeiro", { semAbertura: true });
    await cicloDoVendedor(deps);
    assert.equal(await estadoDe(c.conversationId), null);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 0);
  });
  test("vendedor desligado, ou IA do SDR desligada, não chama ninguém", async () => {
    const c = await montar("Auto Desligado");
    await prisma.sdrVendedorConfig.update({ where: { tenantId: tenant }, data: { ativo: false } });
    let antes = chamadas.length;
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes);
    await configurar("AUTOMATICO");
    await prisma.sdrIaConfig.update({ where: { tenantId: tenant }, data: { ativa: false } });
    antes = chamadas.length;
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes);
    assert.equal(await estadoDe(c.conversationId), null);
    await prisma.sdrIaConfig.update({ where: { tenantId: tenant }, data: { ativa: true } });
  });
  test("o tenant sem o recurso SDR não é atendido, mesmo com o vendedor ligado", async () => {
    await prisma.sdrVendedorConfig.create({ data: { tenantId: outro, ativo: true, modo: "AUTOMATICO", ativadoEm: ATIVADO } });
    await prisma.tenantRecurso.update({ where: { tenantId_recurso: { tenantId: outro, recurso: "SDR" } }, data: { ativo: false } });
    const c = await montar("Auto Outro Tenant", { t: outro });
    await cicloDoVendedor(deps);
    assert.equal(await estadoDe(c.conversationId), null);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 0);
  });
});

describe("configuração e painel", () => {
  test("não liga sem a IA do SDR e o modelo da tarefa; ligar de novo reinicia o momento de ativação", async () => {
    const dados = { ativo: true, modo: "SUGERIR", nomeAssistente: "Assistente", instrucoes: "", limiteTurnos: 6, horaInicio: 9, horaFim: 18 };
    await assert.rejects(() => salvarConfigDoVendedor(outro, dados, autor), (e: unknown) => e instanceof ErroSdrCore && e.status === 422);
    const c = await salvarConfigDoVendedor(tenant, { ...dados, ativo: false }, autor);
    assert.equal(c.ativo, false);
    const ligada = await salvarConfigDoVendedor(tenant, dados, autor);
    assert.equal(ligada.ativo, true);
    assert.ok(ligada.ativadoEm && Math.abs(Date.now() - ligada.ativadoEm.getTime()) < 60_000, "ligar marca o momento real da ativação");
    assert.equal(ligada.instrucoes, null);
    const mantida = await salvarConfigDoVendedor(tenant, { ...dados, limiteTurnos: 7 }, autor);
    assert.equal(mantida.ativadoEm?.getTime(), ligada.ativadoEm?.getTime());
  });
  test("recusa horário invertido, modo desconhecido e campo de fora", async () => {
    const base = { ativo: false, modo: "SUGERIR", nomeAssistente: "Assistente", limiteTurnos: 6, horaInicio: 9, horaFim: 18 };
    for (const ruim of [{ horaFim: 9 }, { modo: "SOLTO" }, { tenantId: "outro" }, { limiteTurnos: 0 }, { nomeAssistente: "" }]) {
      await assert.rejects(() => salvarConfigDoVendedor(tenant, { ...base, ...ruim }, autor), (e: unknown) => e instanceof Error && e.name === "ZodError");
    }
    assert.equal((await obterConfigDoVendedor(outro)).ativo, true);
  });
  test("o painel lista as conversas da empresa, com a última mensagem da empresa e o resumo do mês", async () => {
    const p = await listarConversasDoVendedor(tenant);
    assert.ok(p.itens.length >= 5);
    assert.ok(p.itens.every((i) => i.empresa.length > 0));
    assert.ok(p.resumoDoMes.atendidas >= p.itens.length);
    const encerrada = p.itens.find((i) => i.empresa === "Auto Descadastro");
    assert.equal(encerrada?.status, "ENCERRADA");
    assert.equal(encerrada?.ultimaDaEmpresa, "Parem de me mandar mensagem");
    const outroPainel = await listarConversasDoVendedor(outro);
    assert.equal(outroPainel.itens.length, 0);
  });
});

describe("controle manual do vendedor, conversa a conversa", () => {
  const CONFIG = { limiteTurnos: 8, horaInicio: 8, horaFim: 20 };
  before(() => configurar("AUTOMATICO", CONFIG));
  const controle = (conversationId: string, acao: "ligar" | "desligar" | "automatico", campanha?: string) => definirControleDaConversa(tenant, conversationId, { acao, ...(campanha ? { campanhaId: campanha } : {}) }, autor, AGORA);

  /** Um contato qualquer que escreveu: sem empresa do SDR, sem negociação, sem abordagem nossa. */
  async function avulso(nome: string, texto = "Oi, quanto custa?", t = tenant) {
    telefone++;
    const sessaoDoTenant = t === tenant ? sessao : (await prisma.whatsAppSession.create({ data: { tenantId: t, label: "Outro avulso" } })).id;
    const contato = await prisma.contact.create({ data: { tenantId: t, waJid: `${telefone}@s.whatsapp.net`, phoneNumber: String(telefone), name: nome } });
    const conversa = await prisma.conversation.create({ data: { tenantId: t, sessionId: sessaoDoTenant, contactId: contato.id, status: "OPEN", lastMessageAt: minutosAtras(2) } });
    await prisma.message.create({ data: { conversationId: conversa.id, sessionId: sessaoDoTenant, direction: "INBOUND", body: texto, createdAt: minutosAtras(2) } });
    return { conversationId: conversa.id, sessionId: sessaoDoTenant, telefone: String(telefone) };
  }

  test("conversa fora do SDR: sem controle, o vendedor não entra; ligado à mão, responde (só o nome do contato vai ao modelo)", async () => {
    const c = await avulso("Cliente Avulso");
    await cicloDoVendedor(deps);
    assert.equal(await estadoDe(c.conversationId), null);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 0);

    const antes = chamadas.length;
    programar({ resposta: "Oi! O plano Revenda custa R$ 597/mês até 70 carros. Posso te mostrar em 20 minutos?", acao: "interesse", resumo: "Perguntou o preço." });
    const ligado = await controle(c.conversationId, "ligar");
    assert.equal(ligado.controle, "LIGADO");
    assert.equal(ligado.doSdr, false);
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes + 1);
    const ms = await mensagensDaIa(c.conversationId);
    assert.equal(ms.length, 1);
    assert.equal(ms[0].status, "PENDING");
    const e = await estadoDe(c.conversationId);
    assert.equal(e?.empresaId, null);
    assert.equal(e?.turnos, 1);
    const p = chamadas[chamadas.length - 1];
    assert.ok(p.usuario.includes("Cliente Avulso"), "o nome do contato vai ao modelo");
    assert.ok(p.usuario.includes("R$ 597/mês até 70 carros"), "sem roteiro escolhido, vale a campanha ativa mais recente");
    assert.ok(!p.usuario.includes(c.telefone), "o telefone do contato não vai ao modelo");
  });
  test("ligar exige o vendedor ligado na empresa e a IA do SDR com o modelo da tarefa", async () => {
    const c = await avulso("Cliente Sem Vendedor");
    await prisma.sdrVendedorConfig.update({ where: { tenantId: tenant }, data: { ativo: false } });
    await assert.rejects(() => controle(c.conversationId, "ligar"), (e: unknown) => e instanceof ErroSdrCore && e.status === 409 && /aba Vendedor IA/.test(e.message));
    await configurar("AUTOMATICO", CONFIG);
    await prisma.sdrIaConfig.update({ where: { tenantId: tenant }, data: { ativa: false } });
    await assert.rejects(() => controle(c.conversationId, "ligar"), (e: unknown) => e instanceof ErroSdrCore && e.status === 409);
    assert.equal((await obterControleDaConversa(tenant, c.conversationId)).vendedorPronto, false);
    await prisma.sdrIaConfig.update({ where: { tenantId: tenant }, data: { ativa: true } });
    assert.equal((await obterControleDaConversa(tenant, c.conversationId)).vendedorPronto, true);
    assert.equal(await prisma.conversaAgente.count({ where: { conversationId: c.conversationId } }), 0, "nada foi gravado nas recusas");
  });
  test("o roteiro escolhido ao ligar vale; campanha de outra organização é recusada", async () => {
    const c = await avulso("Cliente Roteiro");
    const outraIcp = await prisma.sdrIcp.create({ data: { tenantId: outro, nome: "Perfil de fora" } });
    const alheia = await prisma.sdrCampanha.create({ data: { tenantId: outro, nome: "Campanha de fora", icpId: outraIcp.id, status: "ATIVA" } });
    await assert.rejects(() => controle(c.conversationId, "ligar", alheia.id), (e: unknown) => e instanceof ErroSdrCore && e.status === 404);
    const icpId = (await prisma.sdrCampanha.findUniqueOrThrow({ where: { id: campanhaId } })).icpId;
    const propria = await prisma.sdrCampanha.create({ data: { tenantId: tenant, nome: "Roteiro Escolhido", icpId, status: "ATIVA", argumento: "ARGUMENTO-ESCOLHIDO-123", linkAgenda: "https://agenda.teste/escolhida" } });
    programar({ resposta: "Olá! Posso explicar como funciona.", acao: "continuar" });
    await controle(c.conversationId, "ligar", propria.id);
    await cicloDoVendedor(deps);
    assert.ok(chamadas[chamadas.length - 1].usuario.includes("ARGUMENTO-ESCOLHIDO-123"));
    assert.equal((await obterControleDaConversa(tenant, c.conversationId)).campanhaId, propria.id);
  });
  test("parar a IA: cancela o que ela deixou na fila (sem tocar nas mensagens de pessoas), limpa a sugestão e nada mais é respondido", async () => {
    const c = await avulso("Cliente Freio");
    programar({ resposta: "Oi, tudo bem?", acao: "continuar" });
    await controle(c.conversationId, "ligar");
    await cicloDoVendedor(deps);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 1);
    await prisma.sdrVendedorConversa.update({ where: { conversationId: c.conversationId }, data: { sugestao: "Texto sugerido", sugestaoAcao: "continuar" } });
    const pessoa = await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "OUTBOUND", status: "PENDING", body: "Mensagem de uma pessoa, ainda na fila", createdAt: AGORA } });

    const r = await controle(c.conversationId, "desligar");
    assert.equal(r.controle, "DESLIGADO");
    assert.equal(r.canceladas, 1);
    const [daIa] = await mensagensDaIa(c.conversationId);
    assert.equal(daIa.status, "FAILED");
    assert.match(daIa.errorMessage ?? "", /Cancelada/);
    assert.equal((await prisma.message.findUniqueOrThrow({ where: { id: pessoa.id } })).status, "PENDING", "mensagem que não é da IA fica como está");
    assert.equal((await estadoDe(c.conversationId))?.sugestao, null);

    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "INBOUND", body: "E então?", createdAt: minutosAtras(1) } });
    const antes = chamadas.length;
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes, "parada, a IA não chama o modelo");
    assert.equal((await mensagensDaIa(c.conversationId)).length, 1);
  });
  test("o freio vale também para uma conversa do SDR que o automático atenderia; voltar ao automático devolve a conversa às regras", async () => {
    const c = await montar("Auto Freio Manual", { resposta: "Boa tarde, quanto custa?" });
    await controle(c.conversationId, "desligar");
    const antes = chamadas.length;
    await cicloDoVendedor(deps);
    assert.equal(chamadas.length, antes);
    assert.equal(await estadoDe(c.conversationId), null);

    programar({ resposta: "Boa tarde! O plano Revenda custa R$ 597/mês.", acao: "continuar" });
    const r = await controle(c.conversationId, "automatico");
    assert.equal(r.controle, null);
    assert.equal(r.doSdr, true);
    await cicloDoVendedor(deps);
    assert.equal((await mensagensDaIa(c.conversationId)).length, 1);
  });
  test("depois que a equipe respondeu e a IA saiu, ligar de novo recomeça: zera respostas e falhas", async () => {
    const c = await montar("Auto Retomada", { resposta: "Oi" });
    programar({ resposta: "Olá! Em que posso ajudar?", acao: "continuar" });
    await cicloDoVendedor(deps);
    const depois = new Date(AGORA.getTime() + 5 * 60_000);
    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "OUTBOUND", status: "SENT", body: "Aqui é o Felipe.", deCelular: true, createdAt: minutosAtras(2, depois) } });
    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "INBOUND", body: "Ok, e o preço?", createdAt: minutosAtras(1, depois) } });
    await cicloDoVendedor({ ...deps, agora: () => depois });
    assert.equal((await estadoDe(c.conversationId))?.status, "TRANSFERIDA");

    const depois2 = new Date(AGORA.getTime() + 10 * 60_000);
    programar({ resposta: "O plano Revenda custa R$ 597/mês até 70 carros.", acao: "continuar" });
    const r = await definirControleDaConversa(tenant, c.conversationId, { acao: "ligar" }, autor, depois2);
    assert.equal(r.estado?.status, "ATIVA");
    assert.equal(r.estado?.turnos, 0);
    await prisma.message.create({ data: { conversationId: c.conversationId, sessionId: c.sessionId, direction: "INBOUND", body: "Pode me explicar?", createdAt: minutosAtras(1, depois2) } });
    await cicloDoVendedor({ ...deps, agora: () => depois2 });
    assert.equal((await mensagensDaIa(c.conversationId)).length, 2);
  });
  test("fora do SDR, pedir para não ser contatado bloqueia o telefone, encerra e deixa o freio ligado", async () => {
    const c = await avulso("Cliente Pediu Parar", "Parem de me mandar mensagem");
    programar({ resposta: "Claro, vou parar.", acao: "nao_contatar", resumo: "Pediu para parar." });
    await controle(c.conversationId, "ligar");
    await cicloDoVendedor(deps);
    const ms = await mensagensDaIa(c.conversationId);
    assert.equal(ms.length, 1);
    assert.ok(ms[0].body.includes("não enviaremos mais mensagens"));
    assert.equal((await estadoDe(c.conversationId))?.status, "ENCERRADA");
    assert.equal(await prisma.sdrSupressao.count({ where: { tenantId: tenant, tipo: "TELEFONE", valor: { contains: c.telefone.slice(-9) } } }), 1);
    assert.equal((await obterControleDaConversa(tenant, c.conversationId)).controle, "DESLIGADO");
  });
  test("conversa de outra organização e grupo são recusados; o painel mostra o contato quando não há empresa", async () => {
    const alheia = await avulso("Cliente De Fora", "Oi", outro);
    await assert.rejects(() => controle(alheia.conversationId, "ligar"), (e: unknown) => e instanceof ErroSdrCore && e.status === 404);
    await assert.rejects(() => obterControleDaConversa(tenant, alheia.conversationId), (e: unknown) => e instanceof ErroSdrCore && e.status === 404);
    const contatoGrupo = await prisma.contact.create({ data: { tenantId: tenant, waJid: "120363000000000001@g.us", name: "Grupo Teste", grupo: true } });
    const conversaGrupo = await prisma.conversation.create({ data: { tenantId: tenant, sessionId: sessao, contactId: contatoGrupo.id, status: "OPEN" } });
    await assert.rejects(() => controle(conversaGrupo.id, "ligar"), (e: unknown) => e instanceof ErroSdrCore && e.status === 409);
    const painel = await listarConversasDoVendedor(tenant);
    assert.ok(painel.itens.some((i) => i.empresa === "Cliente Avulso"), "conversa sem empresa aparece com o nome do contato");
    await assert.rejects(() => definirControleDaConversa(tenant, alheia.conversationId, { acao: "ligar", tenantId: "x" }, autor), (e: unknown) => e instanceof Error && e.name === "ZodError");
  });
});
});

describe("vendedor de SaaS: arquitetura (guardas por leitura do código)", () => {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const arquivos = (pasta: string): string[] => fs.readdirSync(pasta, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? arquivos(path.join(pasta, d.name)) : [path.join(pasta, d.name)]));

  test("toda rota do vendedor passa pelo portão do SDR (recurso ligado na empresa e papel da pessoa)", () => {
    const rotas = arquivos(path.join(raiz, "apps/web/app/api/vendedor-saas")).filter((p) => p.endsWith("route.ts"));
    assert.equal(rotas.length, 4, "configuração, enviar, descartar e controle da conversa");
    for (const r of rotas) assert.match(fs.readFileSync(r, "utf8"), /rotaSdr\(/, r);
  });
  test("o tenant vem sempre da sessão: nenhuma rota lê tenantId do corpo ou da URL", () => {
    for (const r of arquivos(path.join(raiz, "apps/web/app/api/vendedor-saas")).filter((p) => p.endsWith("route.ts"))) {
      const t = fs.readFileSync(r, "utf8");
      assert.doesNotMatch(t, /tenantId\s*[:=]\s*(corpo|body|params|searchParams)/, r);
      assert.match(t, /a\.user\.tenantId/, r);
    }
  });
  test("o núcleo do SDR continua sem tocar em conversa nem mensagem: o vendedor mora no pacote vendedor-ia", () => {
    assert.equal(fs.existsSync(path.join(raiz, "packages/sdr-core/src/vendedor")), false);
    assert.equal(fs.existsSync(path.join(raiz, "packages/vendedor-ia/src/saas/vendedor.ts")), true);
  });
  test("a IA do vendedor não tem ferramentas, não lê chave e só cita endereços permitidos", () => {
    const codigo = ["regras.ts", "prompt.ts", "vendedor.ts"].map((a) => fs.readFileSync(path.join(raiz, "packages/vendedor-ia/src/saas", a), "utf8")).join("\n");
    assert.doesNotMatch(codigo, /process\.env/, "as chaves só são lidas em sdr-core/src/ia/provedores.ts");
    assert.doesNotMatch(codigo, /generativelanguage|api\.anthropic/, "o endereço dos provedores só aparece em provedores.ts");
    assert.match(codigo, /linksNaoPermitidos/);
  });
});
