import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { prisma } from "@dilon-zap/db";
import { ErroSdrCore, concluir, enfileirar, falhar, formatarCnpj, processarImportacao, processarProximoTrabalho, reivindicar, renovarReserva, sdrDoTenant } from "@dilon-zap/sdr-core";
import { SLUGS, USUARIOS } from "../src/semente";
import { BASE, logado, Sessao } from "./ajudantes";
import { cnpjDe, montarCsv, type LinhaCsv } from "./dados";

/**
 * Importação, deduplicação, supressão, fila e worker, contra o banco local.
 * Todos os dados são fictícios; os CNPJs são calculados, não são de empresas reais.
 */

const executar = promisify(execFile);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizRepo = path.resolve(aqui, "../../..");
const autor = { id: "teste", name: "Teste" };

let dilonId = "";
let outraId = "";
let externaId = "";
const sdr = (tenantId: string) => sdrDoTenant(tenantId);

/** Estado do CRM e do WhatsApp antes de tudo: nada daqui pode mexer nele. */
const contar = async () => ({
  contatos: await prisma.contact.count(),
  conversas: await prisma.conversation.count(),
  mensagens: await prisma.message.count(),
  agendadas: await prisma.scheduledMessage.count(),
  sessoes: await prisma.whatsAppSession.count(),
  bloqueios: await prisma.contactBlock.count(),
  reacoes: await prisma.messageReaction.count(),
  atendimentos: await prisma.atendimento.count(),
});
let antes: Awaited<ReturnType<typeof contar>>;

let seq = 0;
const nome = (p: string) => `${p} ${++seq}`;

async function criarCampanha(tenantId: string, rotulo: string, icp: Partial<{ ufs: string[]; portes: string[]; segmentos: string[]; cnaes: string[] }> = {}) {
  const perfil = await prisma.sdrIcp.create({
    data: {
      tenantId,
      nome: nome(`ICP ${rotulo}`),
      segmentos: icp.segmentos ?? ["Clínicas"],
      cnaes: icp.cnaes ?? [],
      ufs: icp.ufs ?? ["SP"],
      portes: icp.portes ?? ["ME"],
      criterios: [{ nome: "Atende pelo WhatsApp", peso: 5, obrigatorio: false }],
    },
  });
  const campanha = await prisma.sdrCampanha.create({ data: { tenantId, nome: nome(`Campanha ${rotulo}`), icpId: perfil.id } });
  return { perfil, campanha };
}

/** Roda o worker até a fila esvaziar. Mesmo código do apps/sdr-worker, sem o laço de sono. */
async function drenar(extras: { lote?: number; linhasPorExecucao?: number; esperaMs?: (t: number) => number } = {}) {
  const ciclos = [];
  for (let i = 0; i < 200; i++) {
    const c = await processarProximoTrabalho({ workerId: "worker-de-teste", esperaMs: () => 0, ...extras });
    if (!c) break;
    ciclos.push(c);
  }
  return ciclos;
}

const importar = (tenantId: string, linhas: LinhaCsv[], extras: { campanhaId?: string; chave?: string } = {}) =>
  sdr(tenantId).importacoes.criar(autor, { nomeArquivo: "teste.csv", conteudo: montarCsv(linhas), ...extras });

const linhasDe = (importacaoId: string) => prisma.sdrImportacaoLinha.findMany({ where: { importacaoId }, orderBy: { numero: "asc" } });
const empresaPorCnpj = (tenantId: string, cnpj: string) => prisma.sdrEmpresa.findUnique({ where: { tenantId_cnpj: { tenantId, cnpj } } });
const passado = (ms = 60_000) => new Date(Date.now() - ms);
const futuro = (ms = 600_000) => new Date(Date.now() + ms);
const dez = (inicio: number, quantas: number, extra: Partial<LinhaCsv> = {}): LinhaCsv[] =>
  Array.from({ length: quantas }, (_, i) => ({ cnpj: cnpjDe(inicio + i), razao: `Empresa de Teste ${inicio + i}`, uf: "SP", ...extra }));

before(async () => {
  const empresas = await prisma.tenant.findMany({ where: { slug: { in: Object.values(SLUGS) } }, select: { id: true, slug: true } });
  dilonId = empresas.find((e) => e.slug === SLUGS.dilon)!.id;
  outraId = empresas.find((e) => e.slug === SLUGS.outra)!.id;
  externaId = empresas.find((e) => e.slug === SLUGS.externa)!.id;
  // Trabalhos de outros arquivos de teste não podem se misturar com estes.
  await drenar();
  antes = await contar();
});

after(async () => {
  await prisma.$disconnect();
});

describe("importação válida", () => {
  test("cria as empresas, normaliza os campos e qualifica pelo ICP da campanha", async () => {
    const { campanha, perfil } = await criarCampanha(dilonId, "válida");
    const { importacao, duplicada } = await importar(
      dilonId,
      [
        { cnpj: cnpjDe(1001), razao: "CLÍNICA UM LTDA", telefone: "(11) 3333-4444", email: "UM@clinicaum.com.br", site: "www.clinicaum.com.br", uf: "SP", cidade: "SAO PAULO", segmento: "Clínica médica", porte: "ME" },
        { cnpj: cnpjDe(1002), razao: "Clínica Dois", uf: "RJ", porte: "ME", segmento: "Clínicas" },
        { cnpj: cnpjDe(1003), razao: "Clínica Três", porte: "ME", segmento: "Clínicas" },
      ],
      { campanhaId: campanha.id }
    );
    assert.equal(duplicada, false);
    assert.equal(importacao.status, "PENDENTE");
    assert.equal(importacao.pendentes, 3);

    const ciclos = await drenar();
    assert.equal(ciclos.filter((c) => c.tipo === "IMPORTAR" && c.resultado === "concluido").length, 1);

    const imp = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.deepEqual(
      { status: imp.status, total: imp.totalLinhas, importadas: imp.importadas, invalidas: imp.invalidas, falhas: imp.falhas, pendentes: imp.pendentes },
      { status: "CONCLUIDA", total: 3, importadas: 3, invalidas: 0, falhas: 0, pendentes: 0 }
    );
    assert.notEqual(imp.iniciadaEm, null);
    assert.notEqual(imp.concluidaEm, null);

    const um = (await empresaPorCnpj(dilonId, cnpjDe(1001)))!;
    assert.equal(um.razaoSocial, "Clínica Um LTDA");
    assert.equal(um.telefone, "551133334444");
    assert.equal(um.email, "um@clinicaum.com.br");
    assert.equal(um.site, "https://clinicaum.com.br");
    assert.equal(um.dominio, "clinicaum.com.br");
    assert.equal(um.cidade, "Sao Paulo");
    // O que veio do CSV fica marcado como informado, não verificado.
    assert.equal(um.origem, "CSV");
    assert.equal(um.verificadaEm, null);
    assert.equal(um.importacaoOrigemId, importacao.id);

    const prospecto = (cnpj: string) =>
      prisma.sdrProspecto.findFirstOrThrow({ where: { tenantId: dilonId, campanhaId: campanha.id, empresa: { cnpj } } });
    const p1 = await prospecto(cnpjDe(1001));
    assert.equal(p1.status, "QUALIFICADO");
    assert.equal(p1.pontuacao, 100);
    assert.equal(p1.icpId, perfil.id);
    assert.notEqual(p1.qualificadoEm, null);
    const criterios = p1.criterios as { chave: string; situacao: string; justificativa: string }[];
    assert.equal(criterios.find((c) => c.chave === "uf")?.situacao, "ATENDIDO");
    assert.equal(criterios.find((c) => c.chave === "personalizado:0")?.situacao, "NAO_VERIFICADO");
    assert.equal((await prospecto(cnpjDe(1002))).status, "NAO_QUALIFICADO");
    assert.equal((await prospecto(cnpjDe(1003))).status, "VERIFICAR");
  });
});

describe("CSV inválido e CNPJ inválido", () => {
  const status = (n: number) => (e: unknown) => e instanceof ErroSdrCore && e.status === n;

  test("arquivo vazio, só cabeçalho e aspas abertas são recusados e nada é gravado", async () => {
    const totais = async () => [await prisma.sdrImportacao.count(), await prisma.sdrImportacaoLinha.count(), await prisma.sdrTrabalho.count()];
    const antesDeTudo = await totais();
    for (const conteudo of ["", "CNPJ;Razão Social\n", 'CNPJ;Razão Social\n1;"aberta\n']) {
      await assert.rejects(sdr(dilonId).importacoes.criar(autor, { nomeArquivo: "x.csv", conteudo }), status(400));
    }
    assert.deepEqual(await totais(), antesDeTudo);
  });
  test("arquivo sem coluna de nome e mapeamento que não existe são recusados", async () => {
    await assert.rejects(sdr(dilonId).importacoes.criar(autor, { nomeArquivo: "x.csv", conteudo: "CNPJ;Telefone\n1;2\n" }), /razão social ou do nome fantasia/);
    await assert.rejects(
      sdr(dilonId).importacoes.criar(autor, { nomeArquivo: "x.csv", conteudo: montarCsv(dez(9000, 1)), mapeamento: { razaoSocial: "Coluna que não existe" } }),
      /não existe no arquivo/
    );
  });
  test("a prévia devolve o problema em vez de estourar", async () => {
    const p = await sdr(dilonId).importacoes.previa("CNPJ;Telefone\n1;2\n");
    assert.equal(p.problemas.length > 0, true);
    assert.equal(p.totais.invalidas, 0);
  });
  test("campanha de outra organização é recusada", async () => {
    const { campanha } = await criarCampanha(outraId, "alheia");
    await assert.rejects(importar(dilonId, dez(9100, 1), { campanhaId: campanha.id }), status(404));
  });
  test("CNPJ inválido rejeita só a linha e não vira empresa", async () => {
    const { importacao } = await importar(dilonId, [
      { cnpj: cnpjDe(2001), razao: "Empresa Boa A" },
      { cnpj: "11222333000199", razao: "Empresa Cnpj Ruim" },
      { cnpj: "123", razao: "Empresa Cnpj Curto" },
      { cnpj: cnpjDe(2002), razao: "" },
      { cnpj: cnpjDe(2003), razao: "Empresa Boa B" },
    ]);
    await drenar();
    const linhas = await linhasDe(importacao.id);
    assert.deepEqual(linhas.map((l) => l.status), ["IMPORTADA", "INVALIDA", "INVALIDA", "INVALIDA", "IMPORTADA"]);
    assert.match(linhas[1].erros.join(), /CNPJ inválido/);
    assert.match(linhas[3].erros.join(), /razão social ou o nome fantasia/);
    assert.equal(linhas[1].normalizado, null);
    assert.equal(linhas[1].empresaId, null);
    assert.equal(await prisma.sdrEmpresa.count({ where: { tenantId: dilonId, razaoSocial: { in: ["Empresa Cnpj Ruim", "Empresa Cnpj Curto"] } } }), 0);
  });
});

describe("importação parcial e prévia", () => {
  test("valida o que dá, rejeita o resto e fecha a importação como concluída", async () => {
    const { importacao } = await importar(dilonId, [
      { cnpj: cnpjDe(3001), razao: "Parcial A" },
      { cnpj: cnpjDe(3002), razao: "Parcial B" },
      { cnpj: "000", razao: "Parcial Ruim" },
      { cnpj: cnpjDe(3004), razao: "" },
      { cnpj: cnpjDe(3001), razao: "Parcial A repetida" },
    ]);
    await drenar();
    const imp = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.deepEqual(
      { status: imp.status, importadas: imp.importadas, invalidas: imp.invalidas, duplicadas: imp.duplicadas, atualizadas: imp.atualizadas, pendentes: imp.pendentes },
      { status: "CONCLUIDA", importadas: 2, invalidas: 2, duplicadas: 1, atualizadas: 0, pendentes: 0 }
    );
  });
  test("a prévia conta o que o worker depois faz e não grava nada", async () => {
    const linhas: LinhaCsv[] = [
      ...dez(3100, 3),
      { cnpj: formatarCnpj(cnpjDe(3100)), razao: "Repetida no arquivo" },
      { cnpj: cnpjDe(3001), razao: "Já existe na base" },
      { cnpj: "999", razao: "Cnpj curto" },
      { cnpj: cnpjDe(3105), razao: "" },
    ];
    const antesDaPrevia = [await prisma.sdrEmpresa.count(), await prisma.sdrImportacao.count(), await prisma.sdrImportacaoLinha.count(), await prisma.sdrTrabalho.count()];
    const p = await sdr(dilonId).importacoes.previa(montarCsv(linhas));
    assert.deepEqual([await prisma.sdrEmpresa.count(), await prisma.sdrImportacao.count(), await prisma.sdrImportacaoLinha.count(), await prisma.sdrTrabalho.count()], antesDaPrevia);
    assert.deepEqual(
      { novas: p.totais.novas, duplicadas: p.totais.duplicadas, invalidas: p.totais.invalidas, linhas: p.totais.linhas },
      { novas: 3, duplicadas: 2, invalidas: 2, linhas: 7 }
    );
    assert.equal(p.invalidas.length, 2);
    assert.equal(p.duplicadas.some((d) => d.noArquivo), true);

    const { importacao } = await importar(dilonId, linhas);
    await drenar();
    const imp = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.deepEqual({ importadas: imp.importadas, duplicadas: imp.duplicadas, invalidas: imp.invalidas }, { importadas: 3, duplicadas: 2, invalidas: 2 });
  });
  test("avisa que o arquivo já foi importado", async () => {
    const conteudo = montarCsv(dez(3200, 2));
    assert.equal((await sdr(dilonId).importacoes.previa(conteudo)).arquivoJaImportado, null);
    await sdr(dilonId).importacoes.criar(autor, { nomeArquivo: "a.csv", conteudo });
    assert.notEqual((await sdr(dilonId).importacoes.previa(conteudo)).arquivoJaImportado, null);
    await drenar();
  });
});

describe("deduplicação", () => {
  test("CNPJ primeiro, depois site, depois nome e estado; preenche vazios e nunca sobrescreve", async () => {
    const { importacao: i1 } = await importar(dilonId, [
      { cnpj: cnpjDe(4001), razao: "Rede Alfa", site: "alfa.com.br", uf: "SP" },
      { razao: "Loja Beta", uf: "MG", cidade: "Belo Horizonte" },
    ]);
    await drenar();
    const alfa = (await empresaPorCnpj(dilonId, cnpjDe(4001)))!;
    const beta = (await prisma.sdrEmpresa.findFirstOrThrow({ where: { tenantId: dilonId, razaoSocial: "Loja Beta" } }))!;
    assert.equal(beta.cnpj, null);

    const { importacao: i2 } = await importar(dilonId, [
      { cnpj: formatarCnpj(cnpjDe(4001)), razao: "REDE ALFA LTDA", telefone: "(11) 3333-4444", uf: "RJ" }, // mesmo CNPJ, com máscara
      { cnpj: cnpjDe(4002), razao: "LOJA BETA LTDA", uf: "MG", site: "beta.com.br" }, // sem CNPJ na base: acha por nome e UF
      { cnpj: cnpjDe(4003), razao: "Rede Alfa Filial", site: "alfa.com.br", uf: "SP" }, // outro CNPJ: é outra empresa
      { razao: "Alfa Sem Cnpj", site: "https://www.alfa.com.br/contato" }, // sem CNPJ: acha pelo site
    ]);
    await drenar();
    const l = await linhasDe(i2.id);
    assert.deepEqual(l.map((x) => x.status), ["ATUALIZADA", "ATUALIZADA", "IMPORTADA", "DUPLICADA"]);
    assert.equal(l[0].duplicadaPor, "CNPJ|BASE");
    assert.equal(l[1].duplicadaPor, "NOME_UF|BASE");
    assert.equal(l[2].duplicadaPor, null);
    assert.match(l[3].duplicadaPor ?? "", /^SITE\|BASE$/);

    // Preencheu o vazio...
    const alfaDepois = (await empresaPorCnpj(dilonId, cnpjDe(4001)))!;
    assert.equal(alfaDepois.telefone, "551133334444");
    assert.deepEqual((l[0].mudancas as { campo: string }[]).map((m) => m.campo), ["telefone"]);
    // ...e não sobrescreveu o que já existia, só registrou o conflito.
    assert.equal(alfaDepois.razaoSocial, alfa.razaoSocial);
    assert.equal(alfaDepois.uf, "SP");
    const conflitos = (l[0].conflitos as { campo: string; existente: string; arquivo: string }[]).map((c) => c.campo).sort();
    assert.deepEqual(conflitos, ["razaoSocial", "uf"]);
    // O CNPJ chegou à empresa que não tinha.
    const betaDepois = await prisma.sdrEmpresa.findUniqueOrThrow({ where: { id: beta.id } });
    assert.equal(betaDepois.cnpj, cnpjDe(4002));
    assert.equal(betaDepois.dominio, "beta.com.br");
    // Filial com site igual e CNPJ diferente é empresa própria.
    const filial = (await empresaPorCnpj(dilonId, cnpjDe(4003)))!;
    assert.notEqual(filial.id, alfa.id);
    assert.equal(await prisma.sdrEmpresa.count({ where: { tenantId: dilonId, dominio: "alfa.com.br" } }), 2);
    void i1;
  });
  test("repetida no próprio arquivo, mesmo com CNPJ formatado de outro jeito", async () => {
    const { importacao } = await importar(dilonId, [
      { cnpj: cnpjDe(4101), razao: "Duplicada Interna" },
      { cnpj: formatarCnpj(cnpjDe(4101)), razao: "Duplicada Interna", telefone: "(21) 98888-7777" },
      { cnpj: cnpjDe(4101), razao: "Duplicada Interna", telefone: "(31) 98888-7777" },
    ]);
    await drenar();
    const l = await linhasDe(importacao.id);
    assert.deepEqual(l.map((x) => x.status), ["IMPORTADA", "ATUALIZADA", "DUPLICADA"]);
    assert.equal(l[1].duplicadaPor, "CNPJ|ARQUIVO");
    assert.equal(await prisma.sdrEmpresa.count({ where: { tenantId: dilonId, cnpj: cnpjDe(4101) } }), 1);
    // A segunda linha preencheu o telefone; a terceira trouxe outro e só virou conflito.
    assert.equal((await empresaPorCnpj(dilonId, cnpjDe(4101)))!.telefone, "5521988887777");
    assert.equal((l[2].conflitos as { campo: string }[])[0].campo, "telefone");
  });
  test("nome e estado iguais com cidades diferentes são empresas diferentes", async () => {
    const { importacao } = await importar(dilonId, [
      { razao: "Padaria Central", uf: "SP", cidade: "Campinas" },
      { razao: "PADARIA CENTRAL LTDA", uf: "SP", cidade: "Santos" },
      { razao: "Padaria Central", uf: "SP", cidade: "campinas" },
      { razao: "Padaria Central" },
    ]);
    await drenar();
    assert.deepEqual((await linhasDe(importacao.id)).map((x) => x.status), ["IMPORTADA", "IMPORTADA", "DUPLICADA", "IMPORTADA"]);
  });
});

describe("idempotência", () => {
  test("a mesma chave devolve a mesma importação, com um só trabalho na fila", async () => {
    const chave = `chave-idempotente-${Date.now()}`;
    const [a, b] = await Promise.all([importar(dilonId, dez(5001, 2), { chave }), importar(dilonId, dez(5001, 2), { chave })]);
    assert.equal(a.importacao.id, b.importacao.id);
    assert.equal([a.duplicada, b.duplicada].filter(Boolean).length, 1);
    const c = await importar(dilonId, dez(5001, 2), { chave });
    assert.equal(c.duplicada, true);
    assert.equal(await prisma.sdrImportacao.count({ where: { tenantId: dilonId, chave } }), 1);
    assert.equal(await prisma.sdrTrabalho.count({ where: { tenantId: dilonId, chave: { startsWith: `importar:${a.importacao.id}:` } } }), 1);
    await drenar();
  });
  test("o mesmo trabalho não entra duas vezes na fila", async () => {
    const chave = `chave-fila-${Date.now()}`;
    const x = await enfileirar(dilonId, "QUALIFICAR", chave, { campanhaId: "x" });
    const y = await enfileirar(dilonId, "QUALIFICAR", chave, { campanhaId: "x" });
    assert.equal(x.criado, true);
    assert.equal(y.criado, false);
    assert.equal(y.trabalho.id, x.trabalho.id);
    await prisma.sdrTrabalho.delete({ where: { id: x.trabalho.id } });
  });
  test("importar o mesmo arquivo de novo não duplica nem altera nada", async () => {
    const { campanha } = await criarCampanha(dilonId, "idem");
    const linhas = dez(5100, 4, { telefone: "(11) 3333-4444" });
    const { importacao: primeira } = await importar(dilonId, linhas, { campanhaId: campanha.id });
    await drenar();
    const empresas = await prisma.sdrEmpresa.findMany({ where: { tenantId: dilonId, cnpj: { in: linhas.map((l) => l.cnpj!) } }, orderBy: { cnpj: "asc" } });
    const prospectos = await prisma.sdrProspecto.findMany({ where: { campanhaId: campanha.id }, orderBy: { empresaId: "asc" } });

    const { importacao: segunda } = await importar(dilonId, linhas, { campanhaId: campanha.id });
    await drenar();
    assert.deepEqual((await linhasDe(segunda.id)).map((l) => l.status), ["DUPLICADA", "DUPLICADA", "DUPLICADA", "DUPLICADA"]);
    assert.equal((await linhasDe(segunda.id)).every((l) => l.mudancas === null), true);
    const depois = await prisma.sdrEmpresa.findMany({ where: { tenantId: dilonId, cnpj: { in: linhas.map((l) => l.cnpj!) } }, orderBy: { cnpj: "asc" } });
    assert.deepEqual(depois.map((e) => [e.id, e.updatedAt.getTime()]), empresas.map((e) => [e.id, e.updatedAt.getTime()]));
    const prospectosDepois = await prisma.sdrProspecto.findMany({ where: { campanhaId: campanha.id }, orderBy: { empresaId: "asc" } });
    assert.deepEqual(prospectosDepois.map((p) => [p.id, p.status, p.pontuacao]), prospectos.map((p) => [p.id, p.status, p.pontuacao]));
    void primeira;
  });
  test("rodar de novo uma importação já concluída não processa nada", async () => {
    const { importacao } = await importar(dilonId, dez(5200, 3));
    await drenar();
    const antesDeNovo = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    const r = await processarImportacao(dilonId, importacao.id, { renovar: async () => true });
    assert.deepEqual(r, { concluido: true, processadas: 0 });
    const depois = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.deepEqual([depois.importadas, depois.duplicadas, depois.status], [antesDeNovo.importadas, antesDeNovo.duplicadas, antesDeNovo.status]);
  });
});

describe("reprocessamento", () => {
  test("refaz só as linhas que falharam e respeita o limite de tentativas da linha", async () => {
    const { importacao } = await importar(dilonId, dez(6001, 4));
    await drenar();
    const linhas = await linhasDe(importacao.id);
    const [l1, l2, l3, l4] = linhas;
    // Simula duas falhas antes do commit: a empresa não chegou a existir.
    for (const [l, tentativas] of [[l2, 1], [l3, 3]] as const) {
      await prisma.sdrEmpresa.delete({ where: { id: l.empresaId! } });
      await prisma.sdrImportacaoLinha.update({ where: { id: l.id }, data: { status: "FALHOU", empresaId: null, tentativas, erroProcessamento: "erro simulado" } });
    }
    await prisma.sdrImportacao.update({ where: { id: importacao.id }, data: { status: "CONCLUIDA_COM_ERROS" } });

    const r1 = await sdr(dilonId).importacoes.reprocessar(importacao.id);
    assert.deepEqual({ liberadas: r1.liberadas, pendentes: r1.pendentes, jaNaFila: r1.jaNaFila }, { liberadas: 1, pendentes: 1, jaNaFila: false });
    // Segundo clique, com a primeira ainda na fila: não cria outro trabalho.
    const r2 = await sdr(dilonId).importacoes.reprocessar(importacao.id);
    assert.equal(r2.jaNaFila, true);
    assert.equal(r2.trabalhoId, r1.trabalhoId);

    await drenar();
    const depois = await linhasDe(importacao.id);
    assert.deepEqual(depois.map((l) => l.status), ["IMPORTADA", "IMPORTADA", "FALHOU", "IMPORTADA"]);
    assert.equal(depois[2].tentativas, 3); // chegou ao limite: não é liberada de novo
    // As linhas boas não foram tocadas.
    assert.equal(depois[0].processadaEm?.getTime(), l1.processadaEm?.getTime());
    assert.equal(depois[3].empresaId, l4.empresaId);
    const imp = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.deepEqual({ status: imp.status, falhas: imp.falhas, importadas: imp.importadas }, { status: "CONCLUIDA_COM_ERROS", falhas: 1, importadas: 3 });
  });
  test("sem nada pendente, não cria trabalho", async () => {
    const { importacao } = await importar(dilonId, dez(6100, 2));
    await drenar();
    const r = await sdr(dilonId).importacoes.reprocessar(importacao.id);
    assert.deepEqual({ trabalhoId: r.trabalhoId, pendentes: r.pendentes, jaNaFila: r.jaNaFila }, { trabalhoId: null, pendentes: 0, jaNaFila: false });
  });
});

describe("supressão", () => {
  test("empresa na lista é registrada, mas não entra em campanha nem é qualificada", async () => {
    const s = sdr(dilonId).supressoes;
    await s.criar({ tipo: "CNPJ", valor: formatarCnpj(cnpjDe(7001)), motivo: "EMPRESA_BLOQUEADA" }, autor);
    await s.criar({ tipo: "DOMINIO", valor: "https://www.bloqueada.com.br/x", motivo: "OPOSICAO" }, autor);
    await s.criar({ tipo: "EMAIL", valor: "NAO@quero.com", motivo: "SOLICITOU_NAO_CONTATO" }, autor);
    await s.criar({ tipo: "TELEFONE", valor: "(11) 98888-0000", motivo: "RESTRICAO" }, autor);
    assert.deepEqual((await s.listar()).map((x) => x.valor).sort(), ["5511988880000", "bloqueada.com.br", "nao@quero.com", cnpjDe(7001)].sort());

    const { campanha } = await criarCampanha(dilonId, "supressão");
    const { importacao } = await importar(
      dilonId,
      [
        { cnpj: cnpjDe(7001), razao: "Bloqueada Por Cnpj", uf: "SP", porte: "ME", segmento: "Clínicas" },
        { cnpj: cnpjDe(7002), razao: "Bloqueada Por Site", site: "loja.bloqueada.com.br", uf: "SP", porte: "ME", segmento: "Clínicas" },
        { cnpj: cnpjDe(7003), razao: "Bloqueada Por Email", email: "nao@quero.com", uf: "SP", porte: "ME", segmento: "Clínicas" },
        { cnpj: cnpjDe(7004), razao: "Bloqueada Por Telefone", telefone: "(11) 98888-0000", uf: "SP", porte: "ME", segmento: "Clínicas" },
        { cnpj: cnpjDe(7005), razao: "Livre", uf: "SP", porte: "ME", segmento: "Clínicas" },
      ],
      { campanhaId: campanha.id }
    );
    await drenar();
    const l = await linhasDe(importacao.id);
    // loja.bloqueada.com.br é subdomínio: só bate o domínio exato. O site da linha 2 fica livre.
    assert.deepEqual(l.map((x) => x.suprimida), [true, false, true, true, false]);
    const prospectosDaCampanha = await prisma.sdrProspecto.findMany({ where: { campanhaId: campanha.id }, include: { empresa: { select: { cnpj: true } } } });
    assert.deepEqual(prospectosDaCampanha.map((p) => p.empresa.cnpj).sort(), [cnpjDe(7002), cnpjDe(7005)].sort());
    // As empresas bloqueadas existem (dá para ver por que foram bloqueadas).
    assert.notEqual(await empresaPorCnpj(dilonId, cnpjDe(7001)), null);
  });
  test("a consulta que toda etapa de contato deve fazer", async () => {
    const bloqueada = (await empresaPorCnpj(dilonId, cnpjDe(7001)))!;
    const livre = (await empresaPorCnpj(dilonId, cnpjDe(7005)))!;
    const r = await sdr(dilonId).supressoes.podeProspectar(bloqueada.id);
    assert.equal(r.permitido, false);
    assert.equal(r.motivos[0].motivo, "EMPRESA_BLOQUEADA");
    assert.equal((await sdr(dilonId).supressoes.podeProspectar(livre.id)).permitido, true);
    await assert.rejects(sdr(outraId).supressoes.podeProspectar(bloqueada.id), /não encontrada/);
  });
  test("domínio exato bloqueia site e e-mail da empresa", async () => {
    const { importacao } = await importar(dilonId, [
      { cnpj: cnpjDe(7101), razao: "Por Dominio Site", site: "bloqueada.com.br" },
      { cnpj: cnpjDe(7102), razao: "Por Dominio Email", email: "contato@bloqueada.com.br" },
    ]);
    await drenar();
    assert.deepEqual((await linhasDe(importacao.id)).map((x) => x.suprimida), [true, true]);
  });
  test("a lista mostra quem está bloqueada, e quem foi bloqueada depois também", async () => {
    const bloqueadas = await sdr(dilonId).empresas.listar({ suprimida: "sim", busca: "Bloqueada Por" });
    assert.deepEqual(bloqueadas.itens.map((e) => e.cnpj).sort(), [cnpjDe(7001), cnpjDe(7003), cnpjDe(7004)].sort());
    assert.equal(bloqueadas.itens.every((e) => e.bloqueios.length > 0), true);
    const livres = await sdr(dilonId).empresas.listar({ suprimida: "nao", busca: "Livre" });
    assert.equal(livres.itens.some((e) => e.cnpj === cnpjDe(7005)), true);

    // Bloqueio posterior vale na hora para a consulta, mesmo com o prospecto já criado.
    const livre = (await empresaPorCnpj(dilonId, cnpjDe(7005)))!;
    const s = await sdr(dilonId).supressoes.criar({ tipo: "CNPJ", valor: cnpjDe(7005), motivo: "OPOSICAO", observacao: "pediu por e-mail" }, autor);
    assert.equal((await sdr(dilonId).supressoes.podeProspectar(livre.id)).permitido, false);
    assert.equal((await sdr(dilonId).empresas.obter(livre.id)).bloqueios.length, 1);
    await sdr(dilonId).supressoes.remover(s.id);
    assert.equal((await sdr(dilonId).supressoes.podeProspectar(livre.id)).permitido, true);
  });
  test("associar a uma campanha pula as bloqueadas", async () => {
    const { campanha } = await criarCampanha(dilonId, "associação");
    const bloqueada = (await empresaPorCnpj(dilonId, cnpjDe(7001)))!;
    const livre = (await empresaPorCnpj(dilonId, cnpjDe(7005)))!;
    const r = await sdr(dilonId).empresas.associarACampanha(campanha.id, [bloqueada.id, livre.id]);
    assert.equal(r.empresas, 2);
    await drenar();
    const p = await prisma.sdrProspecto.findMany({ where: { campanhaId: campanha.id } });
    assert.deepEqual(p.map((x) => x.empresaId), [livre.id]);
    // Repetir a mesma seleção não cria outro trabalho.
    assert.equal((await sdr(dilonId).empresas.associarACampanha(campanha.id, [livre.id, bloqueada.id])).jaProcessadoOuNaFila, true);
  });
  test("recusa duplicata, valor inválido e provedor de e-mail como domínio", async () => {
    const s = sdr(dilonId).supressoes;
    const repetida = s.criar({ tipo: "CNPJ", valor: cnpjDe(7001), motivo: "OPOSICAO" }, autor);
    await assert.rejects(repetida, (e: unknown) => e instanceof ErroSdrCore && e.status === 409);
    await assert.rejects(s.criar({ tipo: "CNPJ", valor: "123", motivo: "OPOSICAO" }, autor), /CNPJ/);
    await assert.rejects(s.criar({ tipo: "DOMINIO", valor: "gmail.com", motivo: "OPOSICAO" }, autor), /provedor/);
    await assert.rejects(s.remover("id-que-nao-existe"), (e: unknown) => e instanceof ErroSdrCore && e.status === 404);
  });
  test("a supressão de uma organização não bloqueia a outra", async () => {
    const { importacao } = await importar(outraId, [{ cnpj: cnpjDe(7001), razao: "Mesmo Cnpj Em Outra Organização", site: "bloqueada.com.br" }]);
    await drenar();
    assert.deepEqual((await linhasDe(importacao.id)).map((l) => l.suprimida), [false]);
    assert.equal((await sdr(outraId).supressoes.listar()).length, 0);
  });
});

describe("recuperação de trabalhos interrompidos", () => {
  test("importação grande volta à fila sem gastar tentativa e termina sem duplicar", async () => {
    const { campanha } = await criarCampanha(dilonId, "volume");
    const { importacao } = await importar(dilonId, dez(8001, 250, { porte: "ME", segmento: "Clínicas" }), { campanhaId: campanha.id });

    // Limite por execução: o worker faz 100 linhas e devolve o trabalho.
    const c1 = await processarProximoTrabalho({ workerId: "w1", lote: 50, linhasPorExecucao: 100 });
    assert.deepEqual({ resultado: c1?.resultado, processadas: c1?.processadas }, { resultado: "devolvido", processadas: 100 });
    const job = await prisma.sdrTrabalho.findFirstOrThrow({ where: { tenantId: dilonId, chave: { startsWith: `importar:${importacao.id}:` } } });
    assert.equal(job.status, "PENDENTE");
    assert.equal(job.tentativas, 0); // a tentativa foi devolvida
    const meio = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.deepEqual({ status: meio.status, importadas: meio.importadas, pendentes: meio.pendentes }, { status: "PROCESSANDO", importadas: 100, pendentes: 150 });

    // O worker morre no meio: o trabalho fica reservado por alguém que não responde mais.
    await prisma.sdrTrabalho.update({ where: { id: job.id }, data: { status: "EM_PROCESSAMENTO", bloqueadoPor: "worker-morto", leaseAte: futuro(), tentativas: 1 } });
    assert.equal(await processarProximoTrabalho({ workerId: "w2" }), null); // reserva ainda vale: ninguém toma
    assert.equal((await prisma.sdrTrabalho.findUniqueOrThrow({ where: { id: job.id } })).bloqueadoPor, "worker-morto");

    // Reserva vencida: outro worker retoma de onde parou.
    await prisma.sdrTrabalho.update({ where: { id: job.id }, data: { leaseAte: passado() } });
    const c2 = await processarProximoTrabalho({ workerId: "w2", lote: 50 });
    assert.deepEqual({ resultado: c2?.resultado, tentativas: c2?.tentativas, processadas: c2?.processadas }, { resultado: "concluido", tentativas: 2, processadas: 150 });

    const fim = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.deepEqual({ status: fim.status, importadas: fim.importadas, pendentes: fim.pendentes }, { status: "CONCLUIDA", importadas: 250, pendentes: 0 });
    assert.equal(await prisma.sdrEmpresa.count({ where: { tenantId: dilonId, importacaoOrigemId: importacao.id } }), 250);
    assert.equal(await prisma.sdrProspecto.count({ where: { campanhaId: campanha.id } }), 250);
    assert.equal((await prisma.sdrTrabalho.findUniqueOrThrow({ where: { id: job.id } })).status, "CONCLUIDO");
  });
  test("dois workers ao mesmo tempo: só um fica com o trabalho", async () => {
    const { trabalho } = await enfileirar(dilonId, "QUALIFICAR", `concorrencia-${Date.now()}`, { campanhaId: "x" });
    const ganhos = await Promise.all(Array.from({ length: 6 }, (_, i) => reivindicar(`w-${i}`)));
    const quem = ganhos.filter((g) => g !== null);
    assert.equal(quem.length, 1);
    assert.equal(quem[0]!.id, trabalho.id);
    assert.equal(quem[0]!.tentativas, 1);
    await prisma.sdrTrabalho.delete({ where: { id: trabalho.id } });
  });
  test("quem perdeu a reserva não consegue concluir, falhar nem renovar", async () => {
    const { trabalho } = await enfileirar(dilonId, "QUALIFICAR", `reserva-${Date.now()}`, { campanhaId: "x" });
    const a = (await reivindicar("worker-a"))!;
    assert.equal(a.id, trabalho.id);
    await prisma.sdrTrabalho.update({ where: { id: a.id }, data: { leaseAte: passado() } });
    const b = (await reivindicar("worker-b"))!;
    assert.equal(b.id, a.id);
    assert.equal(b.tentativas, 2);
    assert.equal(await renovarReserva(a.id, "worker-a"), false);
    assert.equal(await concluir(a.id, "worker-a"), false);
    assert.equal(await falhar(a.id, "worker-a", "tarde demais", 0), "PERDIDO");
    assert.equal(await renovarReserva(b.id, "worker-b"), true);
    assert.equal(await concluir(b.id, "worker-b"), true);
    await prisma.sdrTrabalho.delete({ where: { id: a.id } });
  });
});

describe("limite de tentativas", () => {
  test("falha, tenta de novo e desiste na terceira, sem ser reivindicado outra vez", async () => {
    const { trabalho } = await enfileirar(dilonId, "IMPORTAR", `falha-${Date.now()}`, { importacaoId: "nao-existe" });
    const resultados: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await processarProximoTrabalho({ workerId: "w", esperaMs: () => 0 });
      if (!c) break;
      resultados.push(`${c.resultado}:${c.tentativas}`);
    }
    assert.deepEqual(resultados, ["reagendado:1", "reagendado:2", "falhou:3"]);
    const t = await prisma.sdrTrabalho.findUniqueOrThrow({ where: { id: trabalho.id } });
    assert.deepEqual({ status: t.status, tentativas: t.tentativas, max: t.maxTentativas }, { status: "FALHOU", tentativas: 3, max: 3 });
    assert.match(t.erro ?? "", /importação não encontrada/);
    assert.notEqual(t.concluidoEm, null);
    assert.equal(await processarProximoTrabalho({ workerId: "w" }), null);
  });
  test("a espera entre tentativas é respeitada", async () => {
    const { trabalho } = await enfileirar(dilonId, "IMPORTAR", `espera-${Date.now()}`, { importacaoId: "nao-existe" });
    const c = await processarProximoTrabalho({ workerId: "w" }); // espera padrão: 30 s
    assert.equal(c?.resultado, "reagendado");
    const t = await prisma.sdrTrabalho.findUniqueOrThrow({ where: { id: trabalho.id } });
    assert.equal(t.status, "PENDENTE");
    assert.equal(t.proximaTentativaEm.getTime() > Date.now() + 20_000, true);
    assert.equal(await processarProximoTrabalho({ workerId: "w" }), null); // ainda não é a hora
    await prisma.sdrTrabalho.delete({ where: { id: trabalho.id } });
  });
  test("trabalho interrompido que esgotou as tentativas falha, e a importação não fica processando para sempre", async () => {
    const { importacao } = await importar(dilonId, dez(8500, 3));
    const job = await prisma.sdrTrabalho.findFirstOrThrow({ where: { tenantId: dilonId, chave: { startsWith: `importar:${importacao.id}:` } } });
    await prisma.sdrImportacao.update({ where: { id: importacao.id }, data: { status: "PROCESSANDO" } });
    await prisma.sdrTrabalho.update({ where: { id: job.id }, data: { status: "EM_PROCESSAMENTO", bloqueadoPor: "worker-morto", leaseAte: passado(), tentativas: 3 } });
    assert.equal(await processarProximoTrabalho({ workerId: "w" }), null);
    const t = await prisma.sdrTrabalho.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(t.status, "FALHOU");
    assert.match(t.erro ?? "", /limite de tentativas/);
    const imp = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.equal(imp.status, "FALHOU");
    assert.match(imp.erro ?? "", /interrompido/);
    // Dá para tentar de novo pelo reprocessamento.
    const r = await sdr(dilonId).importacoes.reprocessar(importacao.id);
    assert.equal(r.pendentes, 3);
    await drenar();
    assert.equal((await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } })).status, "CONCLUIDA");
  });
});

describe("isolamento entre organizações", () => {
  let importacaoDilon = "";
  let empresaDilon = "";
  let campanhaDilon = "";

  before(async () => {
    const { campanha } = await criarCampanha(dilonId, "isolamento");
    campanhaDilon = campanha.id;
    const { importacao } = await importar(dilonId, dez(9201, 3, { porte: "ME", segmento: "Clínicas" }), { campanhaId: campanha.id });
    await drenar();
    importacaoDilon = importacao.id;
    empresaDilon = (await empresaPorCnpj(dilonId, cnpjDe(9201)))!.id;
  });

  const status = (n: number) => (e: unknown) => e instanceof ErroSdrCore && e.status === n;

  test("importações, linhas e reprocessamento de outra organização não existem", async () => {
    await assert.rejects(sdr(outraId).importacoes.obter(importacaoDilon), status(404));
    await assert.rejects(sdr(outraId).importacoes.linhas(importacaoDilon), status(404));
    await assert.rejects(sdr(outraId).importacoes.reprocessar(importacaoDilon), status(404));
    assert.equal((await sdr(outraId).importacoes.listar()).some((i) => i.id === importacaoDilon), false);
    assert.equal((await sdr(dilonId).importacoes.listar()).some((i) => i.id === importacaoDilon), true);
  });
  test("empresas e prospectos de outra organização não aparecem nem pelo id", async () => {
    await assert.rejects(sdr(outraId).empresas.obter(empresaDilon), status(404));
    const lista = await sdr(outraId).empresas.listar({ campanhaId: campanhaDilon });
    assert.equal(lista.total, 0);
    assert.equal((await sdr(outraId).empresas.listar({})).itens.some((e) => e.id === empresaDilon), false);
  });
  test("não importa nem associa usando campanha ou empresa de outra organização", async () => {
    await assert.rejects(importar(outraId, dez(9300, 1), { campanhaId: campanhaDilon }), status(404));
    const { campanha: minha } = await criarCampanha(outraId, "minha");
    await assert.rejects(sdr(outraId).empresas.associarACampanha(campanhaDilon, [empresaDilon]), status(404));
    await assert.rejects(sdr(outraId).empresas.associarACampanha(minha.id, [empresaDilon]), status(400));
    await assert.rejects(sdr(outraId).empresas.requalificarCampanha(campanhaDilon), status(404));
    assert.equal(await prisma.sdrProspecto.count({ where: { tenantId: outraId, empresaId: empresaDilon } }), 0);
  });
  test("trabalho de uma organização apontando para a importação de outra falha sem tocar nela", async () => {
    const antesDoAtaque = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacaoDilon } });
    const { trabalho } = await enfileirar(outraId, "IMPORTAR", `cruzado-${Date.now()}`, { importacaoId: importacaoDilon });
    const { trabalho: t2 } = await enfileirar(outraId, "QUALIFICAR", `cruzado-q-${Date.now()}`, { campanhaId: campanhaDilon, tudo: true });
    const ciclos = await drenar();
    assert.equal(ciclos.some((c) => c.trabalhoId === trabalho.id && c.resultado === "falhou"), true);
    assert.equal(ciclos.some((c) => c.trabalhoId === t2.id && c.resultado === "falhou"), true);
    assert.match((await prisma.sdrTrabalho.findUniqueOrThrow({ where: { id: trabalho.id } })).erro ?? "", /não encontrada/);
    const depois = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacaoDilon } });
    assert.deepEqual(
      [depois.status, depois.importadas, depois.pendentes, depois.falhas, depois.erro],
      [antesDoAtaque.status, antesDoAtaque.importadas, antesDoAtaque.pendentes, antesDoAtaque.falhas, antesDoAtaque.erro]
    );
  });
  test("o mesmo CNPJ pode existir nas duas, cada uma com a sua empresa", async () => {
    await importar(outraId, [{ cnpj: cnpjDe(9201), razao: "Empresa da Outra Organização" }]);
    await drenar();
    const minha = (await empresaPorCnpj(outraId, cnpjDe(9201)))!;
    assert.notEqual(minha.id, empresaDilon);
    assert.equal((await empresaPorCnpj(dilonId, cnpjDe(9201)))!.razaoSocial, "Empresa de Teste 9201");
  });
  test("o próprio banco recusa prospecto que cruza organizações", async () => {
    const { campanha: minha, perfil } = await criarCampanha(outraId, "fk");
    await assert.rejects(prisma.sdrProspecto.create({ data: { tenantId: outraId, empresaId: empresaDilon, campanhaId: minha.id, icpId: perfil.id } }));
    await assert.rejects(prisma.sdrProspecto.create({ data: { tenantId: outraId, empresaId: (await empresaPorCnpj(outraId, cnpjDe(9201)))!.id, campanhaId: campanhaDilon, icpId: perfil.id } }));
  });
  test("a fachada não aceita organização vazia", () => {
    assert.throws(() => sdrDoTenant(""));
  });
});

describe("permissões nas APIs", () => {
  let dono: Sessao;
  let financeiro: Sessao;
  let atendente: Sessao;
  let externo: Sessao;
  let campanhaId = "";
  let importacaoId = "";
  let empresaId = "";
  const csv = () => montarCsv(dez(9401, 3, { porte: "ME", segmento: "Clínicas" }));

  before(async () => {
    [dono, financeiro, atendente, externo] = await Promise.all([logado(USUARIOS.dono), logado(USUARIOS.financeiro), logado(USUARIOS.atendente), logado(USUARIOS.externo)]);
    campanhaId = (await criarCampanha(dilonId, "api")).campanha.id;
  });

  test("o responsável faz o fluxo inteiro: prévia, importa, acompanha, filtra e vê a origem", async () => {
    const previa = await dono.chamar("/api/sdr/importacoes/previa", "POST", { conteudo: csv() });
    assert.equal(previa.status, 200);
    const p = (await previa.json()) as { totais: { novas: number }; mapeamento: { cnpj: string } };
    assert.equal(p.totais.novas, 3);
    assert.equal(p.mapeamento.cnpj, "CNPJ");

    const chave = `api-${Date.now()}-chave`;
    const criar = await dono.chamar("/api/sdr/importacoes", "POST", { nomeArquivo: "api.csv", conteudo: csv(), campanhaId, chave });
    assert.equal(criar.status, 201);
    importacaoId = ((await criar.json()) as { id: string }).id;
    assert.equal((await dono.chamar("/api/sdr/importacoes", "POST", { nomeArquivo: "api.csv", conteudo: csv(), campanhaId, chave })).status, 200); // mesma chave

    await drenar();
    const detalhe = (await (await dono.chamar(`/api/sdr/importacoes/${importacaoId}?status=IMPORTADA`)).json()) as {
      status: string; importadas: number; campanhaNome: string; trabalho: { status: string }; linhas: { total: number; itens: { numero: number }[] }; podeEscrever: boolean;
    };
    assert.deepEqual([detalhe.status, detalhe.importadas, detalhe.trabalho.status, detalhe.linhas.total, detalhe.podeEscrever], ["CONCLUIDA", 3, "CONCLUIDO", 3, true]);

    const lista = (await (await dono.chamar(`/api/sdr/empresas?campanhaId=${campanhaId}&status=QUALIFICADO`)).json()) as { total: number; itens: { id: string; prospectos: { pontuacao: number }[] }[]; resumo: Record<string, number> };
    assert.equal(lista.total, 3);
    assert.equal(lista.resumo.QUALIFICADO, 3);
    empresaId = lista.itens[0].id;

    const ficha = (await (await dono.chamar(`/api/sdr/empresas/${empresaId}`)).json()) as {
      verificada: boolean; origem: string; informadoNoCsv: { arquivo: string; linha: number }; prospectos: { criterios: { situacao: string }[] }[];
    };
    assert.equal(ficha.verificada, false);
    assert.equal(ficha.origem, "CSV");
    assert.equal(ficha.informadoNoCsv.arquivo, "api.csv");
    assert.equal(ficha.prospectos[0].criterios.some((c) => c.situacao === "NAO_VERIFICADO"), true);

    assert.equal((await dono.chamar(`/api/sdr/campanhas/${campanhaId}/requalificar`, "POST")).status, 202);
    assert.equal((await dono.chamar(`/api/sdr/campanhas/${campanhaId}/prospectos`, "POST", { empresaIds: [empresaId] })).status, 202);
    await drenar();
    const sup = await dono.chamar("/api/sdr/supressoes", "POST", { tipo: "EMAIL", valor: "Fulano@Exemplo.com", motivo: "SOLICITOU_NAO_CONTATO" });
    assert.equal(sup.status, 201);
    const supId = ((await sup.json()) as { id: string }).id;
    assert.equal(((await (await dono.chamar("/api/sdr/supressoes")).json()) as { supressoes: unknown[] }).supressoes.length >= 1, true);
    // O valor (e-mail) não vai para a auditoria: só o id e o tipo.
    const log = await prisma.auditLog.findFirstOrThrow({ where: { action: "sdr.supressao.criada", targetTenantId: dilonId }, orderBy: { createdAt: "desc" } });
    assert.equal(JSON.stringify(log.metadata).includes("exemplo.com"), false);
    assert.equal((await dono.chamar(`/api/sdr/supressoes/${supId}`, "DELETE")).status, 200);
    assert.equal(await prisma.auditLog.count({ where: { targetTenantId: dilonId, action: { in: ["sdr.importacao.criada", "sdr.campanha.requalificada", "sdr.empresas.associadas", "sdr.supressao.removida"] } } }) >= 4, true);
  });

  test("tenantId no corpo ou na URL é recusado, não ignorado", async () => {
    assert.equal((await dono.chamar("/api/sdr/importacoes", "POST", { nomeArquivo: "x.csv", conteudo: csv(), tenantId: outraId })).status, 400);
    assert.equal((await dono.chamar("/api/sdr/importacoes/previa", "POST", { conteudo: csv(), tenantId: outraId })).status, 400);
    assert.equal((await dono.chamar("/api/sdr/supressoes", "POST", { tipo: "CNPJ", valor: cnpjDe(1), motivo: "OPOSICAO", tenantId: outraId })).status, 400);
    assert.equal((await dono.chamar("/api/sdr/empresas?tenantId=" + outraId)).status, 400);
    assert.equal((await dono.chamar(`/api/sdr/campanhas/${campanhaId}/prospectos`, "POST", { empresaIds: ["x"], tenantId: outraId })).status, 400);
  });
  test("arquivo enorme e corpo inválido são recusados", async () => {
    assert.equal((await dono.chamar("/api/sdr/importacoes/previa", "POST", { conteudo: "a;b\n" + "x".repeat(9 * 1024 * 1024) })).status, 413);
    const r = await fetch(`${BASE}/api/sdr/importacoes/previa`, { method: "POST", redirect: "manual" });
    assert.equal(r.status, 307); // sem login, antes de ler o corpo
  });
  test("o financeiro vê tudo e não altera nada", async () => {
    const ler = [
      "/api/sdr/importacoes", `/api/sdr/importacoes/${importacaoId}`, "/api/sdr/empresas", `/api/sdr/empresas/${empresaId}`, "/api/sdr/supressoes",
    ];
    for (const rota of ler) assert.equal((await financeiro.chamar(rota)).status, 200, rota);
    const empresasLidas = (await (await financeiro.chamar("/api/sdr/empresas")).json()) as { podeEscrever: boolean };
    assert.equal(empresasLidas.podeEscrever, false);

    const antesDeEscrever = [await prisma.sdrImportacao.count(), await prisma.sdrSupressao.count(), await prisma.sdrTrabalho.count()];
    const escrever: [string, string, unknown?][] = [
      ["/api/sdr/importacoes/previa", "POST", { conteudo: csv() }],
      ["/api/sdr/importacoes", "POST", { nomeArquivo: "x.csv", conteudo: csv() }],
      [`/api/sdr/importacoes/${importacaoId}/reprocessar`, "POST"],
      [`/api/sdr/campanhas/${campanhaId}/prospectos`, "POST", { empresaIds: [empresaId] }],
      [`/api/sdr/campanhas/${campanhaId}/requalificar`, "POST"],
      ["/api/sdr/supressoes", "POST", { tipo: "CNPJ", valor: cnpjDe(1), motivo: "OPOSICAO" }],
      ["/api/sdr/supressoes/qualquer", "DELETE"],
    ];
    for (const [rota, metodo, corpo] of escrever) assert.equal((await financeiro.chamar(rota, metodo, corpo)).status, 403, `${metodo} ${rota}`);
    assert.deepEqual([await prisma.sdrImportacao.count(), await prisma.sdrSupressao.count(), await prisma.sdrTrabalho.count()], antesDeEscrever);
  });
  test("o atendente e quem é de empresa sem o recurso não acessam nenhuma rota nova", async () => {
    const rotas: [string, string, unknown?][] = [
      ["/api/sdr/importacoes", "GET"], ["/api/sdr/importacoes", "POST", { nomeArquivo: "x.csv", conteudo: csv() }],
      ["/api/sdr/importacoes/previa", "POST", { conteudo: csv() }], [`/api/sdr/importacoes/${importacaoId}`, "GET"],
      [`/api/sdr/importacoes/${importacaoId}/reprocessar`, "POST"], ["/api/sdr/empresas", "GET"], [`/api/sdr/empresas/${empresaId}`, "GET"],
      [`/api/sdr/campanhas/${campanhaId}/prospectos`, "POST", { empresaIds: [empresaId] }], [`/api/sdr/campanhas/${campanhaId}/requalificar`, "POST"],
      ["/api/sdr/supressoes", "GET"], ["/api/sdr/supressoes", "POST", { tipo: "CNPJ", valor: cnpjDe(1), motivo: "OPOSICAO" }], ["/api/sdr/supressoes/x", "DELETE"],
    ];
    for (const quem of [atendente, externo]) {
      for (const [rota, metodo, corpo] of rotas) assert.equal((await quem.chamar(rota, metodo, corpo)).status, 403, `${metodo} ${rota}`);
    }
    assert.equal(await prisma.sdrImportacao.count({ where: { tenantId: externaId } }), 0);
  });
  test("sem login, toda rota nova manda para o login", async () => {
    const anonimo = new Sessao();
    const rotas: [string, string][] = [
      ["/api/sdr/importacoes", "GET"], ["/api/sdr/importacoes", "POST"], ["/api/sdr/importacoes/previa", "POST"], ["/api/sdr/importacoes/x", "GET"],
      ["/api/sdr/importacoes/x/reprocessar", "POST"], ["/api/sdr/empresas", "GET"], ["/api/sdr/empresas/x", "GET"], ["/api/sdr/campanhas/x/prospectos", "POST"],
      ["/api/sdr/campanhas/x/requalificar", "POST"], ["/api/sdr/supressoes", "GET"], ["/api/sdr/supressoes", "POST"], ["/api/sdr/supressoes/x", "DELETE"],
    ];
    for (const [rota, metodo] of rotas) {
      const r = await anonimo.chamar(rota, metodo, metodo === "POST" ? {} : undefined);
      assert.equal(r.status, 307, `${metodo} ${rota}`);
      assert.equal(new URL(r.headers.get("location")!, "http://x").pathname, "/login");
    }
  });
  test("outra organização com o recurso só vê o que é dela pela API", async () => {
    const outro = await logado(USUARIOS.outro);
    const lista = (await (await outro.chamar("/api/sdr/importacoes")).json()) as { importacoes: { id: string }[] };
    assert.equal(lista.importacoes.some((i) => i.id === importacaoId), false);
    assert.equal((await outro.chamar(`/api/sdr/importacoes/${importacaoId}`)).status, 404);
    assert.equal((await outro.chamar(`/api/sdr/empresas/${empresaId}`)).status, 404);
    assert.equal((await outro.chamar(`/api/sdr/importacoes/${importacaoId}/reprocessar`, "POST")).status, 404);
    assert.equal((await outro.chamar(`/api/sdr/campanhas/${campanhaId}/requalificar`, "POST")).status, 404);
    assert.equal((await outro.chamar("/api/sdr/importacoes", "POST", { nomeArquivo: "x.csv", conteudo: csv(), campanhaId })).status, 404);
    assert.equal((await outro.chamar("/api/sdr/supressoes/qualquer", "DELETE")).status, 404);
  });
});

describe("worker independente (processo de verdade)", () => {
  test("processa uma importação sozinho e não escreve dados de empresa no log", async () => {
    const { campanha } = await criarCampanha(dilonId, "worker");
    const linhas = dez(9601, 30, { porte: "ME", segmento: "Clínicas", email: "contato@empresa-worker.com.br" });
    const { importacao } = await importar(dilonId, linhas, { campanhaId: campanha.id });

    const tsx = createRequire(import.meta.url).resolve("tsx");
    const saida: string[] = [];
    const worker = spawn(process.execPath, ["--import", pathToFileURL(tsx).href, "apps/sdr-worker/src/index.ts"], {
      cwd: raizRepo,
      env: { ...process.env, SDR_INTERVALO_MS: "300", SDR_LOTE: "10" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    worker.stdout.on("data", (d) => saida.push(String(d)));
    worker.stderr.on("data", (d) => saida.push(String(d)));
    try {
      const limite = Date.now() + 90_000;
      let status = "";
      while (Date.now() < limite) {
        status = (await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } })).status;
        if (status === "CONCLUIDA" || status === "FALHOU") break;
        if (worker.exitCode !== null) break;
        await new Promise((r) => setTimeout(r, 500));
      }
      assert.equal(status, "CONCLUIDA", saida.join("").slice(-500));
    } finally {
      await executar("taskkill", ["/pid", String(worker.pid), "/t", "/f"]).catch(() => undefined);
    }
    const imp = await prisma.sdrImportacao.findUniqueOrThrow({ where: { id: importacao.id } });
    assert.equal(imp.importadas, 30);
    assert.equal(await prisma.sdrProspecto.count({ where: { campanhaId: campanha.id } }), 30);

    const log = saida.join("");
    assert.match(log, /\[dilon-zap sdr-worker\] no ar/);
    assert.match(log, /\(IMPORTAR, tentativa 1\): concluido/);
    assert.equal(log.includes("Empresa de Teste"), false);
    assert.equal(log.includes(cnpjDe(9601)), false);
    assert.equal(log.includes("empresa-worker.com.br"), false);
    assert.equal(/postgres(ql)?:\/\//i.test(log), false);
  });
});

describe("nada de CRM nem de WhatsApp", () => {
  const pastasDoServidor = [
    "packages/sdr-core/src",
    "apps/sdr-worker/src",
    "apps/web/lib/sdr",
    "apps/web/app/api/sdr",
    "apps/web/app/(dashboard)/sdr",
  ];
  const arquivos = (pasta: string): string[] =>
    fs.readdirSync(path.join(raizRepo, pasta), { withFileTypes: true }).flatMap((e) => {
      const caminho = path.join(pasta, e.name);
      return e.isDirectory() ? arquivos(caminho) : /\.(ts|tsx|cjs|js)$/.test(e.name) ? [caminho] : [];
    });

  test("o código do SDR não importa nem chama nada do CRM ou do WhatsApp", () => {
    const proibido = [
      /upsertContactByPhone/, /resolveWhatsAppJid/, /resolve-jid/, /worker-client/, /contact-server/, /baileys/i, /whiskeysockets/i,
      /WORKER_INTERNAL/, /wakeOutbox/, /check-whatsapp/, /start-conversation/, /\/api\/messages/, /\/api\/contacts/, /\/api\/whatsapp/,
      /prisma\.(contact|conversation|message|scheduledMessage|whatsAppSession|contactBlock|messageReaction|atendimento)\b/,
      /\.(contact|conversation|message|scheduledMessage|whatsAppSession)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/,
    ];
    const achados: string[] = [];
    const total = pastasDoServidor.flatMap(arquivos);
    assert.equal(total.length > 25, true, "a varredura precisa achar os arquivos");
    for (const arquivo of total) {
      const texto = fs.readFileSync(path.join(raizRepo, arquivo), "utf8");
      for (const regra of proibido) if (regra.test(texto)) achados.push(`${arquivo}: ${regra}`);
    }
    assert.deepEqual(achados, []);
  });
  test("o servidor do SDR não faz chamada de rede nenhuma", () => {
    const achados: string[] = [];
    for (const arquivo of ["packages/sdr-core/src", "apps/sdr-worker/src", "apps/web/lib/sdr", "apps/web/app/api/sdr"].flatMap(arquivos)) {
      const texto = fs.readFileSync(path.join(raizRepo, arquivo), "utf8");
      if (/\bfetch\(|node:https?|node:net\b|node:tls|node:dgram|WebSocket|axios|XMLHttpRequest/.test(texto)) achados.push(arquivo);
    }
    assert.deepEqual(achados, []);
  });
  test("o pacote do SDR só depende do banco", () => {
    const sdrCore = JSON.parse(fs.readFileSync(path.join(raizRepo, "packages/sdr-core/package.json"), "utf8"));
    assert.deepEqual(Object.keys(sdrCore.dependencies), ["@dilon-zap/db"]);
    const worker = JSON.parse(fs.readFileSync(path.join(raizRepo, "apps/sdr-worker/package.json"), "utf8"));
    assert.deepEqual(Object.keys(worker.dependencies).sort(), ["@dilon-zap/db", "@dilon-zap/sdr-core", "dotenv"]);
  });
  test("depois de todos os fluxos, nenhum contato, conversa, mensagem ou sessão foi criado ou alterado", async () => {
    assert.deepEqual(await contar(), antes);
    assert.equal(process.env.WORKER_INTERNAL_URL, "");
    // O que o SDR criou está só nas tabelas do SDR.
    assert.equal((await prisma.sdrEmpresa.count()) > 200, true);
  });
});
