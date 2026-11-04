import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { PREFIXO_AVISO_TELEFONE_DESCARTADO, motivoDoVerificar, sdrDoTenant } from "../../sdr-core/src/index";
import { normalizarTelefone } from "../../sdr-core/src/normalizacao";
import { filtroEmpresasSchema, filtroPainelSchema } from "../../../apps/web/lib/sdr/esquemas";
import { Sessao, logado } from "./ajudantes";
import { USUARIOS } from "../src/semente";
import { cnpjDe } from "./dados";

/**
 * Lista priorizada e painel de indicadores do SDR. Os dados são criados direto no banco de teste,
 * em empresas só destes testes, para os totais serem exatos e nada de outro arquivo interferir.
 */

const T0 = Date.parse("2026-01-01T12:00:00Z");
const hora = (n: number) => new Date(T0 + n * 3_600_000);

let tenantA = "";
let tenantB = "";
let tenantP = "";
let c1 = "";
let c2 = "";
let icp1 = "";
let icp2 = "";
const id: Record<string, string> = {};

type Prosp = { campanha: "c1" | "c2"; status: "PENDENTE" | "QUALIFICADO" | "NAO_QUALIFICADO" | "VERIFICAR"; pontuacao: number | null; criterios?: unknown };
type Semente = { n: number; nome: string; uf: string; cidade: string; segmento: string; tel: boolean; email: boolean; site: boolean; cnpj: boolean; prosp: Prosp[] };

const ESTADO_DESCONHECIDO = [
  { chave: "uf", nome: "Estado", tipo: "UF", peso: 5, obrigatorio: true, situacao: "DESCONHECIDO", justificativa: "Estado não informado no CSV, não dá para conferir" },
  { chave: "porte", nome: "Porte", tipo: "PORTE", peso: 3, obrigatorio: false, situacao: "ATENDIDO", justificativa: "ok" },
];

const SEMENTES: Semente[] = [
  { n: 1, nome: "Alfa", uf: "SP", cidade: "São Paulo", segmento: "Clínicas", tel: true, email: true, site: true, cnpj: true, prosp: [{ campanha: "c1", status: "QUALIFICADO", pontuacao: 90 }] },
  { n: 2, nome: "Beta", uf: "SP", cidade: "Campinas", segmento: "Clínicas", tel: true, email: false, site: true, cnpj: true, prosp: [{ campanha: "c1", status: "QUALIFICADO", pontuacao: 70 }, { campanha: "c2", status: "NAO_QUALIFICADO", pontuacao: 20 }] },
  { n: 3, nome: "Gama", uf: "RJ", cidade: "Rio de Janeiro", segmento: "Contabilidade", tel: false, email: true, site: false, cnpj: true, prosp: [{ campanha: "c1", status: "VERIFICAR", pontuacao: 100, criterios: ESTADO_DESCONHECIDO }] },
  { n: 4, nome: "Delta", uf: "RJ", cidade: "Niterói", segmento: "Contabilidade", tel: false, email: false, site: false, cnpj: false, prosp: [{ campanha: "c1", status: "PENDENTE", pontuacao: null }] },
  { n: 5, nome: "Epsilon", uf: "SP", cidade: "São Paulo", segmento: "Clínicas", tel: true, email: false, site: false, cnpj: false, prosp: [] },
  { n: 6, nome: "Zeta", uf: "SP", cidade: "São Paulo", segmento: "Clínicas", tel: true, email: true, site: true, cnpj: true, prosp: [{ campanha: "c1", status: "QUALIFICADO", pontuacao: 90 }] },
  { n: 7, nome: "Eta", uf: "SP", cidade: "Campinas", segmento: "Clínicas", tel: true, email: false, site: true, cnpj: true, prosp: [{ campanha: "c2", status: "QUALIFICADO", pontuacao: 95 }] },
  { n: 8, nome: "Theta", uf: "RJ", cidade: "Rio de Janeiro", segmento: "Contabilidade", tel: true, email: false, site: false, cnpj: true, prosp: [{ campanha: "c1", status: "NAO_QUALIFICADO", pontuacao: 10 }] },
];

const nomes = (r: { itens: { id: string }[] }) => r.itens.map((e) => Object.keys(id).find((k) => id[k] === e.id) ?? e.id);

async function criarTenant(slug: string) {
  return (await prisma.tenant.create({ data: { name: slug, slug } })).id;
}

async function criarPerfisECampanhas(tenantId: string, sufixo: string) {
  const i1 = (await prisma.sdrIcp.create({ data: { tenantId, nome: `Perfil 1 ${sufixo}` } })).id;
  const i2 = (await prisma.sdrIcp.create({ data: { tenantId, nome: `Perfil 2 ${sufixo}` } })).id;
  const a = (await prisma.sdrCampanha.create({ data: { tenantId, nome: `Campanha 1 ${sufixo}`, icpId: i1 } })).id;
  const b = (await prisma.sdrCampanha.create({ data: { tenantId, nome: `Campanha 2 ${sufixo}`, icpId: i2 } })).id;
  return { i1, i2, a, b };
}

before(async () => {
  tenantA = await criarTenant("lista-painel-a");
  tenantB = await criarTenant("lista-painel-b");
  tenantP = await criarTenant("lista-painel-paginas");
  ({ i1: icp1, i2: icp2, a: c1, b: c2 } = await criarPerfisECampanhas(tenantA, "A"));

  for (const s of SEMENTES) {
    const e = await prisma.sdrEmpresa.create({
      data: {
        tenantId: tenantA,
        razaoSocial: `${s.nome} Ltda`,
        chaveNome: s.nome.toLowerCase(),
        uf: s.uf,
        cidade: s.cidade,
        segmento: s.segmento,
        cnpj: s.cnpj ? cnpjDe(1000 + s.n) : null,
        telefone: s.tel ? `5511900000${String(s.n).padStart(3, "0")}` : null,
        email: s.email ? `${s.nome.toLowerCase()}@${s.nome.toLowerCase()}.com.br` : null,
        site: s.site ? `https://${s.nome.toLowerCase()}.com.br` : null,
        dominio: s.site ? `${s.nome.toLowerCase()}.com.br` : null,
        emailDominio: s.email ? `${s.nome.toLowerCase()}.com.br` : null,
        createdAt: hora(s.n),
      },
    });
    id[`E${s.n}`] = e.id;
    for (const p of s.prosp) {
      await prisma.sdrProspecto.create({
        data: {
          tenantId: tenantA,
          empresaId: e.id,
          campanhaId: p.campanha === "c1" ? c1 : c2,
          icpId: p.campanha === "c1" ? icp1 : icp2,
          status: p.status,
          pontuacao: p.pontuacao,
          criterios: (p.criterios ?? undefined) as never,
        },
      });
    }
  }

  // E6 (Zeta) fica bloqueada pelo e-mail.
  await prisma.sdrSupressao.create({ data: { tenantId: tenantA, tipo: "EMAIL", valor: "zeta@zeta.com.br", motivo: "SOLICITOU_NAO_CONTATO" } });

  // Telefone descartado: E4 (sem telefone) em duas importações, E5 (tem telefone) e uma linha sem empresa.
  const aviso = `${PREFIXO_AVISO_TELEFONE_DESCARTADO}: 123`;
  for (const [n, empresas] of [[1, ["E4", "E5"]], [2, ["E4"]]] as const) {
    const imp = await prisma.sdrImportacao.create({ data: { tenantId: tenantA, chave: `lista-painel-${n}`, nomeArquivo: `a${n}.csv`, hashArquivo: `h${n}`, mapeamento: {}, delimitador: ";" } });
    let numero = 2;
    for (const e of empresas) {
      await prisma.sdrImportacaoLinha.create({ data: { tenantId: tenantA, importacaoId: imp.id, numero: numero++, status: "IMPORTADA", bruto: {}, avisos: [aviso], empresaId: id[e] } });
    }
    await prisma.sdrImportacaoLinha.create({ data: { tenantId: tenantA, importacaoId: imp.id, numero: numero++, status: "INVALIDA", bruto: {}, avisos: [aviso], empresaId: null } });
  }

  // Outra empresa (tenant): mesmas formas de dado, nada pode vazar para a A.
  const outra = await criarPerfisECampanhas(tenantB, "B");
  const eb = await prisma.sdrEmpresa.create({ data: { tenantId: tenantB, razaoSocial: "Alfa Outra Ltda", chaveNome: "alfa outra", uf: "SP", cidade: "São Paulo", segmento: "Clínicas", createdAt: hora(9) } });
  id.OUTRA = eb.id;
  await prisma.sdrProspecto.create({ data: { tenantId: tenantB, empresaId: eb.id, campanhaId: outra.a, icpId: outra.i1, status: "QUALIFICADO", pontuacao: 99 } });

  // 60 empresas, muitas com a mesma pontuação e algumas sem, para provar a paginação estável.
  const base = await criarPerfisECampanhas(tenantP, "P");
  const empresas = Array.from({ length: 60 }, (_, i) => ({ tenantId: tenantP, razaoSocial: `Pagina ${i}`, chaveNome: `pagina ${i}`, createdAt: hora(i % 20) }));
  await prisma.sdrEmpresa.createMany({ data: empresas });
  const criadas = await prisma.sdrEmpresa.findMany({ where: { tenantId: tenantP }, select: { id: true, razaoSocial: true } });
  await prisma.sdrProspecto.createMany({
    data: criadas
      .filter((e) => Number(e.razaoSocial!.split(" ")[1]) % 5 !== 0)
      .map((e) => ({ tenantId: tenantP, empresaId: e.id, campanhaId: base.a, icpId: base.i1, status: "QUALIFICADO" as const, pontuacao: Number(e.razaoSocial!.split(" ")[1]) % 4 === 0 ? null : Number(e.razaoSocial!.split(" ")[1]) % 7 })),
  });
});

after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB, tenantP].filter(Boolean) } } });
});

const A = () => sdrDoTenant(tenantA);

describe("lista de empresas: ordenação", () => {
  test("padrão: maior pontuação primeiro, sem pontuação no fim, desempate por data de importação", async () => {
    const r = await A().empresas.listar();
    // 100, 95, 90 (Zeta é mais nova que Alfa), 70, 10 e, sem pontuação, a mais nova primeiro.
    assert.deepEqual(nomes(r), ["E3", "E7", "E6", "E1", "E2", "E8", "E5", "E4"]);
    assert.equal(r.total, 8);
  });
  test("por data de importação: a mais recente primeiro", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ ordem: "data" })), ["E8", "E7", "E6", "E5", "E4", "E3", "E2", "E1"]);
  });
  test("qualificadas primeiro: depois para verificar, aguardando, não qualificadas e fora de campanha", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ ordem: "prontas" })), ["E7", "E6", "E1", "E2", "E3", "E4", "E8", "E5"]);
  });
  test("a ordem é a mesma a cada chamada", async () => {
    const a = nomes(await A().empresas.listar());
    const b = nomes(await A().empresas.listar());
    assert.deepEqual(a, b);
  });
  test("com campanha, a pontuação é a daquela campanha (Beta tem 70 em uma e 20 na outra)", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ campanhaId: c1 })), ["E3", "E6", "E1", "E2", "E8", "E4"]);
    const c = await A().empresas.listar({ campanhaId: c2 });
    assert.deepEqual(nomes(c), ["E7", "E2"]);
    assert.equal(c.itens.find((e) => e.id === id.E2)!.prospectos.every((p) => p.campanhaId === c2), true);
  });
  test("com perfil (ICP), vale o mesmo", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ icpId: icp2 })), ["E7", "E2"]);
    assert.deepEqual(nomes(await A().empresas.listar({ icpId: icp1 })), ["E3", "E6", "E1", "E2", "E8", "E4"]);
  });
  test("sem pontuação nunca vira zero: a pendente fica depois da de 10 pontos", async () => {
    const nomesC1 = nomes(await A().empresas.listar({ campanhaId: c1 }));
    assert.equal(nomesC1.indexOf("E4") > nomesC1.indexOf("E8"), true);
  });
});

describe("lista de empresas: filtros", () => {
  test("situação", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ status: "QUALIFICADO" })), ["E7", "E6", "E1", "E2"]);
    assert.deepEqual(nomes(await A().empresas.listar({ status: "VERIFICAR" })), ["E3"]);
    assert.deepEqual(nomes(await A().empresas.listar({ status: "PENDENTE" })), ["E4"]);
    assert.deepEqual(nomes(await A().empresas.listar({ status: "NAO_QUALIFICADO" })), ["E2", "E8"]);
  });
  test("situação e campanha juntas", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ campanhaId: c2, status: "NAO_QUALIFICADO" })), ["E2"]);
    assert.deepEqual(nomes(await A().empresas.listar({ campanhaId: c2, status: "VERIFICAR" })), []);
  });
  test("UF, cidade (sem diferenciar maiúsculas) e segmento", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ uf: "RJ" })), ["E3", "E8", "E4"]);
    assert.deepEqual(nomes(await A().empresas.listar({ cidade: "campinas" })), ["E7", "E2"]);
    assert.deepEqual(nomes(await A().empresas.listar({ segmento: "CONTABILIDADE" })), ["E3", "E8", "E4"]);
    assert.deepEqual(nomes(await A().empresas.listar({ uf: "SP", cidade: "Campinas", segmento: "Clínicas" })), ["E7", "E2"]);
    assert.deepEqual(nomes(await A().empresas.listar({ uf: "MG" })), []);
  });
  test("com e sem telefone", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ telefone: "nao" })), ["E3", "E4"]);
    assert.equal((await A().empresas.listar({ telefone: "sim" })).total, 6);
  });
  test("com e sem e-mail", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ email: "sim" })), ["E3", "E6", "E1"]);
    assert.equal((await A().empresas.listar({ email: "nao" })).total, 5);
  });
  test("telefone e e-mail juntos", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ telefone: "sim", email: "sim" })), ["E6", "E1"]);
  });
  test("bloqueio: só bloqueadas e sem bloqueio (a empresa com tudo vazio continua aparecendo)", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ suprimida: "sim" })), ["E6"]);
    const sem = await A().empresas.listar({ suprimida: "nao" });
    assert.equal(sem.total, 7);
    assert.equal(nomes(sem).includes("E4"), true);
    assert.equal(nomes(sem).includes("E6"), false);
  });
  test("busca por nome, domínio, e-mail e cidade; coringas do LIKE são tratados como texto", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ busca: "alfa" })), ["E1"]);
    assert.deepEqual(nomes(await A().empresas.listar({ busca: "epsilon" })), ["E5"]);
    assert.deepEqual(nomes(await A().empresas.listar({ busca: "niter" })), ["E4"]);
    assert.deepEqual(nomes(await A().empresas.listar({ busca: "gama.com" })), ["E3"]);
    assert.equal((await A().empresas.listar({ busca: "%" })).total, 0);
    assert.equal((await A().empresas.listar({ busca: "_" })).total, 0);
  });
  test("busca por parte do CNPJ", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ busca: cnpjDe(1001).slice(0, 12) })).includes("E1"), true);
  });
  test("filtros combinados com ordenação", async () => {
    assert.deepEqual(nomes(await A().empresas.listar({ uf: "SP", telefone: "sim", ordem: "data" })), ["E7", "E6", "E5", "E2", "E1"]);
    assert.deepEqual(nomes(await A().empresas.listar({ campanhaId: c1, uf: "SP", status: "QUALIFICADO" })), ["E6", "E1", "E2"]);
  });
  test("o resumo da API continua existindo", async () => {
    const r = await A().empresas.listar({ campanhaId: c1 });
    assert.deepEqual(r.resumo, { QUALIFICADO: 3, VERIFICAR: 1, PENDENTE: 1, NAO_QUALIFICADO: 1 });
  });
});

describe("lista de empresas: motivo do Verificar", () => {
  test("mostra o critério obrigatório que faltou", async () => {
    const r = await A().empresas.listar({ status: "VERIFICAR" });
    const p = r.itens[0].prospectos[0];
    assert.equal(p.status, "VERIFICAR");
    assert.equal(p.motivo, "Falta: Estado");
    assert.equal(p.pontuacao, 100);
  });
  test("só o Verificar traz motivo", async () => {
    const r = await A().empresas.listar({ campanhaId: c1 });
    for (const e of r.itens) for (const p of e.prospectos) assert.equal(p.motivo !== null, p.status === "VERIFICAR");
  });
  test("regras do texto", () => {
    assert.equal(motivoDoVerificar([{ nome: "Estado", obrigatorio: true, situacao: "DESCONHECIDO" }, { nome: "Porte", obrigatorio: true, situacao: "DESCONHECIDO" }], 50), "Falta: Estado, Porte");
    assert.equal(motivoDoVerificar([{ nome: "Tem equipe", obrigatorio: true, situacao: "NAO_VERIFICADO" }], 50)?.startsWith("Falta: Tem equipe"), true);
    // Opcional desconhecido não é motivo.
    assert.equal(motivoDoVerificar([{ nome: "Porte", obrigatorio: false, situacao: "DESCONHECIDO" }], 50), null);
    // Nada avaliável: não inventa motivo de dado, diz que o perfil não tem o que avaliar.
    assert.equal(typeof motivoDoVerificar([], null), "string");
    assert.equal(motivoDoVerificar(null, 80), null);
  });
});

describe("lista de empresas: paginação", () => {
  test("páginas de 25, sem repetir nem perder empresa, na mesma ordem da lista inteira", async () => {
    const s = sdrDoTenant(tenantP);
    const p1 = await s.empresas.listar({ pagina: 1 });
    const p2 = await s.empresas.listar({ pagina: 2 });
    const p3 = await s.empresas.listar({ pagina: 3 });
    const p4 = await s.empresas.listar({ pagina: 4 });
    assert.deepEqual([p1.itens.length, p2.itens.length, p3.itens.length, p4.itens.length], [25, 25, 10, 0]);
    assert.equal(p1.total, 60);
    const todos = [...p1.itens, ...p2.itens, ...p3.itens].map((e) => e.id);
    assert.equal(new Set(todos).size, 60);

    // A mesma ordem calculada fora do banco: pontuação desc (nulos no fim), depois mais nova, depois id.
    const linhas = await prisma.sdrEmpresa.findMany({ where: { tenantId: tenantP }, include: { prospectos: true } });
    const esperado = linhas
      .map((e) => ({ id: e.id, melhor: e.prospectos[0]?.pontuacao ?? null, criada: e.createdAt.getTime() }))
      .sort((a, b) => (b.melhor ?? -1) - (a.melhor ?? -1) || b.criada - a.criada || (a.id < b.id ? -1 : 1))
      .map((e) => e.id);
    assert.deepEqual(todos, esperado);
  });
  test("a página não carrega mais de 25 empresas nem com filtro", async () => {
    const r = await sdrDoTenant(tenantP).empresas.listar({ campanhaId: undefined, status: "QUALIFICADO", pagina: 1 });
    assert.equal(r.itens.length <= 25, true);
  });
});

describe("painel de indicadores", () => {
  test("totais, com cada empresa em uma situação só", async () => {
    const { indicadores: i } = await A().painel.indicadores();
    assert.equal(i.total, 8);
    assert.equal(i.qualificadas, 4);
    assert.equal(i.verificar, 1);
    assert.equal(i.aguardando, 1);
    assert.equal(i.naoQualificadas, 1);
    assert.equal(i.foraDeCampanha, 1);
    assert.equal(i.qualificadas + i.verificar + i.aguardando + i.naoQualificadas + i.foraDeCampanha, i.total);
  });
  test("a empresa em duas campanhas (Beta) conta uma vez, na melhor situação", async () => {
    const { indicadores: i } = await A().painel.indicadores();
    assert.equal(i.naoQualificadas, 1);
    assert.equal(i.total, 8);
  });
  test("bloqueadas", async () => {
    assert.equal((await A().painel.indicadores()).indicadores.bloqueadas, 1);
  });
  test("dados que faltam", async () => {
    const { indicadores: i } = await A().painel.indicadores();
    assert.equal(i.semCnpj, 2);
    assert.equal(i.semTelefone, 2);
    assert.equal(i.semEmail, 5);
    assert.equal(i.semSite, 4);
    assert.equal(i.semContato, 1);
    assert.equal(i.incompletas, 6);
  });
  test("telefone descartado: empresa contada uma vez, só se segue sem telefone, sem linha rejeitada", async () => {
    // E4 aparece em duas importações; E5 teve o aviso mas tem telefone; as linhas inválidas não têm empresa.
    assert.equal((await A().painel.indicadores()).indicadores.telefoneDescartado, 1);
  });
  test("o aviso que o painel procura é o que a importação grava", () => {
    const r = normalizarTelefone("sem número");
    assert.equal(r.valor, null);
    assert.equal(r.aviso?.startsWith(PREFIXO_AVISO_TELEFONE_DESCARTADO), true);
  });
  test("onde estão as melhores oportunidades", async () => {
    const r = await A().painel.indicadores();
    // Empate em qualificadas: a cidade com mais empresas vem primeiro.
    assert.deepEqual(r.melhoresCidades, [
      { valor: "São Paulo", qualificadas: 2, total: 3 },
      { valor: "Campinas", qualificadas: 2, total: 2 },
    ]);
    assert.deepEqual(r.melhoresSegmentos, [{ valor: "Clínicas", qualificadas: 4, total: 5 }]);
  });
  test("filtro por campanha", async () => {
    const { indicadores: i } = await A().painel.indicadores({ campanhaId: c2 });
    assert.deepEqual([i.total, i.qualificadas, i.naoQualificadas, i.foraDeCampanha], [2, 1, 1, 0]);
  });
  test("filtro por perfil e por UF", async () => {
    assert.equal((await A().painel.indicadores({ icpId: icp2 })).indicadores.total, 2);
    const { indicadores: rj } = await A().painel.indicadores({ uf: "RJ" });
    assert.deepEqual([rj.total, rj.verificar, rj.aguardando, rj.naoQualificadas, rj.qualificadas], [3, 1, 1, 1, 0]);
  });
  test("filtro por cidade e segmento", async () => {
    assert.equal((await A().painel.indicadores({ cidade: "campinas" })).indicadores.total, 2);
    assert.equal((await A().painel.indicadores({ segmento: "Contabilidade" })).indicadores.total, 3);
  });
  test("os números do painel batem com a lista", async () => {
    const { indicadores: i } = await A().painel.indicadores({ uf: "SP" });
    assert.equal((await A().empresas.listar({ uf: "SP" })).total, i.total);
    assert.equal((await A().empresas.listar({ uf: "SP", status: "QUALIFICADO" })).total, i.qualificadas);
    assert.equal((await A().empresas.listar({ uf: "SP", telefone: "nao" })).total, i.semTelefone);
    assert.equal((await A().empresas.listar({ uf: "SP", email: "nao" })).total, i.semEmail);
    assert.equal((await A().empresas.listar({ uf: "SP", suprimida: "sim" })).total, i.bloqueadas);
  });
  test("empresa nova, sem nada, entra como fora de campanha e sem dados", async () => {
    const vazio = await criarTenant("lista-painel-vazio");
    try {
      const antes = (await sdrDoTenant(vazio).painel.indicadores()).indicadores;
      assert.deepEqual([antes.total, antes.qualificadas, antes.semTelefone], [0, 0, 0]);
      await prisma.sdrEmpresa.create({ data: { tenantId: vazio, razaoSocial: "So Nome", chaveNome: "so nome" } });
      const depois = (await sdrDoTenant(vazio).painel.indicadores()).indicadores;
      assert.deepEqual([depois.total, depois.foraDeCampanha, depois.semCnpj, depois.semTelefone, depois.semEmail, depois.semSite, depois.semContato], [1, 1, 1, 1, 1, 1, 1]);
    } finally {
      await prisma.tenant.delete({ where: { id: vazio } });
    }
  });
  test("opções dos filtros", async () => {
    const o = await A().painel.opcoes();
    assert.deepEqual(o.ufs.map((x) => x.valor), ["RJ", "SP"]);
    assert.deepEqual(o.ufs.find((x) => x.valor === "SP"), { valor: "SP", empresas: 5 });
    assert.equal(o.cidades.some((x) => x.valor === "Campinas"), true);
    assert.deepEqual(o.segmentos.map((x) => x.valor).sort(), ["Clínicas", "Contabilidade"]);
  });
});

describe("isolamento entre empresas", () => {
  test("a lista de uma empresa não traz a de outra", async () => {
    const a = nomes(await A().empresas.listar());
    assert.equal(a.includes("OUTRA"), false);
    const b = await sdrDoTenant(tenantB).empresas.listar();
    assert.deepEqual(nomes(b), ["OUTRA"]);
  });
  test("campanha ou perfil de outra empresa não mostra nada", async () => {
    const b = sdrDoTenant(tenantB);
    assert.equal((await b.empresas.listar({ campanhaId: c1 })).total, 0);
    assert.equal((await b.empresas.listar({ icpId: icp1 })).total, 0);
    assert.equal((await b.painel.indicadores({ campanhaId: c1 })).indicadores.total, 0);
  });
  test("o painel de cada empresa conta só as suas", async () => {
    assert.equal((await A().painel.indicadores()).indicadores.total, 8);
    const b = (await sdrDoTenant(tenantB).painel.indicadores()).indicadores;
    assert.deepEqual([b.total, b.qualificadas, b.bloqueadas, b.telefoneDescartado], [1, 1, 0, 0]);
  });
  test("a lista de bloqueio de uma empresa não esconde nem marca a da outra", async () => {
    assert.equal((await sdrDoTenant(tenantB).empresas.listar({ suprimida: "sim" })).total, 0);
  });
  test("as opções de filtro são só da empresa", async () => {
    const o = await sdrDoTenant(tenantB).painel.opcoes();
    assert.deepEqual(o.cidades.map((x) => x.valor), ["São Paulo"]);
    assert.deepEqual(o.ufs, [{ valor: "SP", empresas: 1 }]);
  });
  test("a fachada não aceita tenant vazio", () => {
    assert.throws(() => sdrDoTenant(""));
  });
});

describe("parâmetros da API (esquemas)", () => {
  test("filtros novos válidos", () => {
    assert.equal(filtroEmpresasSchema.safeParse({ uf: "SP", cidade: "Campinas", segmento: "Clínicas", telefone: "sim", email: "nao", ordem: "data", pagina: "2" }).success, true);
  });
  test("ordem, UF, telefone e e-mail inválidos são recusados", () => {
    assert.equal(filtroEmpresasSchema.safeParse({ ordem: "aleatoria" }).success, false);
    assert.equal(filtroEmpresasSchema.safeParse({ uf: "ZZ" }).success, false);
    assert.equal(filtroEmpresasSchema.safeParse({ telefone: "talvez" }).success, false);
    assert.equal(filtroEmpresasSchema.safeParse({ email: "1" }).success, false);
  });
  test("tenantId e parâmetros desconhecidos são recusados", () => {
    assert.equal(filtroEmpresasSchema.safeParse({ tenantId: "outro" }).success, false);
    assert.equal(filtroEmpresasSchema.safeParse({ ordenarPor: "x" }).success, false);
    assert.equal(filtroPainelSchema.safeParse({ tenantId: "outro" }).success, false);
    assert.equal(filtroPainelSchema.safeParse({ status: "QUALIFICADO" }).success, false);
  });
  test("cidade e segmento têm limite de tamanho", () => {
    assert.equal(filtroEmpresasSchema.safeParse({ cidade: "x".repeat(81) }).success, false);
    assert.equal(filtroPainelSchema.safeParse({ segmento: "" }).success, false);
  });
});

describe("rotas do painel e das opções", () => {
  const rotas = ["/api/sdr/painel", "/api/sdr/empresas/opcoes"];

  for (const rota of rotas) {
    test(`${rota}: anônimo vai para o login`, async () => {
      const r = await new Sessao().chamar(rota);
      assert.equal(r.status, 307);
    });
    test(`${rota}: responsável e financeiro leem`, async () => {
      assert.equal((await (await logado(USUARIOS.dono)).chamar(rota)).status, 200);
      assert.equal((await (await logado(USUARIOS.financeiro)).chamar(rota)).status, 200);
    });
    test(`${rota}: atendente e empresa sem o recurso são recusados`, async () => {
      assert.equal((await (await logado(USUARIOS.atendente)).chamar(rota)).status, 403);
      assert.equal((await (await logado(USUARIOS.externo)).chamar(rota)).status, 403);
    });
  }
  test("o painel recusa tenantId e filtro desconhecido", async () => {
    const dono = await logado(USUARIOS.dono);
    assert.equal((await dono.chamar("/api/sdr/painel?tenantId=outro")).status, 400);
    assert.equal((await dono.chamar("/api/sdr/painel?status=QUALIFICADO")).status, 400);
    assert.equal((await dono.chamar("/api/sdr/painel?uf=ZZ")).status, 400);
  });
  test("o painel responde o formato esperado", async () => {
    const dono = await logado(USUARIOS.dono);
    const r = await dono.chamar("/api/sdr/painel");
    const j = (await r.json()) as { indicadores: Record<string, number>; melhoresCidades: unknown[]; melhoresSegmentos: unknown[] };
    assert.equal(typeof j.indicadores.total, "number");
    assert.equal(Array.isArray(j.melhoresCidades), true);
    assert.equal(Array.isArray(j.melhoresSegmentos), true);
  });
  test("a lista recusa ordem inválida, UF inválida e tenantId", async () => {
    const dono = await logado(USUARIOS.dono);
    assert.equal((await dono.chamar("/api/sdr/empresas?ordem=aleatoria")).status, 400);
    assert.equal((await dono.chamar("/api/sdr/empresas?uf=ZZ")).status, 400);
    assert.equal((await dono.chamar("/api/sdr/empresas?tenantId=outro")).status, 400);
    assert.equal((await dono.chamar("/api/sdr/empresas?uf=SP&telefone=sim&ordem=data")).status, 200);
  });
  test("a lista só devolve empresas da sessão", async () => {
    const dono = await logado(USUARIOS.dono);
    const r = (await (await dono.chamar("/api/sdr/empresas")).json()) as { itens: { id: string }[] };
    const outros = new Set(Object.values(id));
    for (const e of r.itens) assert.equal(outros.has(e.id), false);
  });
});
