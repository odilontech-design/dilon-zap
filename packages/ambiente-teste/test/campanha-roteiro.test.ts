import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { sdrDoTenant } from "../../sdr-core/src/index";
import { arrobaDoInstagram, modeloDaCampanha, normalizarInstagram, preencherModelo, valoresDoModelo, variaveisDesconhecidas } from "../../sdr-core/src/modelos-de-campanha";
import { normalizarLinha } from "../../sdr-core/src/normalizacao";
import { criarCampanhaSchema, editarCampanhaSchema } from "../../../apps/web/lib/sdr/esquemas";
import { cnpjDe } from "./dados";

/**
 * Semana 1 do vendedor de SaaS: roteiro e modelos por campanha, Instagram na empresa, ligação e direct na fila do dia
 * e a meta de empresas novas por dia. Nada aqui envia mensagem.
 */

const autor = { id: "u-roteiro", name: "Felipe (Dilon Tech)" };
let tenant = "";
let outro = "";
let icpId = "";
let telefone = 5521977100000;
let seq = 9100;
const S = (t = tenant) => sdrDoTenant(t);

async function empresa(nome: string, extra: Record<string, unknown> = {}, t = tenant) {
  telefone++;
  seq++;
  return prisma.sdrEmpresa.create({
    data: {
      tenantId: t, razaoSocial: `${nome} Ltda`, nomeFantasia: nome, chaveNome: nome.toLowerCase(), uf: "SP", cidade: "Campinas", segmento: "Revenda de veículos",
      cnpj: cnpjDe(seq), telefone: String(telefone), email: `contato@${nome.toLowerCase().replace(/\W/g, "")}.com.br`, ...extra,
    },
  });
}

const MODELOS = {
  modeloLigacao: "{saudacao}, aqui é o {autor}, da Dilon Tech. Falo com quem cuida das vendas da {empresa}?",
  modeloEmailAssunto: "{empresa}: menos custo que o AutoCerto",
  modeloEmail: "{saudacao},\n\nVi a {empresa} em {cidade}/{uf}. Agende 20 minutos: {link_agenda}\n\n{autor}",
  modeloDirect: "{saudacao}! Sou o {autor}, da Dilon Tech. Posso te mostrar em 20 min? {link_agenda}",
  modeloWhatsapp: null,
};

async function campanha(nome: string, extra: Record<string, unknown> = {}, t = tenant, icp = icpId) {
  return prisma.sdrCampanha.create({ data: { tenantId: t, nome, icpId: icp, status: "ATIVA", linkAgenda: "https://agenda.teste/demo", metaDiaria: 3, ...MODELOS, ...extra } });
}
const naCampanha = (empresaId: string, campanhaId: string, t = tenant, icp = icpId) => prisma.sdrProspecto.create({ data: { tenantId: t, empresaId, campanhaId, icpId: icp } });

async function contatar(empresaId: string, canal: "WHATSAPP" | "EMAIL" | "LIGACAO" | "MENSAGEM", feitoEm?: Date) {
  const ab = await S().comercial.criarAbordagem(empresaId, { produto: "DILON_ZAP", canal, texto: `Contato por ${canal}.`, modelo: false, ...(canal === "EMAIL" ? { assunto: "Teste" } : {}) }, autor);
  await S().comercial.aprovarAbordagem(ab.id, autor);
  await S().comercial.registrarContato(ab.id, { canal, ...(feitoEm ? { feitoEm: feitoEm.toISOString() } : {}) }, autor);
}

before(async () => {
  tenant = (await prisma.tenant.create({ data: { name: "roteiro", slug: "roteiro-teste" } })).id;
  outro = (await prisma.tenant.create({ data: { name: "roteiro-2", slug: "roteiro-teste-2" } })).id;
  icpId = (await prisma.sdrIcp.create({ data: { tenantId: tenant, nome: "Revendas RJ/SP" } })).id;
});
after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenant, outro] } } });
});

describe("modelos de mensagem (puro)", () => {
  test("preenche as variáveis e não deixa vírgula nem espaço sobrando quando falta o decisor", () => {
    const v = valoresDoModelo({ empresa: "Auto Sul", decisor: null, autor: "Felipe (Dilon Tech)", cidade: "Santos", uf: "SP", linkAgenda: "https://a.b/c" });
    assert.equal(preencherModelo("{saudacao}, {decisor}, tudo bem? Aqui é o {autor}. {link_agenda}", v), "Olá, tudo bem? Aqui é o Felipe. https://a.b/c");
    const comDecisor = valoresDoModelo({ empresa: "Auto Sul", decisor: "Marcos Souza", autor: "Felipe" });
    assert.equal(preencherModelo("{saudacao}! {empresa}", comDecisor), "Olá, Marcos! Auto Sul");
  });
  test("variável desconhecida fica no texto e é apontada", () => {
    assert.deepEqual(variaveisDesconhecidas("Oi {nome}, {empresa} {telefone}"), ["nome", "telefone"]);
    assert.equal(preencherModelo("Oi {nome}", {}), "Oi {nome}");
  });
  test("sem modelo no canal, a campanha devolve null (vale o neutro)", () => {
    const v = valoresDoModelo({ empresa: "X", autor: "F" });
    assert.equal(modeloDaCampanha({ ...MODELOS, modeloWhatsapp: "  " }, "WHATSAPP", v), null);
    assert.equal(modeloDaCampanha(MODELOS, "EMAIL", v)?.assunto, "X: menos custo que o AutoCerto");
  });
  test("Instagram: aceita @, usuário e link; recusa post, reel e texto qualquer", () => {
    for (const e of ["@autosul.rj", "autosul.rj", "instagram.com/autosul.rj", "https://www.instagram.com/AutoSul.RJ/?hl=pt-br", "http://m.instagram.com/autosul.rj/"]) {
      assert.equal(normalizarInstagram(e), "https://instagram.com/autosul.rj", e);
    }
    for (const e of ["https://instagram.com/p/Cx123", "https://instagram.com/reel/abc", "auto sul", "autosul.com.br", "@.oculto", ""]) assert.equal(normalizarInstagram(e), null, e);
    assert.equal(arrobaDoInstagram("https://instagram.com/autosul.rj"), "@autosul.rj");
  });
});

describe("importação com Instagram", () => {
  test("coluna própria é normalizada; inválida vira aviso", () => {
    const ok = normalizarLinha({ nomeFantasia: "Auto Sul", instagram: "@autosul" });
    assert.equal(ok.ok && ok.empresa.instagram, "https://instagram.com/autosul");
    const ruim = normalizarLinha({ nomeFantasia: "Auto Sul", instagram: "não tem" });
    assert.equal(ruim.ok && ruim.empresa.instagram, null);
    assert.ok(ruim.avisos.some((a) => a.includes("Instagram")));
  });
  test("perfil do Instagram na coluna do site vira o Instagram da empresa", () => {
    const r = normalizarLinha({ nomeFantasia: "Auto Sul", site: "https://www.instagram.com/autosul/" });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.empresa.instagram, "https://instagram.com/autosul");
      assert.equal(r.empresa.dominio, null);
    }
  });
});

describe("cadastro da campanha", () => {
  test("aceita o roteiro completo; vazio vira null", () => {
    const r = criarCampanhaSchema.parse({ nome: "Revendas", icpId: "x", metaDiaria: 25, argumento: "", objecoes: [{ objecao: "Já uso AutoCerto", resposta: "Migramos para você." }], modeloLigacao: "{saudacao}" });
    assert.equal(r.argumento, null);
    assert.equal(r.objecoes?.length, 1);
  });
  test("recusa variável desconhecida, link sem https e meta fora do limite", () => {
    const erro = editarCampanhaSchema.safeParse({ modeloEmail: "Oi {nome}" });
    assert.equal(erro.success, false);
    assert.ok(!erro.success && erro.error.issues[0].message.includes("{nome}"));
    assert.equal(editarCampanhaSchema.safeParse({ linkAgenda: "agenda.com" }).success, false);
    assert.equal(editarCampanhaSchema.safeParse({ metaDiaria: 0 }).success, false);
    assert.equal(editarCampanhaSchema.safeParse({ tenantId: "outro" }).success, false);
  });
});

describe("abordagem pelo modelo da campanha", () => {
  test("com a campanha pedida, usa o modelo dela já preenchido", async () => {
    const c = await campanha("Camp Pedida");
    const e = await empresa("Auto Pedida");
    await S().comercial.salvar(e.id, { decisorNome: "Marcos Souza" }, autor);
    const ab = await S().comercial.criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "modelo", modelo: true, campanhaId: c.id }, autor);
    assert.equal(ab.assunto, "Auto Pedida: menos custo que o AutoCerto");
    assert.equal(ab.texto, "Olá, Marcos,\n\nVi a Auto Pedida em Campinas/SP. Agende 20 minutos: https://agenda.teste/demo\n\nFelipe");
    const hist = await prisma.sdrInteracao.findFirst({ where: { tenantId: tenant, empresaId: e.id, tipo: "ABORDAGEM" }, orderBy: { createdAt: "desc" } });
    assert.equal(hist?.texto, "modelo da campanha Camp Pedida");
  });
  test("sem campanha pedida, usa a da empresa que tem modelo para o canal", async () => {
    const c = await campanha("Camp Da Empresa");
    const e = await empresa("Auto Sozinha");
    await naCampanha(e.id, c.id);
    const ab = await S().comercial.criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "LIGACAO", texto: "modelo", modelo: true }, autor);
    assert.equal(ab.texto, "Olá, aqui é o Felipe, da Dilon Tech. Falo com quem cuida das vendas da Auto Sozinha?");
  });
  test("canal sem modelo na campanha cai no modelo neutro", async () => {
    const c = await campanha("Camp Sem Zap");
    const e = await empresa("Auto Neutra");
    const ab = await S().comercial.criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "modelo", modelo: true, campanhaId: c.id }, autor);
    assert.ok(ab.texto.includes("Dilon Zap"));
    assert.ok(!ab.texto.includes("{"));
  });
  test("campanha de outro tenant não serve", async () => {
    const icp2 = await prisma.sdrIcp.create({ data: { tenantId: outro, nome: "Outro perfil" } });
    const alheia = await campanha("Camp Alheia", {}, outro, icp2.id);
    const e = await empresa("Auto Isolada");
    await assert.rejects(() => S().comercial.criarAbordagem(e.id, { produto: "DILON_ZAP", canal: "EMAIL", texto: "modelo", modelo: true, campanhaId: alheia.id }, autor), /campanha não encontrada/);
  });
});

describe("fila do dia por ligação e direct", () => {
  let c = "";
  let comInsta = "";
  let semInsta = "";
  let semFone = "";
  before(async () => {
    c = (await campanha("Camp Fila", { produto: "DILON_ZAP" })).id;
    comInsta = (await empresa("Auto Insta", { instagram: "https://instagram.com/autoinsta" })).id;
    semInsta = (await empresa("Auto Sem Insta")).id;
    semFone = (await empresa("Auto Sem Fone", { telefone: null })).id;
    for (const id of [comInsta, semInsta, semFone]) await naCampanha(id, c);
  });

  test("direct só lista quem tem Instagram; ligação só quem tem telefone", async () => {
    const dm = (await S().fila.doDia({ campanhaId: c, canal: "MENSAGEM" })).itens.map((i) => i.id);
    assert.deepEqual(dm, [comInsta]);
    const lig = (await S().fila.doDia({ campanhaId: c, canal: "LIGACAO" })).itens.map((i) => i.id);
    assert.ok(lig.includes(comInsta) && lig.includes(semInsta) && !lig.includes(semFone));
  });
  test("preparar ligação usa o roteiro da campanha e não duplica", async () => {
    const r = await S().fila.preparar({ canal: "LIGACAO", produto: "DILON_FACILITIES", campanhaId: c }, autor);
    assert.equal(r.criadas, 2);
    const ab = await prisma.sdrAbordagem.findFirstOrThrow({ where: { tenantId: tenant, empresaId: comInsta, canal: "LIGACAO" } });
    assert.ok(ab.texto.startsWith("Olá, aqui é o Felipe"));
    // A campanha manda no produto quando a empresa ainda não tem um.
    assert.equal(ab.produto, "DILON_ZAP");
    const de_novo = await S().fila.preparar({ canal: "LIGACAO", produto: "DILON_ZAP", campanhaId: c, empresaIds: [comInsta] }, autor);
    assert.equal(de_novo.jaTinham, 1);
  });
  test("a ligação preparada não conta como mensagem pronta para o direct", async () => {
    const r = await S().fila.preparar({ canal: "MENSAGEM", produto: "DILON_ZAP", campanhaId: c, empresaIds: [comInsta, semInsta] }, autor);
    assert.equal(r.criadas, 1);
    assert.equal(r.semContato, 1);
    const rev = await S().fila.revisao({ campanhaId: c, canal: "MENSAGEM" });
    assert.equal(rev.itens.length, 1);
    assert.equal(rev.itens[0].empresa.instagram, "https://instagram.com/autoinsta");
    assert.ok(rev.itens[0].texto.endsWith("https://agenda.teste/demo"));
  });
});

describe("meta do dia", () => {
  test("conta empresas novas uma vez, no canal do primeiro contato; follow-up e contato antigo não entram", async () => {
    const c = (await campanha("Camp Meta")).id;
    const [a, b, velha, fora] = await Promise.all([empresa("Meta A"), empresa("Meta B"), empresa("Meta Velha"), empresa("Meta Fora")]);
    for (const e of [a, b, velha]) await naCampanha(e.id, c);

    await contatar(velha.id, "EMAIL", new Date(Date.now() - 3 * 86_400_000));
    await contatar(velha.id, "LIGACAO"); // follow-up de hoje: não é empresa nova
    await contatar(a.id, "LIGACAO");
    await contatar(a.id, "EMAIL"); // segundo toque no mesmo dia: conta uma vez, como ligação
    await contatar(b.id, "MENSAGEM");
    await contatar(fora.id, "EMAIL"); // fora da campanha

    const meta = (await S().fila.resumo({ limiteDiario: 10, intervaloMinimoSegundos: 90 }, { campanhaId: c })).meta;
    assert.deepEqual({ alvo: meta.alvo, novas: meta.novasHoje, lig: meta.porCanal.LIGACAO, dm: meta.porCanal.MENSAGEM, email: meta.porCanal.EMAIL }, { alvo: 3, novas: 2, lig: 1, dm: 1, email: 0 });

    const geral = (await S().fila.resumo({ limiteDiario: 10, intervaloMinimoSegundos: 90 }, {})).meta;
    assert.equal(geral.alvo, 25);
    assert.ok(geral.novasHoje >= 3);
  });
});

describe("aprovação do lote do dia", () => {
  let camp = "";
  const criarRascunho = async (nome: string, extra: Record<string, unknown> = {}) => {
    const e = await empresa(nome, extra);
    await naCampanha(e.id, camp);
    return e;
  };
  before(async () => {
    camp = (await campanha("Camp Lote", { produto: "DILON_ZAP" })).id;
  });

  test("aprova de uma vez os rascunhos da revisão, com o texto exato, sem enviar nada nem contatar", async () => {
    const a = await criarRascunho("Lote A");
    const b = await criarRascunho("Lote B");
    const prep = await S().fila.preparar({ canal: "LIGACAO", produto: "DILON_ZAP", campanhaId: camp }, autor);
    assert.equal(prep.criadas >= 2, true);
    const antes = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenant, empresaId: { in: [a.id, b.id] }, canal: "LIGACAO" } });
    assert.ok(antes.every((x) => x.status === "RASCUNHO"));

    const r = await S().fila.aprovarLote({ canal: "LIGACAO", campanhaId: camp }, autor);
    assert.equal(r.falhas.length, 0);
    assert.ok(r.aprovadas >= 2);
    const depois = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenant, empresaId: { in: [a.id, b.id] }, canal: "LIGACAO" } });
    for (const x of depois) {
      assert.equal(x.status, "APROVADA");
      assert.equal(x.textoAprovado, x.texto, "o texto aprovado é exatamente o que estava na tela");
      assert.equal(x.aprovadaPorNome, autor.name);
    }
    // Aprovar não contata: a etapa continua "não contatada" e nenhum contato foi registrado.
    for (const e of [a, b]) {
      assert.equal((await prisma.sdrAcompanhamento.findUnique({ where: { tenantId_empresaId: { tenantId: tenant, empresaId: e.id } } }))?.etapa ?? "NAO_CONTATADA", "NAO_CONTATADA");
      assert.equal(await prisma.sdrInteracao.count({ where: { tenantId: tenant, empresaId: e.id, tipo: "CONTATO" } }), 0);
    }
    assert.equal(await prisma.sdrEnvioEmail.count({ where: { tenantId: tenant, empresaId: { in: [a.id, b.id] } } }), 0);
  });
  test("repetir o lote não aprova de novo nem duplica: não sobra rascunho para aprovar", async () => {
    const r = await S().fila.aprovarLote({ canal: "LIGACAO", campanhaId: camp }, autor);
    assert.equal(r.aprovadas, 0);
  });
  test("empresa bloqueada no meio do lote não é aprovada, e as outras seguem", async () => {
    const ok = await criarRascunho("Lote Livre");
    const bloq = await criarRascunho("Lote Bloqueada");
    await S().fila.preparar({ canal: "LIGACAO", produto: "DILON_ZAP", campanhaId: camp, empresaIds: [ok.id, bloq.id] }, autor);
    await prisma.sdrSupressao.create({ data: { tenantId: tenant, tipo: "TELEFONE", valor: bloq.telefone!, motivo: "EMPRESA_BLOQUEADA" } });
    const ab = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenant, empresaId: { in: [ok.id, bloq.id] }, canal: "LIGACAO" } });
    const r = await S().fila.aprovarLote({ abordagemIds: ab.map((x) => x.id) }, autor);
    assert.equal(r.aprovadas, 1);
    assert.equal(r.falhas.length, 1);
    assert.equal((await prisma.sdrAbordagem.findFirstOrThrow({ where: { tenantId: tenant, empresaId: ok.id, canal: "LIGACAO" } })).status, "APROVADA");
    assert.equal((await prisma.sdrAbordagem.findFirstOrThrow({ where: { tenantId: tenant, empresaId: bloq.id, canal: "LIGACAO" } })).status, "RASCUNHO");
  });
  test("o limite pedido vale, e abordagem de outra organização nunca é aprovada", async () => {
    for (const n of ["Lote L1", "Lote L2", "Lote L3"]) await criarRascunho(n);
    await S().fila.preparar({ canal: "LIGACAO", produto: "DILON_ZAP", campanhaId: camp }, autor);
    const r = await S().fila.aprovarLote({ canal: "LIGACAO", campanhaId: camp, limite: 2 }, autor);
    assert.equal(r.aprovadas, 2);

    const icp2 = await prisma.sdrIcp.create({ data: { tenantId: outro, nome: "Outro perfil lote" } });
    void icp2;
    const alheia = await empresa("Lote Alheia", {}, outro);
    const ab = await prisma.sdrAbordagem.create({ data: { tenantId: outro, empresaId: alheia.id, produto: "DILON_ZAP", canal: "LIGACAO", texto: "Roteiro de outra organização." } });
    const r2 = await S().fila.aprovarLote({ abordagemIds: [ab.id] }, autor);
    assert.equal(r2.aprovadas, 0);
    assert.equal(r2.falhas.length, 1);
    assert.equal((await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: ab.id } })).status, "RASCUNHO");
  });
  test("recusa campo desconhecido, lista vazia e limite fora da faixa", async () => {
    const invalido = (e: unknown) => e instanceof Error && e.name === "ZodError";
    await assert.rejects(() => S().fila.aprovarLote({ tenantId: "x" }, autor), invalido);
    await assert.rejects(() => S().fila.aprovarLote({ abordagemIds: [] }, autor), invalido);
    await assert.rejects(() => S().fila.aprovarLote({ limite: 51 }, autor), invalido);
  });
});
