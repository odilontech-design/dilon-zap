import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { prisma } from "@dilon-zap/db";
import { ErroSdrCore } from "../../sdr-core/src/erros";
import { salvarConfigIa, type ConfigIa } from "../../sdr-core/src/ia/config";
import { sdrDoTenant } from "../../sdr-core/src/index";
import type { Provedor, Provedores } from "../../sdr-core/src/ia/provedores";
import { filtroEmpresasSchema } from "../../../apps/web/lib/sdr/esquemas";
import { USUARIOS } from "../src/semente";
import { Sessao, logado } from "./ajudantes";
import { cnpjDe } from "./dados";

/**
 * A rotina comercial do SDR: decisor, abordagem, aprovação, registro do contato, resposta, follow-up,
 * "Meu Comercial de Hoje" e a passagem para o CRM. Nada aqui chama provedor de IA de verdade nem envia mensagem.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../../..");
const autor = { id: "u-teste", name: "Vendedora Teste" };
const dia = 86_400_000;

let tenantC = "";
let tenantD = "";
let dilonId = "";

const S = (tenantId = tenantC) => sdrDoTenant(tenantId).comercial;
const E = (tenantId = tenantC) => sdrDoTenant(tenantId).empresas;
const status = (n: number) => (e: unknown) => e instanceof ErroSdrCore && e.status === n;

async function empresa(tenantId: string, nome: string, extra: Record<string, unknown> = {}) {
  return prisma.sdrEmpresa.create({
    data: { tenantId, razaoSocial: `${nome} Ltda`, nomeFantasia: nome, chaveNome: nome.toLowerCase(), uf: "RJ", cidade: "Rio de Janeiro", segmento: "Limpeza e conservação", ...extra },
  });
}

before(async () => {
  tenantC = (await prisma.tenant.create({ data: { name: "com-c", slug: "comercial-teste-c" } })).id;
  tenantD = (await prisma.tenant.create({ data: { name: "com-d", slug: "comercial-teste-d" } })).id;
  dilonId = (await prisma.tenant.findFirstOrThrow({ where: { slug: "dilon-tech-local" } })).id;
});

after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantC, tenantD] } } });
});

describe("ficha comercial e decisor", () => {
  let id = "";
  before(async () => {
    id = (await empresa(tenantC, "Alfa Facilities", { cnpj: cnpjDe(5001), telefone: "5521999990001", email: "contato@alfafac.com.br", emailDominio: "alfafac.com.br", site: "https://alfafac.com.br", dominio: "alfafac.com.br" })).id;
  });

  test("sem registro, a empresa é não contatada, prioridade média e pode ser abordada", async () => {
    const f = await S().ficha(id);
    assert.deepEqual([f.acompanhamento.etapa, f.acompanhamento.prioridade, f.podeContatar, f.abordagens.length, f.interacoes.length], ["NAO_CONTATADA", "MEDIA", true, 0, 0]);
  });
  test("salva decisor, normaliza telefone e e-mail e registra no histórico", async () => {
    await S().salvar(id, { decisorNome: "Marcos Lima", decisorCargo: "Gerente de Operações", decisorEmail: "MARCOS@alfafac.com.br", decisorTelefone: "(21) 99999-0002", decisorLinkedin: "https://www.linkedin.com/in/marcos-lima", produto: "DILON_FACILITIES", prioridade: "ALTA", observacoes: "Indicado pelo contador" }, autor);
    const a = (await S().ficha(id)).acompanhamento;
    assert.deepEqual([a.decisorNome, a.decisorEmail, a.decisorTelefone, a.produto, a.prioridade], ["Marcos Lima", "marcos@alfafac.com.br", "5521999990002", "DILON_FACILITIES", "ALTA"]);
    const h = (await S().ficha(id)).interacoes;
    assert.equal(h.some((i) => i.tipo === "DECISOR" && i.texto === "Marcos Lima — Gerente de Operações"), true);
  });
  test("nada é inventado: o que não foi informado continua vazio", async () => {
    const a = (await S().ficha(id)).acompanhamento;
    const outra = await empresa(tenantC, "Sem Decisor");
    const b = (await S().ficha(outra.id)).acompanhamento;
    assert.equal(a.decisorNome !== null, true);
    assert.deepEqual([b.decisorNome, b.decisorCargo, b.decisorEmail, b.decisorTelefone, b.decisorLinkedin], [null, null, null, null, null]);
  });
  test("e-mail, telefone e LinkedIn inválidos são recusados", async () => {
    await assert.rejects(() => S().salvar(id, { decisorEmail: "isso-nao-e-email" }, autor), status(400));
    await assert.rejects(() => S().salvar(id, { decisorTelefone: "123" }, autor), status(400));
    await assert.rejects(() => S().salvar(id, { decisorLinkedin: "https://site-falso.com/in/x" }, autor), status(400));
  });
  test("campo desconhecido, inclusive tenantId, é recusado", async () => {
    await assert.rejects(() => S().salvar(id, { tenantId: "outro" }, autor));
    await assert.rejects(() => S().salvar(id, { etapa: "CONVERTIDA" }, autor));
  });
  test("limpar um campo grava vazio", async () => {
    await S().salvar(id, { observacoes: null }, autor);
    assert.equal((await S().ficha(id)).acompanhamento.observacoes, null);
  });
  test("empresa de outra organização não existe para esta", async () => {
    await assert.rejects(() => S(tenantD).ficha(id), status(404));
    await assert.rejects(() => S(tenantD).salvar(id, { prioridade: "BAIXA" }, autor), status(404));
  });
});

describe("correção manual dos dados da empresa", () => {
  let id = "";
  before(async () => {
    id = (await empresa(tenantC, "Beta Servicos")).id;
  });
  test("site, e-mail e telefone passam pelos mesmos normalizadores da importação", async () => {
    await S().editarEmpresa(id, { site: "www.betaservicos.com.br/", email: "Vendas@BetaServicos.com.br", telefone: "(21) 3333-4444", cidade: "niterói", uf: "rio de janeiro" });
    const e = await prisma.sdrEmpresa.findUniqueOrThrow({ where: { id } });
    assert.deepEqual([e.site, e.dominio, e.email, e.emailDominio, e.telefone, e.uf], ["https://betaservicos.com.br", "betaservicos.com.br", "vendas@betaservicos.com.br", "betaservicos.com.br", "552133334444", "RJ"]);
  });
  test("valores inválidos são recusados e nada muda", async () => {
    await assert.rejects(() => S().editarEmpresa(id, { email: "xx" }), status(400));
    await assert.rejects(() => S().editarEmpresa(id, { uf: "ZZ" }), status(400));
    await assert.rejects(() => S().editarEmpresa(id, { site: "ftp://x" }), status(400));
    assert.equal((await prisma.sdrEmpresa.findUniqueOrThrow({ where: { id } })).uf, "RJ");
  });
  test("a empresa não pode ficar sem nome", async () => {
    await assert.rejects(() => S().editarEmpresa(id, { razaoSocial: null, nomeFantasia: null }), status(400));
  });
  test("o domínio corrigido passa a valer para o bloqueio", async () => {
    await prisma.sdrSupressao.create({ data: { tenantId: tenantC, tipo: "DOMINIO", valor: "bloqueado-teste.com.br", motivo: "EMPRESA_BLOQUEADA" } });
    assert.equal((await S().ficha(id)).podeContatar, true);
    await S().editarEmpresa(id, { site: "https://www.bloqueado-teste.com.br" });
    assert.equal((await S().ficha(id)).podeContatar, false);
    await S().editarEmpresa(id, { site: "https://betaservicos.com.br" });
    assert.equal((await S().ficha(id)).podeContatar, true);
  });
  test("tenantId e campos desconhecidos são recusados", async () => {
    await assert.rejects(() => S().editarEmpresa(id, { tenantId: "x" }));
    await assert.rejects(() => S().editarEmpresa(id, { cnpj: "123" }));
  });
  test("outra organização não edita", async () => {
    await assert.rejects(() => S(tenantD).editarEmpresa(id, { cidade: "Rio" }), status(404));
  });
});

describe("abordagem: aprovação, edição e registro do contato", () => {
  let id = "";
  let ab = "";
  const ultimoContatoEm = new Date(Date.now() - 3_600_000).toISOString();
  before(async () => {
    id = (await empresa(tenantC, "Gama Conservação", { email: "oi@gama.com.br", emailDominio: "gama.com.br" })).id;
    await S().salvar(id, { decisorNome: "Paula Souza", decisorCargo: "Diretora de Operações" }, autor);
  });

  test("o modelo neutro usa só o que existe e traz o aviso de descadastro", async () => {
    const a = await S().criarAbordagem(id, { produto: "DILON_FACILITIES", canal: "EMAIL", texto: "x", modelo: true }, autor);
    ab = a.id;
    assert.equal(a.status, "RASCUNHO");
    assert.equal(a.origem, "MANUAL");
    assert.match(a.texto, /Olá, Paula/);
    assert.match(a.texto, /Gama Conservação/);
    assert.match(a.texto, /Dilon Facilities/);
    assert.match(a.texto, /não receber contato/);
    assert.equal(/undefined|null|\{\{/.test(a.texto + (a.assunto ?? "")), false);
    assert.equal(!!a.assunto, true);
  });
  test("o modelo neutro sem decisor não inventa nome", async () => {
    const sem = await empresa(tenantC, "Sem Nome Decisor");
    const a = await S().criarAbordagem(sem.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "x", modelo: true }, autor);
    assert.match(a.texto, /^Olá,\n/);
  });
  test("não registra contato de abordagem que não foi aprovada", async () => {
    await assert.rejects(() => S().registrarContato(ab, { canal: "EMAIL" }, autor), status(409));
  });
  test("aprovar guarda o texto exato, quem aprovou e quando", async () => {
    const a = await S().aprovarAbordagem(ab, autor);
    assert.equal(a.status, "APROVADA");
    assert.equal(a.textoAprovado, a.texto);
    assert.equal(a.aprovadaPorNome, "Vendedora Teste");
    assert.equal(a.versaoAprovada, 1);
    assert.equal(!!a.aprovadaEm, true);
  });
  test("aprovar de novo não muda nada", async () => {
    const antes = await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab } });
    await S().aprovarAbordagem(ab, { id: "outra", name: "Outra Pessoa" });
    const depois = await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab } });
    assert.equal(depois.aprovadaPorNome, antes.aprovadaPorNome);
    assert.equal(depois.aprovadaEm?.getTime(), antes.aprovadaEm?.getTime());
  });
  test("editar depois de aprovada derruba a aprovação e sobe a versão", async () => {
    const e = await S().editarAbordagem(ab, { texto: "Texto novo, ainda sem aprovação.", assunto: "Novo assunto" }, autor);
    assert.deepEqual([e.status, e.versao, e.textoAprovado, e.aprovadaPorNome, e.aprovadaEm], ["RASCUNHO", 2, null, null, null]);
    await assert.rejects(() => S().registrarContato(ab, { canal: "EMAIL" }, autor), status(409));
  });
  test("salvar sem mudar nada não derruba a aprovação", async () => {
    await S().aprovarAbordagem(ab, autor);
    const a = await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab } });
    await S().editarAbordagem(ab, { texto: a.texto, assunto: a.assunto }, autor);
    assert.equal((await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab } })).status, "APROVADA");
  });
  test("texto alterado por fora da aprovação não pode ser registrado como contato", async () => {
    await prisma.sdrAbordagem.update({ where: { id: ab }, data: { texto: "Texto trocado direto no banco" } });
    await assert.rejects(() => S().registrarContato(ab, { canal: "EMAIL" }, autor), status(409));
    await prisma.sdrAbordagem.update({ where: { id: ab }, data: { texto: (await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab } })).textoAprovado! } });
  });
  test("registrar o contato guarda o texto aprovado, o canal, o horário e agenda o follow-up; não diz que enviou", async () => {
    const feitoEm = ultimoContatoEm;
    const amanha = new Date(Date.now() + 3 * dia).toISOString();
    const r = await S().registrarContato(ab, { canal: "EMAIL", feitoEm, resultado: "enviado pelo meu e-mail", proximaAcao: "Fazer follow-up", proximaAcaoEm: amanha }, autor);
    assert.equal(r.repetido, false);
    const aprovada = await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab } });
    assert.equal(r.interacao.texto, aprovada.textoAprovado);
    assert.equal(r.interacao.canal, "EMAIL");
    assert.equal(r.interacao.tipo, "CONTATO");
    assert.equal(Math.abs(r.interacao.createdAt.getTime() - Date.parse(feitoEm)) < 1000, true);
    const f = await S().ficha(id);
    assert.deepEqual([f.acompanhamento.etapa, f.acompanhamento.proximaAcao], ["CONTATADA", "Fazer follow-up"]);
    assert.equal(f.acompanhamento.proximaAcaoEm?.toISOString(), amanha);
    assert.equal(f.acompanhamento.ultimoContatoEm?.toISOString(), feitoEm);
  });
  test("duplo clique no registro não duplica o contato", async () => {
    const antes = await prisma.sdrInteracao.count({ where: { tenantId: tenantC, empresaId: id, tipo: "CONTATO" } });
    const r = await S().registrarContato(ab, { canal: "EMAIL", feitoEm: ultimoContatoEm }, autor);
    assert.equal(r.repetido, true);
    assert.equal(await prisma.sdrInteracao.count({ where: { tenantId: tenantC, empresaId: id, tipo: "CONTATO" } }), antes);
  });
  test("data de contato no futuro é recusada", async () => {
    const outra = await S().criarAbordagem(id, { produto: "DILON_ZAP", canal: "LIGACAO", texto: "Roteiro" }, autor);
    await S().aprovarAbordagem(outra.id, autor);
    await assert.rejects(() => S().registrarContato(outra.id, { canal: "LIGACAO", feitoEm: new Date(Date.now() + 5 * dia).toISOString() }, autor), status(400));
  });
  test("rejeitada não volta a ser aprovada nem editada", async () => {
    const r = await S().criarAbordagem(id, { produto: "DILON_ZAP", canal: "MENSAGEM", texto: "Mensagem curta" }, autor);
    await S().rejeitarAbordagem(r.id, autor);
    await assert.rejects(() => S().aprovarAbordagem(r.id, autor), status(409));
    await assert.rejects(() => S().editarAbordagem(r.id, { texto: "outra" }, autor), status(409));
    assert.equal((await S().ficha(id)).abordagens.some((a) => a.id === r.id), false);
  });
  test("outra organização não aprova nem registra", async () => {
    await assert.rejects(() => S(tenantD).aprovarAbordagem(ab, autor), status(404));
    await assert.rejects(() => S(tenantD).editarAbordagem(ab, { texto: "invasão" }, autor), status(404));
    await assert.rejects(() => S(tenantD).registrarContato(ab, { canal: "EMAIL" }, autor), status(404));
  });
  test("contato registrado numa empresa que já respondeu não volta para 'aguardando resposta'", async () => {
    await S().registrarResultado(id, { etapa: "INTERESSE" }, autor);
    const novo = await S().criarAbordagem(id, { produto: "DILON_FACILITIES", canal: "EMAIL", texto: "Follow-up", finalidade: "FOLLOW_UP" }, autor);
    await S().aprovarAbordagem(novo.id, autor);
    await S().registrarContato(novo.id, { canal: "EMAIL" }, autor);
    assert.equal((await S().ficha(id)).acompanhamento.etapa, "INTERESSE");
  });
});

describe("resposta, follow-up e pedido de não contato", () => {
  test("a resposta interrompe o lembrete de 'sem resposta'", async () => {
    const e = await empresa(tenantC, "Resp Um");
    await S().salvar(e.id, { proximaAcao: "Fazer follow-up", proximaAcaoEm: new Date(Date.now() + dia).toISOString() }, autor);
    await S().registrarResultado(e.id, { etapa: "RESPONDEU", nota: "Pediu para falar semana que vem" }, autor);
    const a = (await S().ficha(e.id)).acompanhamento;
    assert.deepEqual([a.etapa, a.proximaAcaoEm], ["RESPONDEU", null]);
  });
  test("a resposta pode já marcar o próximo passo", async () => {
    const e = await empresa(tenantC, "Resp Dois");
    const quando = new Date(Date.now() + 2 * dia).toISOString();
    await S().registrarResultado(e.id, { etapa: "INFO_SOLICITADA", proximaAcao: "Enviar material", proximaAcaoEm: quando }, autor);
    const a = (await S().ficha(e.id)).acompanhamento;
    assert.deepEqual([a.etapa, a.proximaAcao, a.proximaAcaoEm?.toISOString()], ["INFO_SOLICITADA", "Enviar material", quando]);
  });
  test("sem interesse encerra o follow-up e as abordagens pendentes", async () => {
    const e = await empresa(tenantC, "Sem Interesse");
    const ab = await S().criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Olá" }, autor);
    await S().aprovarAbordagem(ab.id, autor);
    await S().registrarResultado(e.id, { etapa: "SEM_INTERESSE", proximaAcaoEm: new Date(Date.now() + dia).toISOString() }, autor);
    const f = await S().ficha(e.id);
    assert.deepEqual([f.acompanhamento.etapa, f.acompanhamento.proximaAcaoEm], ["SEM_INTERESSE", null]);
    assert.equal((await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab.id } })).status, "REJEITADA");
  });
  test("'não contatar' entra na lista de bloqueio, encerra tudo e impede nova abordagem", async () => {
    const e = await empresa(tenantC, "Nao Contatar", { cnpj: cnpjDe(5002), telefone: "5521988887777", email: "oi@naocontatar.com.br", emailDominio: "naocontatar.com.br" });
    await S().salvar(e.id, { decisorEmail: "diretor@naocontatar.com.br" }, autor);
    const ab = await S().criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Olá" }, autor);
    await S().aprovarAbordagem(ab.id, autor);
    const r = await S().registrarResultado(e.id, { etapa: "NAO_CONTATAR", nota: "Pediu para não receber" }, autor);
    assert.equal(r.bloqueados >= 4, true);
    const listas = await sdrDoTenant(tenantC).supressoes.carregarListas();
    assert.equal(listas.CNPJ.has(cnpjDe(5002)), true);
    assert.equal(listas.EMAIL.has("diretor@naocontatar.com.br"), true);
    assert.equal(listas.TELEFONE.has("5521988887777"), true);
    assert.equal((await prisma.sdrSupressao.findFirstOrThrow({ where: { tenantId: tenantC, tipo: "CNPJ", valor: cnpjDe(5002) } })).motivo, "SOLICITOU_NAO_CONTATO");
    assert.equal((await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab.id } })).status, "REJEITADA");
    const f = await S().ficha(e.id);
    assert.deepEqual([f.acompanhamento.etapa, f.podeContatar, f.acompanhamento.proximaAcaoEm], ["NAO_CONTATAR", false, null]);
    const nova = await S().criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "De novo" }, autor);
    await assert.rejects(() => S().aprovarAbordagem(nova.id, autor), status(409));
    await assert.rejects(() => S().gerarAbordagem(e.id, { produto: "DILON_ZAP" }, autor), status(409));
    // Repetir não duplica nem dá erro.
    await S().registrarResultado(e.id, { etapa: "NAO_CONTATAR" }, autor);
    assert.equal((await E().listar({ suprimida: "sim" })).itens.some((x) => x.id === e.id), true);
  });
  test("empresa que já está na lista de bloqueio não aprova nem registra contato", async () => {
    const e = await empresa(tenantC, "Ja Bloqueada", { cnpj: cnpjDe(5003) });
    const ab = await S().criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Olá" }, autor);
    await S().aprovarAbordagem(ab.id, autor);
    await prisma.sdrSupressao.create({ data: { tenantId: tenantC, tipo: "CNPJ", valor: cnpjDe(5003), motivo: "EMPRESA_BLOQUEADA" } });
    await assert.rejects(() => S().registrarContato(ab.id, { canal: "EMAIL" }, autor), status(409));
    const outra = await S().criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Outra" }, autor);
    await assert.rejects(() => S().aprovarAbordagem(outra.id, autor), status(409));
  });
  test("etapa inválida ou CONVERTIDA pelo registro de resposta é recusada", async () => {
    const e = await empresa(tenantC, "Etapa Ruim");
    await assert.rejects(() => S().registrarResultado(e.id, { etapa: "CONVERTIDA" }, autor));
    await assert.rejects(() => S().registrarResultado(e.id, { etapa: "NAO_CONTATADA" }, autor));
    await assert.rejects(() => S().registrarResultado(e.id, { etapa: "RESPONDEU", tenantId: "x" }, autor));
  });
  test("nota entra no histórico", async () => {
    const e = await empresa(tenantC, "Com Nota");
    await S().registrarNota(e.id, "Ligar depois do almoço", autor);
    assert.equal((await S().ficha(e.id)).interacoes[0].texto, "Ligar depois do almoço");
    await assert.rejects(() => S().registrarNota(e.id, "   ", autor));
  });
});

describe("central de prospecção: visões, filtros e ordem", () => {
  const ids: Record<string, string> = {};
  let tenantV = "";
  const V = () => sdrDoTenant(tenantV);
  const nomes = (r: { itens: { id: string }[] }) => r.itens.map((i) => Object.keys(ids).find((k) => ids[k] === i.id) ?? i.id).sort();
  const ordenados = (r: { itens: { id: string }[] }) => r.itens.map((i) => Object.keys(ids).find((k) => ids[k] === i.id) ?? i.id);
  const em = (d: number) => new Date(Date.now() + d * dia);

  before(async () => {
    tenantV = (await prisma.tenant.create({ data: { name: "com-v", slug: "comercial-teste-v" } })).id;
    const novo = async (chave: string, extra: Record<string, unknown> = {}) => {
      ids[chave] = (await empresa(tenantV, chave, extra)).id;
    };
    await novo("nova");
    await novo("rascunho");
    await novo("aprovada");
    await novo("contatada");
    await novo("respondeu");
    await novo("reuniao");
    await novo("vencida");
    await novo("amanha");
    await novo("convertida");
    await novo("sempeso");
    await novo("naocontatar", { cnpj: cnpjDe(5100) });
    await novo("bloqueada", { cnpj: cnpjDe(5101) });
    await novo("prioritaria", { uf: "SP", cidade: "Campinas" });
    await prisma.sdrSupressao.create({ data: { tenantId: tenantV, tipo: "CNPJ", valor: cnpjDe(5101), motivo: "EMPRESA_BLOQUEADA" } });
    const ac = (empresa: string, data: Record<string, unknown>) => prisma.sdrAcompanhamento.create({ data: { tenantId: tenantV, empresaId: ids[empresa], ...data } as never });
    await ac("contatada", { etapa: "CONTATADA", produto: "DILON_ZAP", proximaAcaoEm: em(2), proximaAcao: "Follow-up" });
    await ac("respondeu", { etapa: "RESPONDEU", proximaAcaoEm: null });
    await ac("reuniao", { etapa: "REUNIAO", produto: "DILON_FACILITIES", proximaAcaoEm: em(1), proximaAcao: "Reunião" });
    await ac("vencida", { etapa: "CONTATADA", proximaAcaoEm: em(-2), proximaAcao: "Cobrar resposta", prioridade: "ALTA" });
    await ac("amanha", { etapa: "CONTATADA", proximaAcaoEm: em(3) });
    await ac("convertida", { etapa: "CONVERTIDA", negociacaoId: "neg-1", proximaAcaoEm: em(-1) });
    await ac("naocontatar", { etapa: "NAO_CONTATAR", proximaAcaoEm: em(-1) });
    await ac("prioritaria", { prioridade: "ALTA", produto: "DILON_ZAP" });
    await ac("sempeso", { prioridade: "BAIXA" });
    const rascunho = await sdrDoTenant(tenantV).comercial.criarAbordagem(ids.rascunho, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Rascunho" }, autor);
    const aprovada = await sdrDoTenant(tenantV).comercial.criarAbordagem(ids.aprovada, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Aprovada" }, autor);
    await sdrDoTenant(tenantV).comercial.aprovarAbordagem(aprovada.id, autor);
    assert.ok(rascunho.id);
  });
  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantV } });
  });

  test("a lista traz o bloco comercial de cada empresa", async () => {
    const r = await V().empresas.listar();
    const c = r.itens.find((i) => i.id === ids.vencida)!.comercial;
    assert.deepEqual([c.etapa, c.prioridade, c.proximaAcao], ["CONTATADA", "ALTA", "Cobrar resposta"]);
    assert.equal(r.itens.find((i) => i.id === ids.nova)!.comercial.etapa, "NAO_CONTATADA");
    assert.equal(r.itens.find((i) => i.id === ids.rascunho)!.comercial.abordagem, "RASCUNHO");
    assert.equal(r.itens.find((i) => i.id === ids.aprovada)!.comercial.abordagem, "APROVADA");
    assert.equal(r.total, 13);
  });
  test("disponíveis: não contatadas e sem bloqueio", async () => {
    assert.deepEqual(nomes(await V().empresas.listar({ visao: "disponiveis" })), ["aprovada", "nova", "prioritaria", "rascunho", "sempeso"]);
  });
  test("aguardando aprovação e contato a realizar", async () => {
    assert.deepEqual(nomes(await V().empresas.listar({ visao: "preparadas" })), ["rascunho"]);
    assert.deepEqual(nomes(await V().empresas.listar({ visao: "aprovadas" })), ["aprovada"]);
  });
  test("contatadas, responderam, no CRM e encerradas", async () => {
    assert.deepEqual(nomes(await V().empresas.listar({ visao: "contatadas" })), ["amanha", "contatada", "vencida"]);
    assert.deepEqual(nomes(await V().empresas.listar({ visao: "responderam" })), ["respondeu", "reuniao"]);
    assert.deepEqual(nomes(await V().empresas.listar({ visao: "convertidas" })), ["convertida"]);
    assert.deepEqual(nomes(await V().empresas.listar({ visao: "encerradas" })), ["naocontatar"]);
  });
  test("follow-up pendente: vence até hoje, e não inclui convertidas nem pedidos de não contato", async () => {
    assert.deepEqual(ordenados(await V().empresas.listar({ visao: "followup", ordem: "acao" })), ["vencida"]);
  });
  test("filtros de produto, prioridade, etapa e data da próxima ação", async () => {
    assert.deepEqual(nomes(await V().empresas.listar({ produto: "DILON_ZAP" })), ["contatada", "prioritaria"]);
    assert.deepEqual(nomes(await V().empresas.listar({ prioridade: "ALTA" })), ["prioritaria", "vencida"]);
    assert.deepEqual(nomes(await V().empresas.listar({ prioridade: "MEDIA" })).includes("nova"), true);
    assert.deepEqual(nomes(await V().empresas.listar({ etapa: "REUNIAO" })), ["reuniao"]);
    const ate = em(1).toISOString().slice(0, 10);
    assert.deepEqual(nomes(await V().empresas.listar({ acaoAte: ate })), ["convertida", "naocontatar", "reuniao", "vencida"]);
  });
  test("ordem por próxima ação e por prioridade", async () => {
    const porAcao = ordenados(await V().empresas.listar({ ordem: "acao", etapa: "CONTATADA" }));
    assert.deepEqual(porAcao, ["vencida", "contatada", "amanha"]);
    const porPrioridade = ordenados(await V().empresas.listar({ ordem: "prioridade" }));
    assert.deepEqual(porPrioridade.slice(0, 2).sort(), ["prioritaria", "vencida"]);
    assert.equal(porPrioridade.at(-1), "sempeso");
  });
  test("região e segmento continuam filtrando junto com a situação", async () => {
    assert.deepEqual(nomes(await V().empresas.listar({ uf: "SP", visao: "disponiveis" })), ["prioritaria"]);
    assert.deepEqual(nomes(await V().empresas.listar({ cidade: "campinas" })), ["prioritaria"]);
  });
  test("Meu Comercial de Hoje reúne os blocos da rotina", async () => {
    const h = await V().comercial.hoje();
    assert.equal(h.followUpsDeHoje.total, 1);
    assert.equal(h.contatosARealizar.total, 1);
    assert.equal(h.abordagensPendentes.total, 1);
    assert.equal(h.reunioes.total, 1);
    assert.equal(h.oportunidades.total, 2);
    assert.equal(h.prioritarias.total, 5);
    assert.equal(h.decisoresAIdentificar.total, 5);
    assert.equal(h.prioritarias.itens[0].id, ids.prioritaria);
    assert.equal(h.prioritarias.itens.length <= 8, true);
  });
  test("o recorte de hoje não mostra empresa de outra organização", async () => {
    const h = await sdrDoTenant(tenantD).comercial.hoje();
    assert.equal(Object.values(h).every((b) => b.total === 0 || b.itens.every((i) => !Object.values(ids).includes(i.id))), true);
  });
  test("os esquemas da rota aceitam os filtros novos e recusam os inválidos", () => {
    assert.equal(filtroEmpresasSchema.safeParse({ visao: "followup", ordem: "acao", produto: "DILON_ZAP", prioridade: "ALTA", etapa: "REUNIAO", acaoAte: "2026-11-05" }).success, true);
    for (const ruim of [{ visao: "tudo" }, { produto: "OUTRO" }, { prioridade: "URGENTE" }, { etapa: "X" }, { acaoAte: "amanhã" }, { acaoAte: "2026-13-45" }, { ordem: "aleatoria" }]) {
      assert.equal(filtroEmpresasSchema.safeParse(ruim).success, false, JSON.stringify(ruim));
    }
  });
});

describe("abordagem com IA", () => {
  const CONFIG: ConfigIa = {
    ativa: true,
    orcamentoDiarioMicro: 5_000_000,
    orcamentoMensalMicro: 50_000_000,
    limiteTokensEntrada: 4_000,
    limiteTokensSaida: 1_500,
    cacheHoras: 0,
    modelos: { abordagem_comercial: { principal: "anthropic:modelo-teste" } },
    precos: { "anthropic:modelo-teste": { entradaMicroPorMilTokens: 3_000, saidaMicroPorMilTokens: 15_000 } },
  };
  const RESPOSTA = {
    email: { assunto: "Evidência de execução nos contratos da Alfa", corpo: "Olá, Marcos. Muitas empresas de conservação com vários contratos têm dificuldade para comprovar a execução. Faz sentido conversarmos? Se preferir não receber contato, é só avisar." },
    mensagem_curta: "Olá, Marcos! Posso te mostrar em 15 minutos como o Dilon Facilities ajuda a comprovar a execução dos serviços?",
    roteiro_ligacao: "1. Apresentação. 2. Motivo da ligação. 3. Propor 15 minutos de conversa. 4. Registrar o resultado.",
    pergunta_diagnostico: "Como vocês comprovam hoje a execução dos serviços nos contratos?",
    follow_up: "Olá, Marcos. Voltando ao meu contato anterior: ainda faz sentido conversarmos sobre a comprovação da execução?",
    proxima_acao: "Ligar para o Marcos na quinta-feira",
    informacoes_faltantes: ["Quantidade de contratos"],
  };
  const falso = (resposta: () => string) => {
    const chamadas: { sistema: string; usuario: string }[] = [];
    const provedor: Provedor = {
      async chamar(p) {
        chamadas.push({ sistema: p.sistema, usuario: p.usuario });
        return { texto: resposta(), tokensEntrada: 800, tokensSaida: 600 };
      },
    };
    const provedores = { anthropic: provedor, gemini: provedor } as Provedores;
    return { chamadas, provedores };
  };
  let tenantI = "";
  let id = "";
  const I = () => sdrDoTenant(tenantI);

  before(async () => {
    tenantI = (await prisma.tenant.create({ data: { name: "com-i", slug: "comercial-teste-i" } })).id;
    id = (await empresa(tenantI, "Alfa Conservação", { cnpj: cnpjDe(5200), email: "segredo@alfacons.com.br", telefone: "5521977776666", porte: "MEDIA" })).id;
    await I().comercial.salvar(id, { decisorNome: "Marcos Lima", decisorCargo: "Gerente de Operações", decisorEmail: "marcos@alfacons.com.br", decisorTelefone: "21955554444" }, autor);
  });
  after(async () => {
    await prisma.tenant.delete({ where: { id: tenantI } });
  });

  test("com a IA desligada, a ferramenta avisa e o trabalho manual segue", async () => {
    const f = falso(() => JSON.stringify(RESPOSTA));
    const r = await I().comercial.gerarAbordagem(id, { produto: "DILON_FACILITIES" }, autor, { provedores: f.provedores });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.motivo, "desligada");
    assert.equal(f.chamadas.length, 0);
    const manual = await I().comercial.criarAbordagem(id, { produto: "DILON_FACILITIES", canal: "EMAIL", texto: "x", modelo: true }, autor);
    await I().comercial.aprovarAbordagem(manual.id, autor);
    const contato = await I().comercial.registrarContato(manual.id, { canal: "EMAIL" }, autor);
    assert.equal(contato.repetido, false);
  });
  test("gera e-mail, mensagem curta, roteiro com pergunta de diagnóstico e follow-up, tudo como rascunho", async () => {
    await salvarConfigIa(tenantI, CONFIG, autor);
    const f = falso(() => JSON.stringify(RESPOSTA));
    const r = await I().comercial.gerarAbordagem(id, { produto: "DILON_FACILITIES", problema: "comprovar a execução em vários contratos" }, autor, { provedores: f.provedores });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.abordagens.length, 4);
    assert.equal(r.abordagens.every((a) => a.status === "RASCUNHO" && a.origem === "IA" && a.produto === "DILON_FACILITIES"), true);
    const [email, curta, ligacao, followup] = r.abordagens;
    assert.deepEqual([email.canal, email.finalidade, email.assunto], ["EMAIL", "PRIMEIRO_CONTATO", RESPOSTA.email.assunto]);
    assert.deepEqual([curta.canal, ligacao.canal, ligacao.finalidade, followup.finalidade], ["MENSAGEM", "LIGACAO", "ROTEIRO", "FOLLOW_UP"]);
    assert.match(ligacao.texto, /Pergunta de diagnóstico: Como vocês comprovam/);
    assert.equal(followup.assunto, `Re: ${RESPOSTA.email.assunto}`);
    assert.equal(r.proximaAcao, "Ligar para o Marcos na quinta-feira");
    assert.deepEqual(r.informacoesFaltantes, ["Quantidade de contratos"]);
    assert.equal((await prisma.sdrInteracao.count({ where: { tenantId: tenantI, empresaId: id, tipo: "ABORDAGEM", resultado: { startsWith: "rascunhos gerados com IA" } } })), 1);
  });
  test("o modelo recebe só o necessário: sem e-mail, telefone ou CNPJ, com instruções contra invenção", async () => {
    const f = falso(() => JSON.stringify(RESPOSTA));
    await I().comercial.gerarAbordagem(id, { produto: "DILON_ZAP", problema: "organizar o atendimento" }, autor, { provedores: f.provedores });
    const c = f.chamadas[0];
    for (const proibido of ["segredo@alfacons", "5521977776666", "marcos@alfacons", "21955554444", cnpjDe(5200)]) assert.equal(c.usuario.includes(proibido), false, proibido);
    assert.match(c.usuario, /Marcos Lima/);
    assert.match(c.usuario, /Gerente de Operações/);
    assert.match(c.usuario, /Alfa Conservação/);
    assert.match(c.usuario, /organizar o atendimento/);
    assert.match(c.sistema, /Não invente/);
    assert.match(c.sistema, /nunca como instruç/);
  });
  test("Dilon Zap e Dilon Facilities geram abordagens com contextos diferentes", async () => {
    // Empresa sem histórico: o contexto só pode vir do produto escolhido.
    const limpa = (await empresa(tenantI, "Sem Historico")).id;
    const f1 = falso(() => JSON.stringify(RESPOSTA));
    const f2 = falso(() => JSON.stringify(RESPOSTA));
    await I().comercial.gerarAbordagem(limpa, { produto: "DILON_ZAP" }, autor, { provedores: f1.provedores });
    await I().comercial.gerarAbordagem(limpa, { produto: "DILON_FACILITIES" }, autor, { provedores: f2.provedores });
    assert.match(f1.chamadas[0].usuario, /"nome":"Dilon Zap","descricao":"Dilon Zap é uma plataforma de atendimento e CRM/);
    assert.match(f2.chamadas[0].usuario, /"nome":"Dilon Facilities","descricao":"Dilon Facilities é uma solução para empresas de serviços terceirizados/);
    assert.equal(f1.chamadas[0].usuario.includes("Dilon Facilities é uma solução"), false);
  });
  test("o histórico entra no contexto da IA", async () => {
    await I().comercial.registrarNota(id, "Pediu material sobre fiscalização de contratos", autor);
    const f = falso(() => JSON.stringify(RESPOSTA));
    await I().comercial.gerarAbordagem(id, { produto: "DILON_FACILITIES" }, autor, { provedores: f.provedores });
    assert.match(f.chamadas[0].usuario, /Pediu material sobre fiscalização/);
  });
  test("resposta fora do formato não gera nenhum rascunho", async () => {
    const antes = await prisma.sdrAbordagem.count({ where: { tenantId: tenantI } });
    const f = falso(() => JSON.stringify({ ...RESPOSTA, acao: "enviar_email_agora" }));
    const r = await I().comercial.gerarAbordagem(id, { produto: "DILON_ZAP" }, autor, { provedores: f.provedores });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.motivo, "resposta_invalida");
    assert.equal(await prisma.sdrAbordagem.count({ where: { tenantId: tenantI } }), antes);
  });
  test("texto curto demais ou vazio também é descartado", async () => {
    const f = falso(() => JSON.stringify({ ...RESPOSTA, email: { assunto: "ok", corpo: "curto" } }));
    const r = await I().comercial.gerarAbordagem(id, { produto: "DILON_ZAP" }, autor, { provedores: f.provedores });
    assert.equal(r.ok, false);
  });
  test("sem orçamento, não chama a IA e o motivo é claro", async () => {
    await salvarConfigIa(tenantI, { ...CONFIG, orcamentoDiarioMicro: 1 }, autor);
    const f = falso(() => JSON.stringify(RESPOSTA));
    const r = await I().comercial.gerarAbordagem(id, { produto: "DILON_ZAP" }, autor, { provedores: f.provedores });
    assert.equal(!r.ok && r.motivo, "sem_orcamento");
    assert.equal(f.chamadas.length, 0);
    await salvarConfigIa(tenantI, CONFIG, autor);
  });
  test("o problema comercial tem limite de tamanho", async () => {
    const f = falso(() => JSON.stringify(RESPOSTA));
    await assert.rejects(() => I().comercial.gerarAbordagem(id, { produto: "DILON_ZAP", problema: "x".repeat(501) }, autor, { provedores: f.provedores }));
    assert.equal(f.chamadas.length, 0);
  });
  test("o custo fica registrado por campanha e por tarefa", async () => {
    const uso = await I().ia.uso();
    assert.equal(uso.porTarefa.some((t) => t.tarefa === "abordagem_comercial" && t.custoMicro > 0), true);
  });
  test("empresa de outra organização não é abordada", async () => {
    const f = falso(() => JSON.stringify(RESPOSTA));
    await assert.rejects(() => sdrDoTenant(tenantD).comercial.gerarAbordagem(id, { produto: "DILON_ZAP" }, autor, { provedores: f.provedores }), status(404));
    assert.equal(f.chamadas.length, 0);
  });
});

describe("conversão em oportunidade", () => {
  test("marcar como convertida guarda o vínculo, sai do follow-up e vai para 'No CRM'", async () => {
    const e = await empresa(tenantC, "Para CRM");
    await S().registrarResultado(e.id, { etapa: "INTERESSE", proximaAcaoEm: new Date(Date.now() - dia).toISOString(), proximaAcao: "Ligar" }, autor);
    await S().marcarConvertida(e.id, "neg-teste", autor);
    const f = await S().ficha(e.id);
    assert.deepEqual([f.acompanhamento.etapa, f.acompanhamento.negociacaoId, f.acompanhamento.proximaAcaoEm], ["CONVERTIDA", "neg-teste", null]);
    assert.equal((await E().listar({ visao: "convertidas" })).itens.some((i) => i.id === e.id), true);
    assert.equal((await E().listar({ visao: "followup" })).itens.some((i) => i.id === e.id), false);
    await assert.rejects(() => S().registrarResultado(e.id, { etapa: "RESPONDEU" }, autor), status(409));
  });
});

describe("rotas do fluxo comercial", () => {
  let empresaId = "";
  let semTelefoneId = "";
  let funilId = "";
  const limpeza: (() => Promise<unknown>)[] = [];

  before(async () => {
    empresaId = (await empresa(dilonId, "Rota Comercial LTDA", { telefone: "5521966665555", email: "contato@rotacom.com.br", emailDominio: "rotacom.com.br" })).id;
    semTelefoneId = (await empresa(dilonId, "Rota Sem Telefone")).id;
  });
  after(async () => {
    for (const f of limpeza.reverse()) await f().catch(() => undefined);
    await prisma.negociacao.deleteMany({ where: { tenantId: dilonId, origem: "SDR" } });
    await prisma.contact.deleteMany({ where: { tenantId: dilonId, waJid: "5521966665555@s.whatsapp.net" } });
    if (funilId) {
      await prisma.stage.deleteMany({ where: { funilId } });
      await prisma.funil.deleteMany({ where: { id: funilId } });
    }
    await prisma.sdrEmpresa.deleteMany({ where: { tenantId: dilonId, id: { in: [empresaId, semTelefoneId] } } });
    await prisma.sdrSupressao.deleteMany({ where: { tenantId: dilonId } });
    await prisma.sdrIaConfig.deleteMany({ where: { tenantId: dilonId } });
    await prisma.sdrIaUso.deleteMany({ where: { tenantId: dilonId } });
  });

  test("anônimo vai para o login em todas as rotas novas", async () => {
    const s = new Sessao();
    for (const [m, rota] of [
      ["GET", "/api/sdr/comercial/hoje"],
      ["GET", `/api/sdr/empresas/${empresaId}/comercial`],
      ["PUT", `/api/sdr/empresas/${empresaId}/comercial`],
      ["POST", `/api/sdr/empresas/${empresaId}/abordagens`],
      ["POST", `/api/sdr/empresas/${empresaId}/abordagens/gerar`],
      ["POST", `/api/sdr/empresas/${empresaId}/resultado`],
      ["POST", `/api/sdr/empresas/${empresaId}/notas`],
      ["POST", `/api/sdr/empresas/${empresaId}/converter`],
      ["PATCH", `/api/sdr/empresas/${empresaId}`],
      ["PATCH", "/api/sdr/abordagens/x"],
      ["POST", "/api/sdr/abordagens/x/aprovar"],
      ["POST", "/api/sdr/abordagens/x/rejeitar"],
      ["POST", "/api/sdr/abordagens/x/contato"],
    ] as const) {
      assert.equal((await s.chamar(rota, m, m === "GET" ? undefined : {})).status, 307, `${m} ${rota}`);
    }
  });
  test("leitura: responsável e financeiro; escrita só do responsável; atendente e empresa sem o recurso, nada", async () => {
    const rota = `/api/sdr/empresas/${empresaId}/comercial`;
    assert.equal((await (await logado(USUARIOS.dono)).chamar(rota)).status, 200);
    assert.equal((await (await logado(USUARIOS.financeiro)).chamar(rota)).status, 200);
    assert.equal((await (await logado(USUARIOS.financeiro)).chamar(rota, "PUT", { prioridade: "ALTA" })).status, 403);
    assert.equal((await (await logado(USUARIOS.financeiro)).chamar("/api/sdr/comercial/hoje")).status, 200);
    for (const u of [USUARIOS.atendente, USUARIOS.externo]) {
      const s = await logado(u);
      assert.equal((await s.chamar(rota)).status, 403);
      assert.equal((await s.chamar("/api/sdr/comercial/hoje")).status, 403);
      assert.equal((await s.chamar(`/api/sdr/empresas/${empresaId}/abordagens`, "POST", { produto: "DILON_ZAP", canal: "EMAIL", texto: "x" })).status, 403);
      assert.equal((await s.chamar(`/api/sdr/empresas/${empresaId}/converter`, "POST")).status, 403);
    }
  });
  test("o fluxo inteiro, passo a passo, pelo site: decisor → abordagem → aprovar → contato → resposta → de volta ao painel", async () => {
    const dono = await logado(USUARIOS.dono);
    let r = await dono.chamar(`/api/sdr/empresas/${empresaId}/comercial`, "PUT", { decisorNome: "Ana Pereira", decisorCargo: "Diretora Executiva", decisorEmail: "ana@rotacom.com.br", produto: "DILON_ZAP", prioridade: "ALTA" });
    assert.equal(r.status, 200);

    r = await dono.chamar(`/api/sdr/empresas/${empresaId}/abordagens`, "POST", { produto: "DILON_ZAP", canal: "EMAIL", texto: "modelo", modelo: true });
    assert.equal(r.status, 201);
    const ab = (await r.json()) as { id: string; texto: string; status: string };
    assert.equal(ab.status, "RASCUNHO");
    assert.match(ab.texto, /Olá, Ana/);

    // Edição, aprovação e contato exigem a ordem certa.
    assert.equal((await dono.chamar(`/api/sdr/abordagens/${ab.id}/contato`, "POST", { canal: "EMAIL" })).status, 409);
    r = await dono.chamar(`/api/sdr/abordagens/${ab.id}`, "PATCH", { texto: `${ab.texto}\n\nP.S.: material em anexo.`, assunto: "Conversa rápida" });
    assert.equal(r.status, 200);
    assert.equal((await dono.chamar(`/api/sdr/abordagens/${ab.id}/aprovar`, "POST")).status, 200);
    const seguimento = new Date(Date.now() + 2 * dia).toISOString();
    r = await dono.chamar(`/api/sdr/abordagens/${ab.id}/contato`, "POST", { canal: "EMAIL", resultado: "enviado", proximaAcaoEm: seguimento, proximaAcao: "Fazer follow-up" });
    assert.equal(r.status, 201);

    // Aparece em "Contatadas" e com follow-up marcado.
    const contatadas = (await (await dono.chamar("/api/sdr/empresas?visao=contatadas")).json()) as { itens: { id: string; comercial: { etapa: string; proximaAcao: string } }[] };
    const achada = contatadas.itens.find((i) => i.id === empresaId)!;
    assert.deepEqual([achada.comercial.etapa, achada.comercial.proximaAcao], ["CONTATADA", "Fazer follow-up"]);

    // Respondeu com interesse: sai do follow-up de "sem resposta" e aparece nas oportunidades.
    assert.equal((await dono.chamar(`/api/sdr/empresas/${empresaId}/resultado`, "POST", { etapa: "INTERESSE", nota: "Quer ver a demonstração" })).status, 200);
    const hoje = (await (await dono.chamar("/api/sdr/comercial/hoje")).json()) as Record<string, { total: number; itens: { id: string }[] }>;
    assert.equal(hoje.oportunidades.itens.some((i) => i.id === empresaId), true);

    const ficha = (await (await dono.chamar(`/api/sdr/empresas/${empresaId}/comercial`)).json()) as { interacoes: { tipo: string }[]; abordagens: { versao: number; status: string }[] };
    const tipos = ficha.interacoes.map((i) => i.tipo);
    for (const t of ["DECISOR", "ABORDAGEM", "CONTATO", "RESPOSTA"]) assert.equal(tipos.includes(t), true, t);
    assert.deepEqual([ficha.abordagens[0].versao, ficha.abordagens[0].status], [2, "APROVADA"]);
  });
  test("a auditoria registra as ações importantes sem guardar o texto da mensagem", async () => {
    const acoes = (await prisma.auditLog.findMany({ where: { targetTenantId: dilonId, action: { startsWith: "sdr." } } })).map((a) => a.action);
    for (const a of ["sdr.comercial.atualizado", "sdr.abordagem.criada", "sdr.abordagem.aprovada", "sdr.contato.registrado", "sdr.comercial.resultado"]) assert.equal(acoes.includes(a), true, a);
    const todos = JSON.stringify(await prisma.auditLog.findMany({ where: { targetTenantId: dilonId, action: { startsWith: "sdr." } }, select: { metadata: true } }));
    assert.equal(todos.includes("P.S.: material"), false);
  });
  test("dados inválidos e campos estranhos viram 400, nunca 500", async () => {
    const dono = await logado(USUARIOS.dono);
    const ruins: [string, string, unknown][] = [
      ["PUT", `/api/sdr/empresas/${empresaId}/comercial`, { tenantId: "outro" }],
      ["PUT", `/api/sdr/empresas/${empresaId}/comercial`, { decisorEmail: "ruim" }],
      ["POST", `/api/sdr/empresas/${empresaId}/abordagens`, { produto: "OUTRO", canal: "EMAIL", texto: "x" }],
      ["POST", `/api/sdr/empresas/${empresaId}/abordagens/gerar`, { produto: "DILON_ZAP", extra: 1 }],
      ["POST", `/api/sdr/empresas/${empresaId}/resultado`, { etapa: "CONVERTIDA" }],
      ["POST", `/api/sdr/empresas/${empresaId}/notas`, { texto: "" }],
      ["PATCH", `/api/sdr/empresas/${empresaId}`, { uf: "ZZ" }],
      ["PATCH", `/api/sdr/empresas/${empresaId}`, { cnpj: "123" }],
    ];
    for (const [m, rota, corpo] of ruins) assert.equal((await dono.chamar(rota, m, corpo)).status, 400, `${m} ${rota}`);
  });
  test("empresa ou abordagem que não existe é 404", async () => {
    const dono = await logado(USUARIOS.dono);
    assert.equal((await dono.chamar("/api/sdr/empresas/nao-existe/comercial")).status, 404);
    assert.equal((await dono.chamar("/api/sdr/abordagens/nao-existe/aprovar", "POST")).status, 404);
  });
  test("a IA desligada responde ok:false com o motivo, sem erro de servidor", async () => {
    const dono = await logado(USUARIOS.dono);
    const r = await dono.chamar(`/api/sdr/empresas/${empresaId}/abordagens/gerar`, "POST", { produto: "DILON_ZAP" });
    assert.equal(r.status, 200);
    const j = (await r.json()) as { ok: boolean; motivo: string };
    assert.deepEqual([j.ok, j.motivo], [false, "desligada"]);
  });
  test("converter: recusa sem interesse, sem telefone e sem o funil; cria quando tudo existe, uma vez só", async () => {
    const dono = await logado(USUARIOS.dono);
    // Sem interesse registrado.
    assert.equal((await dono.chamar(`/api/sdr/empresas/${semTelefoneId}/converter`, "POST")).status, 409);
    // Com interesse, mas sem telefone.
    await dono.chamar(`/api/sdr/empresas/${semTelefoneId}/resultado`, "POST", { etapa: "INTERESSE" });
    assert.equal((await dono.chamar(`/api/sdr/empresas/${semTelefoneId}/converter`, "POST")).status, 422);
    // Com telefone, mas sem o funil Prospecção ativa.
    let r = await dono.chamar(`/api/sdr/empresas/${empresaId}/converter`, "POST");
    assert.equal(r.status, 422);
    assert.match(((await r.json()) as { error: string }).error, /Prospecção ativa/);

    const funil = await prisma.funil.create({ data: { tenantId: dilonId, nome: "Prospecção ativa" } });
    funilId = funil.id;
    const primeira = await prisma.stage.create({ data: { tenantId: dilonId, funilId, name: "Contato inicial", position: 0 } });
    await prisma.stage.create({ data: { tenantId: dilonId, funilId, name: "Reunião", position: 1 } });

    r = await dono.chamar(`/api/sdr/empresas/${empresaId}/converter`, "POST");
    assert.equal(r.status, 201);
    const criada = (await r.json()) as { negociacaoId: string; jaExistia: boolean };
    assert.equal(criada.jaExistia, false);
    const neg = await prisma.negociacao.findUniqueOrThrow({ where: { id: criada.negociacaoId }, include: { contact: true } });
    assert.deepEqual([neg.tenantId, neg.funilId, neg.stageId, neg.origem, neg.responsavelId !== null], [dilonId, funilId, primeira.id, "SDR", true]);
    assert.match(neg.titulo, /Rota Comercial/);
    assert.equal(neg.contact.waJid, "5521966665555@s.whatsapp.net");
    assert.match(neg.contact.name ?? "", /Ana Pereira/);

    // Repetir devolve a mesma negociação, sem criar outra.
    r = await dono.chamar(`/api/sdr/empresas/${empresaId}/converter`, "POST");
    assert.equal(r.status, 200);
    assert.deepEqual(((await r.json()) as { negociacaoId: string; jaExistia: boolean }), { negociacaoId: criada.negociacaoId, jaExistia: true });
    assert.equal(await prisma.negociacao.count({ where: { tenantId: dilonId, origem: "SDR" } }), 1);

    const ficha = (await (await dono.chamar(`/api/sdr/empresas/${empresaId}/comercial`)).json()) as { acompanhamento: { etapa: string; negociacaoId: string } };
    assert.deepEqual([ficha.acompanhamento.etapa, ficha.acompanhamento.negociacaoId], ["CONVERTIDA", criada.negociacaoId]);
    assert.equal(await prisma.auditLog.count({ where: { targetTenantId: dilonId, action: "sdr.convertida.crm" } }) >= 1, true);
  });
  test("empresa bloqueada não vai ao CRM", async () => {
    const bloqueada = await empresa(dilonId, "Rota Bloqueada", { telefone: "5521955550000", cnpj: cnpjDe(5300) });
    limpeza.push(() => prisma.sdrEmpresa.delete({ where: { id: bloqueada.id } }));
    const dono = await logado(USUARIOS.dono);
    await dono.chamar(`/api/sdr/empresas/${bloqueada.id}/resultado`, "POST", { etapa: "REUNIAO" });
    await prisma.sdrSupressao.create({ data: { tenantId: dilonId, tipo: "CNPJ", valor: cnpjDe(5300), motivo: "EMPRESA_BLOQUEADA" } });
    assert.equal((await dono.chamar(`/api/sdr/empresas/${bloqueada.id}/converter`, "POST")).status, 409);
  });
});

describe("guardas: o SDR não envia nada e não toca no WhatsApp", () => {
  const fontes = (dir: string): string[] =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) return ["node_modules", ".next"].includes(e.name) ? [] : fontes(p);
          return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
        })
      : [];
  const rel = (p: string) => path.relative(raiz, p).replace(/\\/g, "/");
  const codigoDoSdr = () => [...fontes(path.join(raiz, "packages/sdr-core/src")), ...fontes(path.join(raiz, "apps/sdr-worker/src")), ...fontes(path.join(raiz, "apps/web/lib/sdr")), ...fontes(path.join(raiz, "apps/web/app/api/sdr")), ...fontes(path.join(raiz, "apps/web/app/(dashboard)/sdr"))];

  test("nenhum código do SDR chama o worker do WhatsApp, resolve número no WhatsApp ou envia e-mail", () => {
    for (const p of codigoDoSdr()) {
      const t = fs.readFileSync(p, "utf8");
      assert.equal(/WORKER_INTERNAL_(URL|SECRET)|resolveWhatsAppJid|upsertContactByPhone|\/internal\/(resolve-jid|messages|outbox)|nodemailer|sendMail|smtp/i.test(t), false, rel(p));
    }
  });
  test("a única ponte com o CRM é converter.ts, e ela não usa o WhatsApp", () => {
    const comCrm = codigoDoSdr().filter((p) => /prisma\.(contact|negociacao|funil|stage)\b|criarNegociacao/.test(fs.readFileSync(p, "utf8"))).map(rel);
    assert.deepEqual(comCrm.sort(), ["apps/web/app/api/sdr/empresas/[id]/converter/route.ts", "apps/web/lib/sdr/converter.ts"].sort());
  });
  test("a ponte com o CRM só procura e cria contato: nunca altera nem apaga", () => {
    const t = fs.readFileSync(path.join(raiz, "apps/web/lib/sdr/converter.ts"), "utf8");
    assert.equal(/contact\.(update|updateMany|upsert|delete|deleteMany|createMany)/.test(t), false);
  });
  test("a tela diz que o sistema não envia, e nunca chama 'enviada' uma mensagem só preparada", () => {
    const ficha = fs.readFileSync(path.join(raiz, "apps/web/app/(dashboard)/sdr/ficha-comercial.tsx"), "utf8");
    assert.match(ficha, /não envia esta mensagem/);
    assert.equal(/Mensagem enviada|E-mail enviado|Enviar agora|Enviar e-mail/i.test(ficha), false);
  });
});
