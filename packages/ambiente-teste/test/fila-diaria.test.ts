import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { prisma } from "@dilon-zap/db";
import { ErroSdrCore } from "../../sdr-core/src/erros";
import { sdrDoTenant } from "../../sdr-core/src/index";
import { limitesDoSdr } from "../../../apps/web/lib/sdr/smtp";
import { USUARIOS } from "../src/semente";
import { Sessao, logado } from "./ajudantes";
import { cnpjDe } from "./dados";

/**
 * A rotina diária: fila do dia, preparo de mensagens, revisão em sequência, resultado em lote e funil por campanha.
 * Nada aqui envia mensagem nem chama provedor de IA; os limites de WhatsApp e e-mail continuam os de antes.
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../../..");
const autor = { id: "u-teste", name: "Vendedora Teste" };
const status = (n: number) => (e: unknown) => e instanceof ErroSdrCore && e.status === n;
/** O ZodError do núcleo e o do teste são cópias diferentes da biblioteca: confere pelo nome. */
const invalido = (e: unknown) => e instanceof Error && e.name === "ZodError";

let tenantG = "";
let tenantH = "";
let dilonId = "";
let telefone = 5521900100000;
let seq = 7000;

const S = (t = tenantG) => sdrDoTenant(t);

/** Empresa com telefone e e-mail próprios (cada teste usa as suas, para não depender da ordem). */
async function empresa(tenantId: string, nome: string, extra: Record<string, unknown> = {}) {
  telefone++;
  seq++;
  return prisma.sdrEmpresa.create({
    data: {
      tenantId, razaoSocial: `${nome} Ltda`, nomeFantasia: nome, chaveNome: nome.toLowerCase(), uf: "RJ", cidade: "Rio de Janeiro", segmento: "Limpeza e conservação",
      cnpj: cnpjDe(seq), telefone: String(telefone), email: `contato@${nome.toLowerCase().replace(/\W/g, "")}.com.br`, ...extra,
    },
  });
}

/** Deixa a empresa CONTATADA, pelo caminho normal (abordagem aprovada + contato registrado). */
async function contatar(tenantId: string, empresaId: string) {
  const ab = await S(tenantId).comercial.criarAbordagem(empresaId, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "Olá, tudo bem? Mensagem de teste.", modelo: false }, autor);
  await S(tenantId).comercial.aprovarAbordagem(ab.id, autor);
  await S(tenantId).comercial.registrarContato(ab.id, { canal: "WHATSAPP" }, autor);
  return ab.id;
}

const ids = (itens: { id: string }[]) => itens.map((i) => i.id);

before(async () => {
  tenantG = (await prisma.tenant.create({ data: { name: "fila-g", slug: "fila-teste-g" } })).id;
  tenantH = (await prisma.tenant.create({ data: { name: "fila-h", slug: "fila-teste-h" } })).id;
  dilonId = (await prisma.tenant.findFirstOrThrow({ where: { slug: "dilon-tech-local" } })).id;
});
after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantG, tenantH] } } });
});

describe("fila do dia: seleção e ordem", () => {
  let alta = "";
  let media = "";
  let pronta = "";
  let revisar = "";
  let semTelefone = "";
  let bloqueada = "";
  let jaContatada = "";

  before(async () => {
    media = (await empresa(tenantG, "Fila Media")).id;
    alta = (await empresa(tenantG, "Fila Alta")).id;
    pronta = (await empresa(tenantG, "Fila Pronta")).id;
    revisar = (await empresa(tenantG, "Fila Revisar")).id;
    semTelefone = (await empresa(tenantG, "Fila Sem Telefone", { telefone: null })).id;
    const b = await empresa(tenantG, "Fila Bloqueada");
    bloqueada = b.id;
    jaContatada = (await empresa(tenantG, "Fila Ja Contatada")).id;

    await S().comercial.salvar(alta, { prioridade: "ALTA" }, autor);
    const ab = await S().comercial.criarAbordagem(pronta, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "Olá, mensagem pronta de teste." }, autor);
    await S().comercial.aprovarAbordagem(ab.id, autor);
    await S().comercial.criarAbordagem(revisar, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "Olá, mensagem a revisar de teste." }, autor);
    await prisma.sdrSupressao.create({ data: { tenantId: tenantG, tipo: "TELEFONE", valor: b.telefone!, motivo: "EMPRESA_BLOQUEADA" } });
    await contatar(tenantG, jaContatada);
  });

  test("primeiro as prontas, depois as a revisar, depois as a preparar (por prioridade)", async () => {
    const { itens } = await S().fila.doDia({});
    const nossas = itens.filter((i) => [alta, media, pronta, revisar].includes(i.id));
    assert.deepEqual(nossas.map((i) => [i.id, i.estado]), [[pronta, "PRONTA"], [revisar, "A_REVISAR"], [alta, "A_PREPARAR"], [media, "A_PREPARAR"]]);
  });
  test("bloqueada e já contatada nunca entram; sem telefone só entra se o canal for e-mail", async () => {
    const wa = ids((await S().fila.doDia({ canal: "WHATSAPP" })).itens);
    for (const id of [bloqueada, jaContatada, semTelefone]) assert.equal(wa.includes(id), false);
    const em = ids((await S().fila.doDia({ canal: "EMAIL" })).itens);
    assert.equal(em.includes(semTelefone), true);
    assert.equal(em.includes(bloqueada) || em.includes(jaContatada), false);
  });
  test("respeita o limite pedido, o padrão de 20 e o teto de 50", async () => {
    assert.equal((await S().fila.doDia({ limite: 2 })).itens.length, 2);
    assert.equal((await S().fila.doDia({})).limite, 20);
    await assert.rejects(() => S().fila.doDia({ limite: 51 }), invalido);
    await assert.rejects(() => S().fila.doDia({ limite: 0 }), invalido);
  });
  test("o tenant não vem do pedido: campo desconhecido é recusado", async () => {
    await assert.rejects(() => S().fila.doDia({ tenantId: tenantH }), invalido);
    await assert.rejects(() => S().fila.revisao({ tenantId: tenantH }), invalido);
  });
  test("outra organização não vê nada desta fila", async () => {
    assert.equal((await S(tenantH).fila.doDia({})).itens.length, 0);
  });
  test("quem é contatado sai da fila e a próxima ocupa o lugar", async () => {
    const antes = ids((await S().fila.doDia({ limite: 3 })).itens);
    assert.equal(antes.length, 3);
    await contatar(tenantG, antes[0]);
    const depois = ids((await S().fila.doDia({ limite: 3 })).itens);
    assert.equal(depois.includes(antes[0]), false);
    assert.equal(depois.length, 3);
  });
});

describe("preparar mensagens (modelo neutro, sem IA)", () => {
  let a1 = "";
  let a2 = "";
  let semEmail = "";
  let outraOrg = "";

  before(async () => {
    a1 = (await empresa(tenantH, "Prep Um")).id;
    a2 = (await empresa(tenantH, "Prep Dois")).id;
    semEmail = (await empresa(tenantH, "Prep Sem Email", { email: null })).id;
    outraOrg = (await empresa(tenantG, "Prep De Outra Org")).id;
    await S(tenantH).comercial.salvar(a1, { decisorNome: "Marcos Lima", produto: "DILON_FACILITIES" }, autor);
  });

  test("cria rascunho para quem falta, sem aprovar nem enviar, e registra no histórico", async () => {
    const r = await S(tenantH).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP" }, autor);
    assert.equal(r.criadas, 3);
    const abs = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenantH } });
    assert.equal(abs.length, 3);
    assert.equal(abs.every((a) => a.status === "RASCUNHO" && a.canal === "WHATSAPP" && a.origem === "MANUAL" && a.aprovadaEm === null), true);
    const doUm = abs.find((a) => a.empresaId === a1)!;
    assert.match(doUm.texto, /Olá, Marcos/);
    assert.equal(doUm.produto, "DILON_FACILITIES");
    assert.equal(abs.find((a) => a.empresaId === a2)!.produto, "DILON_ZAP");
    assert.equal(await prisma.sdrInteracao.count({ where: { tenantId: tenantH, tipo: "ABORDAGEM", resultado: "rascunho criado" } }), 3);
  });
  test("repetir o pedido não duplica", async () => {
    const r = await S(tenantH).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP" }, autor);
    assert.deepEqual([r.criadas, r.falhas.length], [0, 0]);
    assert.equal(await prisma.sdrAbordagem.count({ where: { tenantId: tenantH } }), 3);
  });
  test("duas chamadas ao mesmo tempo (duplo clique) não criam rascunhos repetidos", async () => {
    const nova = (await empresa(tenantH, "Prep Concorrente")).id;
    const [x, y] = await Promise.all([
      S(tenantH).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP", empresaIds: [nova] }, autor),
      S(tenantH).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP", empresaIds: [nova] }, autor),
    ]);
    assert.equal(x.criadas + y.criadas, 1);
    assert.equal(await prisma.sdrAbordagem.count({ where: { tenantId: tenantH, empresaId: nova } }), 1);
  });
  test("por e-mail, quem não tem e-mail é contado à parte e não recebe rascunho", async () => {
    const r = await S(tenantH).fila.preparar({ canal: "EMAIL", produto: "DILON_ZAP", empresaIds: [a1, semEmail] }, autor);
    assert.deepEqual([r.criadas, r.semContato], [1, 1]);
    const ab = await prisma.sdrAbordagem.findFirstOrThrow({ where: { tenantId: tenantH, empresaId: a1, canal: "EMAIL" } });
    assert.match(ab.assunto ?? "", /Prep Um/);
    assert.equal(await prisma.sdrAbordagem.count({ where: { tenantId: tenantH, empresaId: semEmail, canal: "EMAIL" } }), 0);
  });
  test("empresa de outra organização, contatada ou bloqueada não recebe rascunho e a falha é informada", async () => {
    const contatada = (await empresa(tenantH, "Prep Contatada")).id;
    await contatar(tenantH, contatada);
    const b = await empresa(tenantH, "Prep Bloqueada");
    await prisma.sdrSupressao.create({ data: { tenantId: tenantH, tipo: "TELEFONE", valor: b.telefone!, motivo: "EMPRESA_BLOQUEADA" } });
    const antes = await prisma.sdrAbordagem.count({ where: { tenantId: tenantH } });
    const r = await S(tenantH).fila.preparar({ canal: "EMAIL", produto: "DILON_ZAP", empresaIds: [outraOrg, contatada, b.id] }, autor);
    assert.deepEqual([r.criadas, r.falhas.length], [0, 3]);
    assert.equal(r.falhas.some((f) => f.empresaId === outraOrg), true);
    assert.equal(await prisma.sdrAbordagem.count({ where: { tenantId: tenantH } }), antes);
    assert.equal(await prisma.sdrAbordagem.count({ where: { tenantId: tenantG, empresaId: outraOrg } }), 0);
  });
  test("não chama IA nem gasta orçamento", async () => {
    assert.equal(await prisma.sdrIaUso.count({ where: { tenantId: { in: [tenantG, tenantH] } } }), 0);
  });
  test("pedido inválido é recusado: sem canal, produto fora da lista, campo estranho", async () => {
    await assert.rejects(() => S(tenantH).fila.preparar({ produto: "DILON_ZAP" }, autor), invalido);
    await assert.rejects(() => S(tenantH).fila.preparar({ canal: "WHATSAPP", produto: "OUTRO" }, autor), invalido);
    await assert.rejects(() => S(tenantH).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP", tenantId: tenantG }, autor), invalido);
    await assert.rejects(() => S(tenantH).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP", empresaIds: [] }, autor), invalido);
  });
});

describe("revisão sequencial: aprovar, editar, pular e rejeitar", () => {
  let tenant = "";
  let e1 = "";
  let e2 = "";
  let e3 = "";

  before(async () => {
    tenant = (await prisma.tenant.create({ data: { name: "fila-rev", slug: "fila-teste-rev" } })).id;
    e1 = (await empresa(tenant, "Rev Um")).id;
    e2 = (await empresa(tenant, "Rev Dois")).id;
    e3 = (await empresa(tenant, "Rev Tres")).id;
    await S(tenant).comercial.salvar(e2, { prioridade: "ALTA" }, autor);
    await S(tenant).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP" }, autor);
  });
  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenant } });
  });

  test("lista um rascunho por abordagem, na ordem da fila, com os dados da empresa", async () => {
    const { itens } = await S(tenant).fila.revisao({});
    assert.equal(itens.length, 3);
    assert.equal(itens[0].empresa.id, e2);
    assert.deepEqual([itens[0].canal, itens[0].empresa.nome, itens[0].empresa.prioridade], ["WHATSAPP", "Rev Dois", "ALTA"]);
    assert.match(itens[0].texto, /Rev Dois/);
  });
  test("aprovar guarda o texto exato e tira o item da revisão; a empresa passa a ser 'pronta'", async () => {
    const [primeiro] = (await S(tenant).fila.revisao({})).itens;
    const ap = await S(tenant).comercial.aprovarAbordagem(primeiro.abordagemId, autor);
    assert.equal(ap.textoAprovado, primeiro.texto);
    assert.equal((await S(tenant).fila.revisao({})).itens.some((i) => i.abordagemId === primeiro.abordagemId), false);
    const fila = (await S(tenant).fila.doDia({})).itens;
    assert.equal(fila[0].id, e2);
    assert.equal(fila[0].estado, "PRONTA");
  });
  test("editar e aprovar: o texto novo é o aprovado, e a versão sobe", async () => {
    const alvo = (await S(tenant).fila.revisao({})).itens[0];
    const editada = await S(tenant).comercial.editarAbordagem(alvo.abordagemId, { texto: "Texto ajustado à mão para esta empresa." }, autor);
    assert.equal(editada.versao, 2);
    const ap = await S(tenant).comercial.aprovarAbordagem(alvo.abordagemId, autor);
    assert.deepEqual([ap.textoAprovado, ap.versaoAprovada], ["Texto ajustado à mão para esta empresa.", 2]);
  });
  test("rejeitar tira da revisão e deixa a empresa sem mensagem (volta a 'a preparar')", async () => {
    const alvo = (await S(tenant).fila.revisao({})).itens[0];
    await S(tenant).comercial.rejeitarAbordagem(alvo.abordagemId, autor);
    assert.equal((await S(tenant).fila.revisao({})).itens.length, 0);
    const item = (await S(tenant).fila.doDia({})).itens.find((i) => i.id === alvo.empresa.id)!;
    assert.equal(item.estado, "A_PREPARAR");
  });
  test("pular não altera nada: o rascunho segue aguardando revisão (pular é só da tela)", async () => {
    await S(tenant).fila.preparar({ canal: "EMAIL", produto: "DILON_ZAP", empresaIds: [e1] }, autor);
    const antes = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenant, status: "RASCUNHO" }, select: { id: true, versao: true, updatedAt: true } });
    await S(tenant).fila.revisao({});
    const depois = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenant, status: "RASCUNHO" }, select: { id: true, versao: true, updatedAt: true } });
    assert.deepEqual(depois, antes);
  });
  test("o filtro de canal separa WhatsApp de e-mail", async () => {
    const em = (await S(tenant).fila.revisao({ canal: "EMAIL" })).itens;
    assert.equal(em.length > 0 && em.every((i) => i.canal === "EMAIL"), true);
    const wa = (await S(tenant).fila.revisao({ canal: "WHATSAPP" })).itens;
    assert.equal(wa.every((i) => i.canal === "WHATSAPP"), true);
  });
  test("empresa que entrou na lista de bloqueio depois sai da revisão", async () => {
    const alvo = (await S(tenant).fila.revisao({ canal: "EMAIL" })).itens[0];
    const emp = await prisma.sdrEmpresa.findFirstOrThrow({ where: { id: alvo.empresa.id } });
    await prisma.sdrSupressao.create({ data: { tenantId: tenant, tipo: "CNPJ", valor: emp.cnpj!, motivo: "EMPRESA_BLOQUEADA" } });
    assert.equal((await S(tenant).fila.revisao({ canal: "EMAIL" })).itens.some((i) => i.abordagemId === alvo.abordagemId), false);
    await assert.rejects(() => S(tenant).comercial.aprovarAbordagem(alvo.abordagemId, autor), status(409));
  });
  test("outra organização não revisa nem aprova rascunhos daqui", async () => {
    assert.equal((await S(tenantG).fila.revisao({})).itens.some((i) => [e1, e2, e3].includes(i.empresa.id)), false);
    const qualquer = await prisma.sdrAbordagem.findFirstOrThrow({ where: { tenantId: tenant } });
    await assert.rejects(() => S(tenantG).comercial.aprovarAbordagem(qualquer.id, autor), status(404));
  });
});

describe("resultado em lote", () => {
  let tenant = "";
  let c1 = "";
  let c2 = "";
  let c3 = "";
  let naoContatada = "";

  before(async () => {
    tenant = (await prisma.tenant.create({ data: { name: "fila-lote", slug: "fila-teste-lote" } })).id;
    c1 = (await empresa(tenant, "Lote Um")).id;
    c2 = (await empresa(tenant, "Lote Dois")).id;
    c3 = (await empresa(tenant, "Lote Tres")).id;
    naoContatada = (await empresa(tenant, "Lote Fria")).id;
    for (const id of [c1, c2, c3]) await contatar(tenant, id);
  });
  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenant } });
  });

  test("aplica o mesmo resultado a várias, com histórico próprio em cada uma", async () => {
    const r = await S(tenant).fila.resultadosEmLote({ empresaIds: [c1, c2], etapa: "RESPONDEU", nota: "Responderam por WhatsApp" }, autor);
    assert.deepEqual([r.aplicadas, r.falhas], [2, 0]);
    for (const id of [c1, c2]) {
      const f = await S(tenant).comercial.ficha(id);
      assert.equal(f.acompanhamento.etapa, "RESPONDEU");
      assert.equal(f.interacoes.some((i) => i.tipo === "RESPOSTA" && i.resultado === "RESPONDEU" && i.texto === "Responderam por WhatsApp"), true);
      // O histórico anterior (abordagem, contato) continua lá.
      assert.equal(f.interacoes.some((i) => i.tipo === "CONTATO"), true);
    }
    assert.equal((await S(tenant).comercial.ficha(c3)).acompanhamento.etapa, "CONTATADA");
  });
  test("uma que não pode (ainda não contatada, de outra organização, inexistente) falha sozinha e não impede as outras", async () => {
    const estranha = (await empresa(tenantG, "Lote De Outra Org")).id;
    const r = await S(tenant).fila.resultadosEmLote({ empresaIds: [naoContatada, estranha, "nao-existe", c3], etapa: "INTERESSE" }, autor);
    assert.deepEqual([r.aplicadas, r.falhas], [1, 3]);
    assert.equal((await S(tenant).comercial.ficha(c3)).acompanhamento.etapa, "INTERESSE");
    assert.equal((await S(tenant).comercial.ficha(naoContatada)).acompanhamento.etapa, "NAO_CONTATADA");
    assert.equal((await S(tenantG).comercial.ficha(estranha)).acompanhamento.etapa, "NAO_CONTATADA");
    assert.equal(await prisma.sdrInteracao.count({ where: { tenantId: tenantG, empresaId: estranha, tipo: "RESPOSTA" } }), 0);
  });
  test("'não contatar' em lote bloqueia cada empresa e rejeita o que estava pendente", async () => {
    const d = (await empresa(tenant, "Lote Nao Contatar")).id;
    await contatar(tenant, d);
    const pend = await S(tenant).comercial.criarAbordagem(d, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Texto pendente de teste." }, autor);
    const r = await S(tenant).fila.resultadosEmLote({ empresaIds: [d], etapa: "NAO_CONTATAR" }, autor);
    assert.equal(r.aplicadas, 1);
    assert.equal((await prisma.sdrAbordagem.findUniqueOrThrow({ where: { id: pend.id } })).status, "REJEITADA");
    const emp = await prisma.sdrEmpresa.findUniqueOrThrow({ where: { id: d } });
    assert.equal(await prisma.sdrSupressao.count({ where: { tenantId: tenant, tipo: "CNPJ", valor: emp.cnpj!, motivo: "SOLICITOU_NAO_CONTATO" } }), 1);
    assert.equal((await S(tenant).comercial.ficha(d)).podeContatar, false);
  });
  test("repetir o mesmo lote não duplica bloqueios", async () => {
    const e = (await empresa(tenant, "Lote Repetido")).id;
    await contatar(tenant, e);
    await S(tenant).fila.resultadosEmLote({ empresaIds: [e], etapa: "NAO_CONTATAR" }, autor);
    const antes = await prisma.sdrSupressao.count({ where: { tenantId: tenant } });
    const r = await S(tenant).fila.resultadosEmLote({ empresaIds: [e], etapa: "NAO_CONTATAR" }, autor);
    assert.equal(r.aplicadas, 1);
    assert.equal(await prisma.sdrSupressao.count({ where: { tenantId: tenant } }), antes);
  });
  test("pedido inválido: sem empresas, mais de 50, etapa que o lote não aceita, campo estranho", async () => {
    await assert.rejects(() => S(tenant).fila.resultadosEmLote({ empresaIds: [], etapa: "RESPONDEU" }, autor), invalido);
    await assert.rejects(() => S(tenant).fila.resultadosEmLote({ empresaIds: Array.from({ length: 51 }, (_, i) => `x${i}`), etapa: "RESPONDEU" }, autor), invalido);
    await assert.rejects(() => S(tenant).fila.resultadosEmLote({ empresaIds: [c1], etapa: "CONVERTIDA" }, autor), invalido);
    await assert.rejects(() => S(tenant).fila.resultadosEmLote({ empresaIds: [c1], etapa: "CONTATADA" }, autor), invalido);
    await assert.rejects(() => S(tenant).fila.resultadosEmLote({ empresaIds: [c1], etapa: "RESPONDEU", tenantId: tenantG }, autor), invalido);
  });
});

describe("funil por campanha", () => {
  let tenant = "";
  let outro = "";
  let campA = "";
  let campB = "";

  before(async () => {
    tenant = (await prisma.tenant.create({ data: { name: "fila-funil", slug: "fila-teste-funil" } })).id;
    outro = (await prisma.tenant.create({ data: { name: "fila-funil-2", slug: "fila-teste-funil-2" } })).id;
    const icp = await prisma.sdrIcp.create({ data: { tenantId: tenant, nome: "Perfil Funil" } });
    campA = (await prisma.sdrCampanha.create({ data: { tenantId: tenant, nome: "Campanha A", icpId: icp.id, status: "ATIVA" } })).id;
    campB = (await prisma.sdrCampanha.create({ data: { tenantId: tenant, nome: "Campanha B", icpId: icp.id, status: "ATIVA" } })).id;
    const noA = [await empresa(tenant, "Funil A1"), await empresa(tenant, "Funil A2"), await empresa(tenant, "Funil A3"), await empresa(tenant, "Funil A4")];
    const semCampanha = await empresa(tenant, "Funil Solta");
    for (const e of noA) await prisma.sdrProspecto.create({ data: { tenantId: tenant, empresaId: e.id, campanhaId: campA, icpId: icp.id } });
    // A1 e A2 contatadas; A1 responde com interesse; A3 tem rascunho; A4 tem mensagem aprovada.
    await contatar(tenant, noA[0].id);
    await contatar(tenant, noA[1].id);
    await S(tenant).comercial.registrarResultado(noA[0].id, { etapa: "INTERESSE" }, autor);
    await S(tenant).comercial.criarAbordagem(noA[2].id, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "Rascunho do funil." }, autor);
    const ap = await S(tenant).comercial.criarAbordagem(noA[3].id, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "Aprovada do funil." }, autor);
    await S(tenant).comercial.aprovarAbordagem(ap.id, autor);
    await contatar(tenant, semCampanha.id);
    await empresa(outro, "Funil Outro Tenant");
  });
  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant, outro] } } });
  });

  test("conta cada passo da campanha e calcula a taxa de resposta", async () => {
    const { itens } = await S(tenant).fila.funil();
    const a = itens.find((i) => i.campanhaId === campA)!;
    assert.deepEqual(
      [a.empresas, a.aRevisar, a.aprovadas, a.contatadas, a.responderam, a.interesse, a.reunioes, a.convertidas, a.encerradas],
      [4, 1, 1, 2, 1, 1, 0, 0, 0]
    );
    assert.equal(a.taxaDeResposta, 50);
    assert.equal(a.horasAteAResposta !== null && a.horasAteAResposta >= 0, true);
  });
  test("campanha sem empresas aparece zerada, sem taxa", async () => {
    const b = (await S(tenant).fila.funil()).itens.find((i) => i.campanhaId === campB)!;
    assert.deepEqual([b.empresas, b.contatadas, b.taxaDeResposta, b.horasAteAResposta], [0, 0, null, null]);
  });
  test("empresas sem campanha aparecem à parte", async () => {
    const solta = (await S(tenant).fila.funil()).itens.find((i) => i.campanhaId === null)!;
    assert.deepEqual([solta.nome, solta.empresas, solta.contatadas], ["Sem campanha", 1, 1]);
  });
  test("'contatadas' e 'responderam' vêm do histórico: não somem quando a empresa avança", async () => {
    const a = (await S(tenant).fila.funil()).itens.find((i) => i.campanhaId === campA)!;
    // A1 está em INTERESSE (já não é 'aguardando resposta'), e mesmo assim conta como contatada e respondeu.
    assert.equal(a.contatadas, 2);
    assert.equal(a.responderam, 1);
  });
  test("outra organização vê só o que é dela", async () => {
    const { itens } = await S(outro).fila.funil();
    assert.equal(itens.some((i) => i.campanhaId === campA || i.campanhaId === campB), false);
    assert.equal(itens.find((i) => i.campanhaId === null)?.contatadas, 0);
  });
});

describe("resumo do dia e limites de WhatsApp preservados", () => {
  let tenant = "";
  let ids3: string[] = [];

  before(async () => {
    tenant = (await prisma.tenant.create({ data: { name: "fila-resumo", slug: "fila-teste-resumo" } })).id;
    ids3 = [(await empresa(tenant, "Res Um")).id, (await empresa(tenant, "Res Dois")).id, (await empresa(tenant, "Res Tres")).id];
  });
  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenant } });
  });

  const limites = { limiteDiario: 2, intervaloMinimoSegundos: 0 };

  test("conta prontas, a revisar e a preparar, e mostra quanto resta do limite", async () => {
    await S(tenant).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP", empresaIds: [ids3[0], ids3[1]] }, autor);
    const [rascunho] = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenant, empresaId: ids3[0] } });
    await S(tenant).comercial.aprovarAbordagem(rascunho.id, autor);
    const r = await S(tenant).fila.resumo(limites, {});
    assert.deepEqual([r.prontas, r.aRevisar, r.aPreparar], [1, 1, 1]);
    assert.deepEqual([r.whatsapp.limiteDiario, r.whatsapp.conversasAbertasHoje, r.whatsapp.restantesHoje], [2, 0, 2]);
  });
  test("preparar, revisar e aprovar nunca abrem conversa nem contam no limite", async () => {
    assert.equal(await prisma.sdrInteracao.count({ where: { tenantId: tenant, canal: "WHATSAPP", resultado: { startsWith: "conversa aberta" } } }), 0);
    assert.equal(await prisma.sdrInteracao.count({ where: { tenantId: tenant, tipo: "CONTATO" } }), 0);
  });
  test("abrir a conversa continua uma por clique, com o mesmo limite diário, mesmo com a fila toda preparada", async () => {
    await S(tenant).fila.preparar({ canal: "WHATSAPP", produto: "DILON_ZAP" }, autor);
    for (const id of ids3) {
      const ab = await prisma.sdrAbordagem.findFirstOrThrow({ where: { tenantId: tenant, empresaId: id, status: { in: ["RASCUNHO", "APROVADA"] } } });
      if (ab.status === "RASCUNHO") await S(tenant).comercial.aprovarAbordagem(ab.id, autor);
    }
    const abordagens = await prisma.sdrAbordagem.findMany({ where: { tenantId: tenant, status: "APROVADA" }, orderBy: { createdAt: "asc" } });
    assert.equal(abordagens.length, 3);
    const comIntervalo = { limiteDiario: 2, intervaloMinimoSegundos: 3600 };
    const r1 = await S(tenant).comercial.abrirConversaNoWhatsapp(abordagens[0].id, autor, comIntervalo);
    assert.match(r1.url, /^\/abrir-conversa\?/);
    // O intervalo mínimo segura a segunda abertura logo em seguida.
    await assert.rejects(() => S(tenant).comercial.abrirConversaNoWhatsapp(abordagens[1].id, autor, comIntervalo), (e) => status(429)(e) && /aguarde/.test((e as Error).message));
    await S(tenant).comercial.abrirConversaNoWhatsapp(abordagens[1].id, autor, limites);
    await assert.rejects(() => S(tenant).comercial.abrirConversaNoWhatsapp(abordagens[2].id, autor, limites), (e) => status(429)(e) && /limite de 2/.test((e as Error).message));
    const r = await S(tenant).fila.resumo(limites, {});
    assert.deepEqual([r.whatsapp.conversasAbertasHoje, r.whatsapp.restantesHoje], [2, 0]);
  });
  test("os limites configurados do servidor seguem os de antes: 10 por dia, 90 s de intervalo, 20 e-mails por dia", () => {
    const l = limitesDoSdr({});
    assert.deepEqual([l.whatsapp.limiteDiario, l.whatsapp.intervaloMinimoSegundos, l.emailPorDia], [10, 90, 20]);
  });
});

describe("rotas da fila", () => {
  const criadas: string[] = [];

  before(async () => {
    for (const nome of ["Rota Fila Um", "Rota Fila Dois"]) criadas.push((await empresa(dilonId, nome)).id);
  });
  after(async () => {
    await prisma.sdrEmpresa.deleteMany({ where: { tenantId: dilonId, id: { in: criadas } } });
  });

  test("sem login todas vão para o login", async () => {
    const s = new Sessao();
    for (const [m, rota] of [
      ["GET", "/api/sdr/fila"],
      ["GET", "/api/sdr/fila/resumo"],
      ["GET", "/api/sdr/fila/revisao"],
      ["GET", "/api/sdr/fila/funil"],
      ["POST", "/api/sdr/fila/preparar"],
      ["POST", "/api/sdr/fila/resultados"],
    ] as const) {
      assert.equal((await s.chamar(rota, m, m === "GET" ? undefined : {})).status, 307, `${m} ${rota}`);
    }
  });
  test("leitura: responsável e financeiro; escrita só do responsável; atendente e empresa sem o recurso, nada", async () => {
    for (const rota of ["/api/sdr/fila", "/api/sdr/fila/resumo", "/api/sdr/fila/revisao", "/api/sdr/fila/funil"]) {
      assert.equal((await (await logado(USUARIOS.dono)).chamar(rota)).status, 200, rota);
      assert.equal((await (await logado(USUARIOS.financeiro)).chamar(rota)).status, 200, rota);
      for (const u of [USUARIOS.atendente, USUARIOS.externo]) assert.equal((await (await logado(u)).chamar(rota)).status, 403, `${u} ${rota}`);
    }
    const corpo = { canal: "WHATSAPP", produto: "DILON_ZAP" };
    assert.equal((await (await logado(USUARIOS.financeiro)).chamar("/api/sdr/fila/preparar", "POST", corpo)).status, 403);
    assert.equal((await (await logado(USUARIOS.financeiro)).chamar("/api/sdr/fila/resultados", "POST", { empresaIds: ["x"], etapa: "RESPONDEU" })).status, 403);
    for (const u of [USUARIOS.atendente, USUARIOS.externo]) assert.equal((await (await logado(u)).chamar("/api/sdr/fila/preparar", "POST", corpo)).status, 403);
  });
  test("pedido inválido é 400: limite fora da faixa, campo estranho, tenantId vindo do navegador", async () => {
    const dono = await logado(USUARIOS.dono);
    assert.equal((await dono.chamar("/api/sdr/fila?limite=999")).status, 400);
    assert.equal((await dono.chamar("/api/sdr/fila?tenantId=outro")).status, 400);
    assert.equal((await dono.chamar("/api/sdr/fila/preparar", "POST", { canal: "WHATSAPP", produto: "DILON_ZAP", tenantId: "outro" })).status, 400);
    assert.equal((await dono.chamar("/api/sdr/fila/preparar", "POST", {})).status, 400);
    assert.equal((await dono.chamar("/api/sdr/fila/resultados", "POST", { empresaIds: [], etapa: "RESPONDEU" })).status, 400);
  });
  test("preparar e revisar pelo site: cria rascunho, lista para revisão e nada é enviado", async () => {
    const dono = await logado(USUARIOS.dono);
    const antes = await prisma.sdrInteracao.count({ where: { tenantId: dilonId, tipo: "CONTATO" } });
    const r = await dono.chamar("/api/sdr/fila/preparar", "POST", { canal: "WHATSAPP", produto: "DILON_ZAP", empresaIds: criadas });
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { criadas: number }).criadas, 2);
    const rev = (await (await dono.chamar("/api/sdr/fila/revisao?canal=WHATSAPP")).json()) as { itens: { abordagemId: string; empresa: { id: string } }[] };
    const meus = rev.itens.filter((i) => criadas.includes(i.empresa.id));
    assert.equal(meus.length, 2);
    // Aprovar pela rota que já existia.
    assert.equal((await dono.chamar(`/api/sdr/abordagens/${meus[0].abordagemId}/aprovar`, "POST")).status, 200);
    const resumo = (await (await dono.chamar("/api/sdr/fila/resumo")).json()) as { prontas: number; whatsapp: { limiteDiario: number; intervaloMinimoSegundos: number } };
    assert.equal(resumo.prontas >= 1, true);
    assert.deepEqual([resumo.whatsapp.limiteDiario, resumo.whatsapp.intervaloMinimoSegundos], [10, 90]);
    assert.equal(await prisma.sdrInteracao.count({ where: { tenantId: dilonId, tipo: "CONTATO" } }), antes);
  });
  test("resultado em lote pelo site: registra, informa o que falhou e devolve o estado do CRM de cada uma", async () => {
    const dono = await logado(USUARIOS.dono);
    // A aprovada do teste anterior (qual das duas empresas, a ordem da fila decide).
    const ab = await prisma.sdrAbordagem.findFirstOrThrow({ where: { tenantId: dilonId, empresaId: { in: criadas }, status: "APROVADA" } });
    const contatada = ab.empresaId;
    const fria = criadas.find((id) => id !== contatada)!;
    // Registra o contato direto no núcleo (a rota de contato também espelharia no CRM, que não é o foco aqui).
    await sdrDoTenant(dilonId).comercial.registrarContato(ab.id, { canal: "WHATSAPP" }, { id: "u", name: "Teste" });
    const r = await dono.chamar("/api/sdr/fila/resultados", "POST", { empresaIds: [contatada, fria], etapa: "RESPONDEU", nota: "Lote pela rota" });
    assert.equal(r.status, 200);
    const j = (await r.json()) as { aplicadas: number; falhas: number; itens: { empresaId: string; ok: boolean; crm?: { ok: boolean } }[] };
    assert.deepEqual([j.aplicadas, j.falhas], [1, 1]);
    assert.equal(j.itens.find((i) => i.empresaId === contatada)?.ok, true);
    assert.equal(typeof j.itens.find((i) => i.empresaId === contatada)?.crm?.ok, "boolean");
    assert.equal(j.itens.find((i) => i.empresaId === fria)?.ok, false);
  });
});

describe("guardas: a fila organiza, não envia", () => {
  const ler = (...partes: string[]) => fs.readFileSync(path.join(raiz, ...partes), "utf8");

  test("o núcleo da fila não envia, não chama IA, não fala com o WhatsApp nem usa o CRM", () => {
    const t = ler("packages/sdr-core/src/fila-diaria.ts");
    assert.equal(/enviarEmail|enviar-email|nodemailer|executarTarefaIa|gerarAbordagemComIa|prepararConversaNoWhatsapp|WORKER_INTERNAL|resolveWhatsAppJid|prisma\.(contact|negociacao|funil|stage)\b/.test(t), false);
  });
  test("o banco não ganhou tabela nem coluna por causa da fila", () => {
    const t = ler("packages/db/prisma/schema.prisma");
    assert.equal(/model\s+(SdrFila|SdrLote|SdrPesquisa|RfbEstabelecimento)/i.test(t), false);
  });
  test("a tela da fila não tem envio: só prepara, revisa, registra e mostra; nada de e-mail nem de abrir conversa", () => {
    const t = ler("apps/web/app/(dashboard)/sdr/fila-panel.tsx");
    assert.equal(/enviar-email|\/whatsapp|window\.open|Enviar para todos|Enviar em lote|Disparar/i.test(t), false);
    assert.match(t, /Aprovar não envia nada/);
    assert.match(t, /Preparar só cria rascunhos/);
  });
  test("o botão de e-mail segue oculto: só a ficha o mostra, e só com a caixa configurada", () => {
    const ficha = ler("apps/web/app/(dashboard)/sdr/ficha-comercial.tsx");
    assert.match(ficha, /enviar-email/);
    assert.equal(/enviar-email/.test(ler("apps/web/app/(dashboard)/sdr/fila-panel.tsx")), false);
    assert.equal(/enviar-email/.test(ler("apps/web/app/(dashboard)/sdr/hoje-panel.tsx")), false);
  });
});
