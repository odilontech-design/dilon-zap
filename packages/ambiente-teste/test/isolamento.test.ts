import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import dotenv from "dotenv";
import { prisma, PrismaClient } from "@dilon-zap/db";
import { motivoParaNaoRemover } from "../src/banco-teste";
import { ConexaoBloqueada } from "../src/bloquear-rede";
import { ARQUIVO_DA_PASTA, BANCO_TESTE, PREFIXO_PASTA, VARIAVEIS_ESVAZIADAS, VARIAVEL_MARCA, VARIAVEL_PASTA_DADOS, ocultar, urlDoBancoDeTeste } from "../src/config";
import { confirmarServidor, normalizarPasta, validarUrlDeTeste, type Consultar } from "../src/guarda-banco";
import { conexoesLocaisInesperadas, conexoesProibidas, escutasProibidas } from "../src/sentinela";

const marca = process.env[VARIAVEL_MARCA]!;
const pastaDados = process.env[VARIAVEL_PASTA_DADOS]!;
const consultarPrisma: Consultar = (sql) => prisma.$queryRawUnsafe(sql);
const urlValida = "postgresql://dilon_teste:x@127.0.0.1:55432/dilonzap_test";

// Todos os dados abaixo são fictícios.
const jid = (n: number) => `550000000${String(n).padStart(4, "0")}@s.whatsapp.net`;

before(async () => {
  // Nenhum teste escreve antes de o próprio servidor confirmar quem é.
  assert.equal(validarUrlDeTeste(process.env.DATABASE_URL).ok, true);
  const v = await confirmarServidor(consultarPrisma, { marca, pastaDados });
  assert.equal(v.ok, true);
});

after(async () => {
  // Os testes são mais rápidos que a leitura da sentinela. A conexão do motor do
  // Prisma fica aberta tempo suficiente para o sistema operacional mostrá-la.
  await prisma.$queryRaw`select 1`;
  await new Promise((r) => setTimeout(r, 5_000));
  await prisma.$disconnect();
});

describe("guarda da URL", () => {
  const casos: [string, string | undefined][] = [
    ["recusa o túnel de produção na porta 5433", "postgresql://u:p@localhost:5433/dilonzap"],
    ["recusa o banco de desenvolvimento na 5432", "postgresql://u:p@localhost:5432/dilonzap"],
    ["recusa o IP da VPS", "postgresql://dilon_teste:p@178.104.197.156:55432/dilonzap_test"],
    ["recusa o host postgres da rede Docker", "postgresql://dilon_teste:p@postgres:55432/dilonzap_test"],
    ["recusa um host do Neon", "postgresql://dilon_teste:p@ep-exemplo.neon.tech:55432/dilonzap_test"],
    ["recusa localhost, que pode resolver diferente", "postgresql://dilon_teste:p@localhost:55432/dilonzap_test"],
    ["recusa outro nome de banco", "postgresql://dilon_teste:p@127.0.0.1:55432/dilonzap"],
    ["recusa outro usuário", "postgresql://dilonzap:p@127.0.0.1:55432/dilonzap_test"],
    ["recusa parâmetro host= que desvia a conexão", "postgresql://dilon_teste:p@127.0.0.1:55432/dilonzap_test?host=178.104.197.156"],
    ["recusa URL vazia", ""],
    ["recusa URL ausente", undefined],
    ["recusa texto que não é URL", "banco de producao"],
  ];
  for (const [nome, url] of casos) {
    test(nome, () => assert.equal(validarUrlDeTeste(url).ok, false));
  }
  test("aceita somente o banco de teste", () => assert.equal(validarUrlDeTeste(urlValida).ok, true));
  test("o motivo da recusa não repete a URL", () => {
    const r = validarUrlDeTeste("postgresql://segredo:senha@10.0.0.1:5432/x");
    assert.equal(r.ok, false);
    assert.equal(!r.ok && /senha|segredo|10\.0\.0\.1/.test(r.motivo), false);
  });
});

describe("guarda do servidor", () => {
  test("aceita o servidor real com a marca desta execução", async () => {
    assert.equal((await confirmarServidor(consultarPrisma, { marca, pastaDados })).ok, true);
  });
  test("recusa quando a marca é de outra execução", async () => {
    const r = await confirmarServidor(consultarPrisma, { marca: "00000000-0000-0000-0000-000000000000", pastaDados });
    assert.equal(r.ok, false);
  });
  test("recusa quando a pasta de dados é outra", async () => {
    const r = await confirmarServidor(consultarPrisma, { marca, pastaDados: "/var/lib/postgresql/18/docker" });
    assert.equal(r.ok, false);
  });
  test("recusa um banco real, no mesmo servidor, sem a marca", async () => {
    const nome = "dilonzap_sem_marca";
    await prisma.$executeRawUnsafe(`create database ${nome}`);
    const senha = new URL(process.env.DATABASE_URL!).password;
    const outro = new PrismaClient({ datasources: { db: { url: urlDoBancoDeTeste(decodeURIComponent(senha), nome) } } });
    try {
      const r = await confirmarServidor((sql) => outro.$queryRawUnsafe(sql), { marca, pastaDados });
      assert.equal(r.ok, false);
    } finally {
      await outro.$disconnect();
      await prisma.$executeRawUnsafe(`drop database ${nome}`);
    }
  });
  test("recusa um servidor que se identifica como outro banco", async () => {
    const falso: Consultar = async () => [{ banco: "dilonzap", usuario: BANCO_TESTE.usuario, host: BANCO_TESTE.host, porta: BANCO_TESTE.porta, pasta: pastaDados }];
    assert.equal((await confirmarServidor(falso, { marca, pastaDados })).ok, false);
  });
  test("recusa um túnel na mesma porta apontando para outro endereço", async () => {
    const falso: Consultar = async () => [{ banco: BANCO_TESTE.banco, usuario: BANCO_TESTE.usuario, host: "172.18.0.2", porta: 5432, pasta: pastaDados }];
    assert.equal((await confirmarServidor(falso, { marca, pastaDados })).ok, false);
  });
});

describe("variáveis de ambiente", () => {
  test("DATABASE_URL é a do banco de teste", () => assert.equal(validarUrlDeTeste(process.env.DATABASE_URL).ok, true));
  test("segredos conhecidos estão vazios", () => {
    for (const nome of VARIAVEIS_ESVAZIADAS) assert.equal(process.env[nome], "", nome);
  });
  test("nenhuma variável PG desvia a conexão", () => {
    assert.deepEqual(Object.keys(process.env).filter((k) => /^PG[A-Z]+$/.test(k)), []);
  });
  test("um .env carregado depois não troca o banco nem devolve segredo", () => {
    const pasta = mkdtempSync(path.join(os.tmpdir(), "dilon-env-falso-"));
    const arquivo = path.join(pasta, ".env");
    writeFileSync(arquivo, 'DATABASE_URL="postgresql://u:p@localhost:5433/producao"\nWORKER_INTERNAL_SECRET="falso"\n');
    const antes = process.env.DATABASE_URL;
    try {
      dotenv.config({ path: arquivo });
      assert.equal(process.env.DATABASE_URL === antes, true);
      assert.equal(process.env.WORKER_INTERNAL_SECRET, "");
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });
  test("os logs escondem URL e senha", () => {
    const texto = ocultar("falhou em postgresql://u:abc123@host:1/x com abc123", ["abc123"]);
    assert.equal(/abc123|postgresql:/.test(texto), false);
  });
});

describe("bloqueio de rede do JavaScript", () => {
  test("fetch ao domínio de produção é bloqueado", async () => {
    await assert.rejects(fetch("https://zap.dilontech.com.br/login"), ConexaoBloqueada);
  });
  test("conexão ao IP da VPS é bloqueada", () => {
    assert.throws(() => net.connect({ host: "178.104.197.156", port: 5432 }), ConexaoBloqueada);
  });
  test("conexão ao túnel local na 5433 é bloqueada", () => {
    assert.throws(() => net.connect(5433, "127.0.0.1"), ConexaoBloqueada);
  });
  test("conexão ao worker interno na 4001 é bloqueada", () => {
    assert.throws(() => net.connect({ host: "127.0.0.1", port: 4001 }), ConexaoBloqueada);
  });
  test("https direto é bloqueado", () => {
    assert.throws(() => https.get("https://zap.dilontech.com.br/"), ConexaoBloqueada);
  });
  test("o banco de teste continua alcançável", async () => {
    await new Promise<void>((resolve, reject) => {
      const s = net.connect({ host: BANCO_TESTE.host, port: BANCO_TESTE.porta });
      s.once("connect", () => {
        s.destroy();
        resolve();
      });
      s.once("error", reject);
    });
  });
});

describe("sentinela do sistema operacional", () => {
  const vazio = { conexoes: [], escutas: [] };
  test("acusa conexão a endereço externo", () => {
    const a = { ...vazio, conexoes: [{ pid: 1, remoto: "178.104.197.156", porta: 5432, estado: "Established" }] };
    assert.equal(conexoesProibidas(a).length, 1);
  });
  test("acusa tentativa ainda sem resposta", () => {
    const a = { ...vazio, conexoes: [{ pid: 1, remoto: "8.8.8.8", porta: 443, estado: "SynSent" }] };
    assert.equal(conexoesProibidas(a).length, 1);
  });
  test("acusa conexão local ao túnel de produção", () => {
    const a = { ...vazio, conexoes: [{ pid: 1, remoto: "127.0.0.1", porta: 5433, estado: "Established" }] };
    assert.equal(conexoesLocaisInesperadas(a).length, 1);
  });
  test("não acusa o banco de teste", () => {
    const a = { ...vazio, conexoes: [{ pid: 1, remoto: "127.0.0.1", porta: BANCO_TESTE.porta, estado: "Established" }] };
    assert.equal(conexoesProibidas(a).length + conexoesLocaisInesperadas(a).length, 0);
  });
  test("acusa escuta fora da máquina", () => {
    const a = { ...vazio, escutas: [{ pid: 1, local: "0.0.0.0", porta: BANCO_TESTE.porta }] };
    assert.equal(escutasProibidas(a).length, 1);
  });
});

describe("motor nativo do Prisma", () => {
  test("o cliente real de @dilon-zap/db está no banco de teste", async () => {
    const [r] = await prisma.$queryRaw<{ banco: string; porta: number; host: string }[]>`
      select current_database()::text as banco, inet_server_port()::int as porta, host(inet_server_addr())::text as host`;
    assert.deepEqual(r, { banco: BANCO_TESTE.banco, porta: BANCO_TESTE.porta, host: BANCO_TESTE.host });
  });
  test("a conexão do motor vem de 127.0.0.1, segundo o Postgres", async () => {
    const [r] = await prisma.$queryRaw<{ cliente: string }[]>`select host(inet_client_addr())::text as cliente`;
    assert.equal(r.cliente, BANCO_TESTE.host);
  });
  test("nenhuma conexão de rede vem de fora da máquina", async () => {
    const r = await prisma.$queryRaw<{ cliente: string }[]>`
      select distinct host(client_addr)::text as cliente from pg_stat_activity where client_addr is not null`;
    assert.deepEqual(r.map((x) => x.cliente), [BANCO_TESTE.host]);
  });
  test("o Postgres só escuta em 127.0.0.1", async () => {
    const [r] = await prisma.$queryRaw<{ v: string }[]>`select current_setting('listen_addresses') as v`;
    assert.equal(r.v, BANCO_TESTE.host);
  });
  test("o schema real foi criado", async () => {
    const modelos = readFileSync(path.resolve("../db/prisma/schema.prisma"), "utf8").match(/^model /gm)!.length;
    const [r] = await prisma.$queryRaw<{ n: number }[]>`select count(*)::int as n from pg_tables where schemaname = 'public'`;
    assert.equal(r.n >= modelos, true);
  });
});

describe("separação entre empresas com Prisma", () => {
  let a: string;
  let b: string;
  let contatoA: string;
  let contatoB: string;

  before(async () => {
    const criar = async (slug: string, n: number) => {
      const t = await prisma.tenant.create({ data: { name: `Empresa ${slug}`, slug: `teste-isolamento-${slug}` } });
      const c = await prisma.contact.create({ data: { tenantId: t.id, waJid: jid(n), name: `Cliente ${slug}` } });
      const f = await prisma.funil.create({ data: { tenantId: t.id, nome: "Vendas" } });
      const s = await prisma.stage.create({ data: { tenantId: t.id, funilId: f.id, name: "Novo" } });
      await prisma.negociacao.create({ data: { tenantId: t.id, contactId: c.id, funilId: f.id, stageId: s.id, titulo: `Negócio ${slug}` } });
      return { tenant: t.id, contato: c.id };
    };
    const ea = await criar("a", 1);
    const eb = await criar("b", 2);
    a = ea.tenant;
    b = eb.tenant;
    contatoA = ea.contato;
    contatoB = eb.contato;
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: "teste-isolamento-" } } });
  });

  test("a listagem traz só os contatos da própria empresa", async () => {
    const lista = await prisma.contact.findMany({ where: { tenantId: a } });
    assert.deepEqual(lista.map((c) => c.id), [contatoA]);
  });
  test("buscar contato da outra empresa pelo id não retorna nada", async () => {
    assert.equal(await prisma.contact.findFirst({ where: { id: contatoB, tenantId: a } }), null);
  });
  test("atualizar contato da outra empresa não altera nada", async () => {
    const r = await prisma.contact.updateMany({ where: { id: contatoB, tenantId: a }, data: { name: "Invadido" } });
    assert.equal(r.count, 0);
    assert.equal((await prisma.contact.findUnique({ where: { id: contatoB } }))?.name, "Cliente b");
  });
  test("apagar contato da outra empresa não apaga nada", async () => {
    const r = await prisma.contact.deleteMany({ where: { id: contatoB, tenantId: a } });
    assert.equal(r.count, 0);
    assert.notEqual(await prisma.contact.findUnique({ where: { id: contatoB } }), null);
  });
  test("negociações ficam separadas por empresa", async () => {
    const lista = await prisma.negociacao.findMany({ where: { tenantId: a }, select: { contactId: true, tenantId: true } });
    assert.deepEqual(lista, [{ contactId: contatoA, tenantId: a }]);
  });
  test("o mesmo número pode existir em duas empresas", async () => {
    const c = await prisma.contact.create({ data: { tenantId: b, waJid: jid(1), name: "Mesmo número" } });
    assert.equal(c.tenantId, b);
    assert.equal((await prisma.contact.count({ where: { tenantId: a, waJid: jid(1) } })), 1);
    await prisma.contact.delete({ where: { id: c.id } });
  });
  test("o mesmo número não se repete dentro da empresa", async () => {
    await assert.rejects(prisma.contact.create({ data: { tenantId: a, waJid: jid(1) } }), (e: { code?: string }) => e.code === "P2002");
  });
  test("apagar uma empresa não atinge os dados da outra", async () => {
    await prisma.tenant.delete({ where: { id: a } });
    assert.equal(await prisma.contact.count({ where: { tenantId: a } }), 0);
    assert.equal(await prisma.negociacao.count({ where: { tenantId: a } }), 0);
    assert.equal(await prisma.contact.count({ where: { tenantId: b } }), 1);
    assert.equal(await prisma.negociacao.count({ where: { tenantId: b } }), 1);
  });
});

describe("remoção da pasta temporária", () => {
  const criarPasta = (comArquivo: boolean) => {
    const pasta = mkdtempSync(path.join(os.tmpdir(), PREFIXO_PASTA));
    if (comArquivo) writeFileSync(path.join(pasta, ARQUIVO_DA_PASTA), "x");
    return pasta;
  };
  test("recusa a pasta real enquanto o Postgres está rodando", () => {
    const pasta = path.dirname(pastaDados);
    assert.notEqual(motivoParaNaoRemover(pasta), null);
    assert.equal(normalizarPasta(pastaDados).includes(PREFIXO_PASTA), true);
  });
  test("recusa pasta com postmaster.pid", () => {
    const pasta = criarPasta(true);
    mkdirSync(path.join(pasta, "pgdata"));
    writeFileSync(path.join(pasta, "pgdata", "postmaster.pid"), "1");
    assert.notEqual(motivoParaNaoRemover(pasta), null);
    rmSync(pasta, { recursive: true, force: true });
  });
  test("recusa pasta sem o arquivo do ambiente", () => {
    const pasta = criarPasta(false);
    assert.notEqual(motivoParaNaoRemover(pasta), null);
    rmSync(pasta, { recursive: true, force: true });
  });
  test("recusa pasta fora da pasta temporária", () => {
    assert.notEqual(motivoParaNaoRemover(path.resolve("."), os.tmpdir()), null);
  });
  test("aceita pasta do ambiente já encerrada", () => {
    const pasta = criarPasta(true);
    assert.equal(motivoParaNaoRemover(pasta), null);
    rmSync(pasta, { recursive: true, force: true });
  });
});
