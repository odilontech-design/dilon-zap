import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import pg from "pg";
import { prisma } from "@dilon-zap/db";
import { BANCO_TESTE } from "../src/config";

/**
 * Prova, contra o schema que está em produção, que o SQL do SDR só acrescenta, que o site e o worker
 * antigos continuam funcionando com ele e que os roteiros de ativação, desativação e conferência
 * fazem o que dizem. Tudo no banco local descartável: o "banco de produção" aqui é um segundo banco
 * criado com o schema do commit que está na VPS.
 */

/** O commit que está em produção (último push). Mudar aqui quando a produção mudar. */
const COMMIT_EM_PRODUCAO = "100ee4f";

const executar = promisify(execFile);
const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../../..");
const docs = (nome: string) => fs.readFileSync(path.join(raiz, "docs", nome), "utf8").replace(/\r\n/g, "\n");
const schemaAtual = path.join(raiz, "packages/db/prisma/schema.prisma");
const cliPrisma = createRequire(import.meta.url).resolve("prisma/build/index.js");
const senha = decodeURIComponent(new URL(process.env.DATABASE_URL!).password);

const BANCO_ANTES = "dilonzap_antes";
const urlDe = (banco: string) => `postgresql://${BANCO_TESTE.usuario}:${encodeURIComponent(senha)}@${BANCO_TESTE.host}:${BANCO_TESTE.porta}/${banco}`;

const prismaCli = async (args: string[], cwd: string) => {
  // Sem rede e com prazo: se algo tentar sair, o teste falha em vez de ficar pendurado.
  const { stdout } = await executar(process.execPath, [cliPrisma, ...args], {
    cwd,
    env: { ...process.env, npm_config_offline: "true" },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 120_000,
  });
  return stdout;
};

/** Roda um texto com várias instruções, como o psql faria. Devolve o erro, se houver. */
async function sql(banco: string, texto: string): Promise<{ erro: string | null }> {
  const cliente = new pg.Client({ host: BANCO_TESTE.host, port: BANCO_TESTE.porta, user: BANCO_TESTE.usuario, password: senha, database: banco });
  await cliente.connect();
  try {
    await cliente.query(texto);
    return { erro: null };
  } catch (e) {
    return { erro: (e as Error).message };
  } finally {
    // Fechar sem COMMIT desfaz a transação que ficou aberta por causa do erro.
    await cliente.end();
  }
}

const semComentarios = (texto: string) =>
  texto.split("\n").filter((l) => !l.trimStart().startsWith("--") && l.trim() !== "").map((l) => l.trimEnd()).join("\n");

let tmp = "";
let antigo = "";

describe("o SQL de referência do SDR", () => {
  const ddl = () => docs("sdr-ddl-referencia.sql");

  test("é só aditivo: cria objetos do SDR e nada mais", () => {
    const instrucoes = semComentarios(ddl()).split(/;\n/).map((s) => s.trim()).filter(Boolean);
    assert.equal(instrucoes.length > 4, true);
    const permitidas = [
      /^CREATE TYPE "\w+Sdr" AS ENUM \(/,
      /^CREATE TABLE "Sdr\w+" \(/,
      /^CREATE (UNIQUE )?INDEX "Sdr\w+" ON "Sdr\w+"\(/,
      /^ALTER TYPE "CanalSdr" ADD VALUE 'WHATSAPP'$/,
      /^ALTER TABLE "Sdr\w+" ADD CONSTRAINT "\w+" FOREIGN KEY /,
    ];
    const fora = instrucoes.filter((i) => !permitidas.some((p) => p.test(i)));
    assert.deepEqual(fora.map((i) => i.slice(0, 80)), []);
    assert.equal(instrucoes.filter((i) => i.startsWith("ALTER TYPE")).length, 1);
    // "ON DELETE CASCADE" e "ON UPDATE CASCADE" são regras das chaves novas, não comandos.
    const semRegrasDeChave = semComentarios(ddl()).replace(/ON (DELETE|UPDATE) (CASCADE|RESTRICT|SET NULL|NO ACTION)/g, "");
    assert.equal(/\b(DROP|RENAME|TRUNCATE|DELETE|UPDATE|INSERT|SET NOT NULL|ALTER COLUMN|DROP COLUMN)\b/i.test(semRegrasDeChave), false);
  });
  test("as chaves estrangeiras só apontam para Tenant ou para tabelas do SDR", () => {
    const alvos = [...semComentarios(ddl()).matchAll(/REFERENCES "(\w+)"/g)].map((m) => m[1]);
    assert.equal(alvos.length >= 1, true);
    assert.deepEqual(alvos.filter((a) => a !== "Tenant" && !a.startsWith("Sdr")), []);
  });
  test("cria exatamente as tabelas do SDR que o schema atual tem a mais que a produção", async () => {
    const criadas = [...ddl().matchAll(/CREATE TABLE "(Sdr\w+)"/g)].map((m) => m[1]).sort();
    const { stdout: producao } = await executar("git", ["show", `${COMMIT_EM_PRODUCAO}:packages/db/prisma/schema.prisma`], { cwd: raiz, maxBuffer: 16 * 1024 * 1024 });
    const modelos = (texto: string) => [...texto.matchAll(/^model (Sdr\w+) /gm)].map((m) => m[1]);
    const jaExistem = modelos(producao);
    const novas = modelos(fs.readFileSync(schemaAtual, "utf8")).filter((m) => !jaExistem.includes(m)).sort();
    assert.deepEqual(criadas, novas);
    assert.deepEqual(novas, ["SdrEnvioEmail"]);
  });
  test("está em dia com o schema atual (senão, regerar antes do deploy)", async () => {
    // Dentro de node_modules/.cache (ignorado pelo git): o Prisma acha o @prisma/client subindo as pastas e
    // não tenta instalá-lo pela rede. Fora do repositório ele rodava `npm install`, que o bloqueio de rede
    // do ambiente de teste deixava pendurado.
    const cache = path.join(raiz, "node_modules", ".cache");
    fs.mkdirSync(cache, { recursive: true });
    tmp = fs.mkdtempSync(path.join(cache, "dilon-compat-"));
    const { stdout: antigoSchema } = await executar("git", ["show", `${COMMIT_EM_PRODUCAO}:packages/db/prisma/schema.prisma`], { cwd: raiz, maxBuffer: 16 * 1024 * 1024 });
    antigo = path.join(tmp, "schema-antigo.prisma");
    fs.writeFileSync(antigo, antigoSchema);
    const gerado = await prismaCli(["migrate", "diff", "--from-schema-datamodel", antigo, "--to-schema-datamodel", schemaAtual, "--script"], tmp);
    assert.equal(semComentarios(gerado.replace(/\r\n/g, "\n")), semComentarios(ddl()));
  });
});

describe("compatibilidade com o schema e o Postgres de produção", () => {
  let clienteAntigo = "";
  const lerComCliente = async (fase: string, extra: Record<string, string> = {}) => {
    const { stdout } = await executar(process.execPath, [path.join(tmp, "verificar.cjs"), fase], {
      cwd: tmp,
      // NODE_PATH: o cliente gerado fora do repositório precisa achar o @prisma/client.
      env: { ...process.env, CLIENTE_ANTIGO: clienteAntigo, URL_ANTES: urlDe(BANCO_ANTES), NODE_PATH: path.join(raiz, "node_modules"), ...extra },
    });
    return JSON.parse(stdout.trim().split("\n").pop()!) as Record<string, any>;
  };

  before(async () => {
    // Cliente Prisma do schema antigo, gerado numa pasta à parte (não toca no cliente do projeto).
    clienteAntigo = path.join(tmp, "cliente-antigo");
    const comSaida = fs.readFileSync(antigo, "utf8").replace('provider = "prisma-client-js"', `provider = "prisma-client-js"\n  output   = "${clienteAntigo.replace(/\\/g, "/")}"`);
    const schemaComSaida = path.join(tmp, "schema-antigo-saida.prisma");
    fs.writeFileSync(schemaComSaida, comSaida);
    await prismaCli(["generate", "--schema", schemaComSaida], tmp);

    // Banco com o schema de produção.
    await prisma.$executeRawUnsafe(`drop database if exists ${BANCO_ANTES} with (force)`);
    await prisma.$executeRawUnsafe(`create database ${BANCO_ANTES}`);
    const ddlAntigo = await prismaCli(["migrate", "diff", "--from-empty", "--to-schema-datamodel", antigo, "--script"], tmp);
    assert.equal((await sql(BANCO_ANTES, ddlAntigo)).erro, null);

    fs.writeFileSync(
      path.join(tmp, "verificar.cjs"),
      `const { PrismaClient } = require(process.env.CLIENTE_ANTIGO);
const prisma = new PrismaClient({ datasources: { db: { url: process.env.URL_ANTES } } });
const fase = process.argv[2];
(async () => {
  const r = {};
  if (fase === "semear") {
    const t = await prisma.tenant.create({ data: { name: "Empresa Antiga", slug: "empresa-antiga" } });
    await prisma.tenantRecurso.create({ data: { tenantId: t.id, recurso: "URA", ativo: true } });
    await prisma.contact.create({ data: { tenantId: t.id, waJid: "5500000000001@s.whatsapp.net", name: "Contato Antigo" } });
    const o = await prisma.tenant.create({ data: { name: "Outra Antiga", slug: "outra-antiga" } });
    r.tid = t.id; r.outra = o.id;
  }
  if (fase === "ler") {
    const t = await prisma.tenant.findFirst({ where: { slug: "empresa-antiga" } });
    r.recursos = (await prisma.tenantRecurso.findMany({ where: { tenantId: t.id } })).map((x) => x.recurso);
    r.contatos = await prisma.contact.count();
    r.tenants = await prisma.tenant.count();
  }
  if (fase === "sdr-antigo") {
    // O que o site de produção (código antigo) faria com o SDR depois do db push: ler, criar, editar e apagar empresa.
    r.antes = await prisma.sdrEmpresa.count();
    const comFilhas = await prisma.sdrEmpresa.findUnique({ where: { id: process.env.EMP } });
    const nova = await prisma.sdrEmpresa.create({ data: { tenantId: process.env.TID, razaoSocial: "Criada pelo cliente antigo", chaveNome: "criada pelo cliente antigo" } });
    await prisma.sdrEmpresa.update({ where: { id: nova.id }, data: { cidade: "Niteroi" } });
    await prisma.sdrEmpresa.delete({ where: { id: comFilhas.id } });
    r.depois = await prisma.sdrEmpresa.count();
  }
  console.log(JSON.stringify(r));
})()
  .catch((e) => console.log(JSON.stringify({ erro: e.name + ": " + String(e.message).split("\\n").filter(Boolean).pop() })))
  .finally(() => prisma.$disconnect());
`
    );
  });

  after(async () => {
    await prisma.$executeRawUnsafe(`drop database if exists ${BANCO_ANTES} with (force)`);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const substituir = (texto: string, vars: Record<string, string>) =>
    texto.replace(/:'(\w+)'/g, (_, nome) => `'${vars[nome].replace(/'/g, "''")}'`);

  let tid = "";
  let outra = "";

  test("o site e o worker antigos leem o banco igual depois do SQL novo, sem perder nada", async () => {
    const semeado = await lerComCliente("semear");
    tid = semeado.tid;
    outra = semeado.outra;
    const antes = await lerComCliente("ler");
    assert.deepEqual(antes, { recursos: ["URA"], contatos: 1, tenants: 2 });

    const aplicado = await sql(BANCO_ANTES, ddlAdequado());
    assert.equal(aplicado.erro, null);
    assert.deepEqual(await lerComCliente("ler"), antes);
  });
  test("o valor SDR segue no enum depois do SQL e as tabelas novas nascem vazias", async () => {
    const r = await sql(
      BANCO_ANTES,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'Recurso' AND e.enumlabel = 'SDR') THEN RAISE EXCEPTION 'sem SDR no enum'; END IF;
        IF (SELECT count(*) FROM "SdrIaConfig") + (SELECT count(*) FROM "SdrIaUso") + (SELECT count(*) FROM "SdrIaCache") <> 0 THEN RAISE EXCEPTION 'tabelas não vazias'; END IF;
      END $$;`
    );
    assert.equal(r.erro, null);
  });
  test("o schema fica em sincronia com o banco depois do SQL (o db push não teria mais nada a fazer)", async () => {
    // Exit code 0 = nenhuma diferença; 2 = ainda há diferença.
    const saida = await prismaCli(["migrate", "diff", "--from-url", urlDe(BANCO_ANTES), "--to-schema-datamodel", schemaAtual, "--exit-code"], tmp);
    assert.match(saida, /No difference detected/);
  });
  test("com o SDR já no enum, o cliente de produção segue lendo com a linha SDR; apagando a linha, volta", async () => {
    const ativar = docs("sdr-ativar-recurso.sql");
    assert.equal((await sql(BANCO_ANTES, substituir(ativar, { tid, slug: "empresa-antiga" }))).erro, null);

    const lido = await lerComCliente("ler");
    assert.equal(lido.erro, undefined);
    assert.deepEqual([...(lido.recursos as string[])].sort(), ["SDR", "URA"]);

    const desativar = docs("sdr-desativar-recurso.sql");
    assert.equal((await sql(BANCO_ANTES, substituir(desativar, { tid }))).erro, null);
    assert.deepEqual(await lerComCliente("ler"), { recursos: ["URA"], contatos: 1, tenants: 2 });
  });

  describe("o roteiro de ativação do recurso", () => {
    const ativar = (vars: Record<string, string>) => sql(BANCO_ANTES, substituir(docs("sdr-ativar-recurso.sql"), vars));
    const linhasSdr = async () => {
      const cliente = new pg.Client({ host: BANCO_TESTE.host, port: BANCO_TESTE.porta, user: BANCO_TESTE.usuario, password: senha, database: BANCO_ANTES });
      await cliente.connect();
      try {
        const r = await cliente.query(`SELECT "tenantId", ativo FROM "TenantRecurso" WHERE recurso = 'SDR'`);
        return r.rows as { tenantId: string; ativo: boolean }[];
      } finally {
        await cliente.end();
      }
    };
    const apagarTudo = () => sql(BANCO_ANTES, `DELETE FROM "TenantRecurso" WHERE recurso = 'SDR'`);

    test("liga uma linha só, para a empresa certa, e repetir não muda nada", async () => {
      await apagarTudo();
      assert.equal((await ativar({ tid, slug: "empresa-antiga" })).erro, null);
      assert.deepEqual(await linhasSdr(), [{ tenantId: tid, ativo: true }]);
      assert.equal((await ativar({ tid, slug: "empresa-antiga" })).erro, null);
      assert.equal((await linhasSdr()).length, 1);
    });
    test("id e slug que não batem não ligam nada e dão erro", async () => {
      await apagarTudo();
      assert.match(String((await ativar({ tid, slug: "outro-slug" })).erro), /division by zero/);
      assert.match(String((await ativar({ tid: "id-inexistente", slug: "empresa-antiga" })).erro), /division by zero/);
      assert.deepEqual(await linhasSdr(), []);
    });
    test("a empresa errada não é ligada nem quando só o slug dela é informado", async () => {
      await apagarTudo();
      assert.match(String((await ativar({ tid: outra, slug: "empresa-antiga" })).erro), /division by zero/);
      assert.deepEqual(await linhasSdr(), []);
    });
    test("linha que já existia desligada não é sobrescrita: o roteiro para e avisa", async () => {
      await apagarTudo();
      await sql(BANCO_ANTES, `INSERT INTO "TenantRecurso" ("tenantId", recurso, ativo, motivo, "updatedAt") VALUES ('${tid}', 'SDR', false, 'desligado de propósito', now())`);
      assert.match(String((await ativar({ tid, slug: "empresa-antiga" })).erro), /division by zero/);
      assert.deepEqual(await linhasSdr(), [{ tenantId: tid, ativo: false }]);
    });
    test("se já existe SDR em outra empresa, o roteiro para e desfaz", async () => {
      await apagarTudo();
      await sql(BANCO_ANTES, `INSERT INTO "TenantRecurso" ("tenantId", recurso, ativo, "updatedAt") VALUES ('${outra}', 'SDR', true, now())`);
      assert.match(String((await ativar({ tid, slug: "empresa-antiga" })).erro), /division by zero/);
      assert.deepEqual(await linhasSdr(), [{ tenantId: outra, ativo: true }]);
      await apagarTudo();
    });
    test("não toca nas outras exceções de recurso da empresa", async () => {
      await apagarTudo();
      assert.equal((await ativar({ tid, slug: "empresa-antiga" })).erro, null);
      const cliente = new pg.Client({ host: BANCO_TESTE.host, port: BANCO_TESTE.porta, user: BANCO_TESTE.usuario, password: senha, database: BANCO_ANTES });
      await cliente.connect();
      const r = await cliente.query(`SELECT recurso, ativo FROM "TenantRecurso" WHERE "tenantId" = '${tid}' ORDER BY recurso`);
      await cliente.end();
      // A ordem é a do enum (URA vem antes de SDR), não a alfabética.
      assert.deepEqual(r.rows, [{ recurso: "URA", ativo: true }, { recurso: "SDR", ativo: true }]);
    });
    test("desativar apaga só a linha SDR da empresa informada", async () => {
      assert.equal((await sql(BANCO_ANTES, substituir(docs("sdr-desativar-recurso.sql"), { tid: outra }))).erro, null);
      assert.equal((await linhasSdr()).length, 1); // a da outra empresa não existia; a de tid segue
      assert.equal((await sql(BANCO_ANTES, substituir(docs("sdr-desativar-recurso.sql"), { tid }))).erro, null);
      assert.deepEqual(await linhasSdr(), []);
    });
  });

  /**
   * Ensaio do deploy: um banco que nasce com o schema de PRODUÇÃO (o do commit em produção), com dados, recebe o
   * `prisma db push` do schema novo exatamente como será feito na VPS (sem --accept-data-loss), e depois roda o
   * código novo, o rollback para o código antigo e a limpeza da empresa fictícia.
   */
  describe("ensaio do deploy (db push sobre o schema de produção)", () => {
    const BANCO_ENSAIO = "dilonzap_ensaio";
    const urlEnsaio = urlDe(BANCO_ENSAIO);
    // A guarda do ambiente de teste recusa processo com DATABASE_URL diferente da do banco de teste, e isso não se enfraquece:
    // o db push usa uma cópia do MESMO schema com a URL do banco do ensaio escrita no lugar do env("DATABASE_URL").
    const ambienteDoPush = { ...process.env, npm_config_offline: "true", CHECKPOINT_DISABLE: "1" };
    let schemaDoEnsaio = "";
    let tidEnsaio = "";
    let antesDoPush: Record<string, any> = {};

    const consultar = async (banco: string, texto: string, valores: unknown[] = []) => {
      const c = new pg.Client({ host: BANCO_TESTE.host, port: BANCO_TESTE.porta, user: BANCO_TESTE.usuario, password: senha, database: banco });
      await c.connect();
      try {
        return (await c.query(texto, valores)).rows as Record<string, any>[];
      } finally {
        await c.end();
      }
    };
    const push = async () => {
      const r = await executar(process.execPath, [cliPrisma, "db", "push", "--skip-generate", "--schema", schemaDoEnsaio], { cwd: tmp, env: ambienteDoPush, maxBuffer: 32 * 1024 * 1024, timeout: 120_000 });
      return `${r.stdout}\n${r.stderr}`;
    };
    const diff = (de: string, para: string[]) => prismaCliComAmbiente(["migrate", "diff", "--from-url", de, ...para, "--exit-code"]);
    const prismaCliComAmbiente = async (args: string[]) => (await executar(process.execPath, [cliPrisma, ...args], { cwd: tmp, env: ambienteDoPush, maxBuffer: 32 * 1024 * 1024, timeout: 120_000 })).stdout;
    const totais = async () => (await consultar(BANCO_ENSAIO, `SELECT (SELECT count(*) FROM "Contact")::int AS contatos, (SELECT count(*) FROM "Negociacao")::int AS negociacoes, (SELECT count(*) FROM "Conversation")::int AS conversas, (SELECT count(*) FROM "Message")::int AS mensagens, (SELECT count(*) FROM "ScheduledMessage")::int AS agendadas, (SELECT count(*) FROM "SdrSupressao")::int AS supressoes`))[0];

    before(async () => {
      const original = fs.readFileSync(schemaAtual, "utf8");
      assert.equal(original.split('env("DATABASE_URL")').length, 2);
      schemaDoEnsaio = path.join(tmp, "schema-ensaio.prisma");
      fs.writeFileSync(schemaDoEnsaio, original.replace('env("DATABASE_URL")', JSON.stringify(urlEnsaio)));
      await prisma.$executeRawUnsafe(`drop database if exists ${BANCO_ENSAIO} with (force)`);
      await prisma.$executeRawUnsafe(`create database ${BANCO_ENSAIO}`);
      const ddlAntigo = await prismaCli(["migrate", "diff", "--from-empty", "--to-schema-datamodel", antigo, "--script"], tmp);
      assert.equal((await sql(BANCO_ENSAIO, ddlAntigo)).erro, null);
      const semeado = await lerComCliente("semear", { URL_ANTES: urlEnsaio });
      tidEnsaio = semeado.tid;
      antesDoPush = await lerComCliente("ler", { URL_ANTES: urlEnsaio });
    });
    after(async () => {
      await prisma.$executeRawUnsafe(`drop database if exists ${BANCO_ENSAIO} with (force)`);
    });

    test("o banco do ensaio está no schema de produção: não tem as tabelas novas", async () => {
      const r = await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'SdrEnvioEmail'`);
      assert.equal(r[0].n, 0);
    });
    test("o db push, sem aceitar perda de dados, termina em sincronia e sem alertas", async () => {
      const saida = await push();
      assert.match(saida, /now in sync/i);
      assert.equal(/data loss|warning|will be dropped|--accept-data-loss/i.test(saida), false, saida);
    });
    test("o que o db push aplicou é idêntico ao SQL de referência (mesmo schema do banco que recebeu o SQL à mão)", async () => {
      assert.match(await diff(urlEnsaio, ["--to-url", urlDe(BANCO_ANTES)]), /No difference detected/);
    });
    test("depois do push, o banco bate com o schema novo e um segundo push não tem nada a fazer", async () => {
      assert.match(await diff(urlEnsaio, ["--to-schema-datamodel", schemaAtual]), /No difference detected/);
      assert.match(await push(), /already in sync/i);
    });
    test("os dados que já existiam seguem iguais", async () => {
      assert.deepEqual(await lerComCliente("ler", { URL_ANTES: urlEnsaio }), antesDoPush);
    });
    test("a tabela nova nasceu vazia, com tenantId, e o valor novo do canal existe", async () => {
      const r = await consultar(BANCO_ENSAIO, `SELECT table_name, bool_or(column_name = 'tenantId') AS tem_tenant FROM information_schema.columns WHERE table_name = 'SdrEnvioEmail' GROUP BY table_name`);
      assert.deepEqual(r.map((x) => [x.table_name, x.tem_tenant]), [["SdrEnvioEmail", true]]);
      assert.equal(Number((await consultar(BANCO_ENSAIO, `SELECT count(*) AS n FROM "SdrEnvioEmail"`))[0].n), 0);
      const v = await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'CanalSdr' AND e.enumlabel = 'WHATSAPP'`);
      assert.equal(v[0].n, 1);
    });

    test("o código novo faz o fluxo inteiro com a empresa fictícia e com uma de controle e leva as duas ao CRM, uma negociação e um contato para cada", async () => {
      const antes = await totais();
      const { stdout } = await executar(process.execPath, ["--import", "tsx", path.join(aqui, "ensaio-pos-push.ts")], {
        cwd: path.resolve(aqui, ".."),
        env: { ...process.env, URL_ENSAIO: urlEnsaio, ENSAIO_TENANT: tidEnsaio },
        timeout: 120_000,
      });
      const r = JSON.parse(stdout.trim().split("\n").pop()!);
      assert.equal(r.erro, undefined, r.erro);
      // IA desligada: a tentativa só registra a recusa, sem chamar ninguém.
      assert.deepEqual([r.fict.iaOk, r.fict.iaMotivo], [false, "desligada"]);
      assert.deepEqual([r.fict.crmOk, r.real.crmOk], [true, true]);
      const depois = await totais();
      assert.deepEqual({ ...depois, contatos: depois.contatos - 2, negociacoes: depois.negociacoes - 2 }, antes);
      const f = await consultar(BANCO_ENSAIO, `SELECT (SELECT etapa::text FROM "SdrAcompanhamento" WHERE "empresaId" = $1) AS etapa, (SELECT count(*)::int FROM "SdrAbordagem" WHERE "empresaId" = $1) AS abordagens, (SELECT count(*)::int FROM "SdrInteracao" WHERE "empresaId" = $1) AS interacoes`, [r.fict.empresaId]);
      assert.deepEqual([f[0].etapa, f[0].abordagens, f[0].interacoes > 3], ["RESPONDEU", 1, true]);
      (globalThis as Record<string, unknown>).__ensaio = r;
    });

    test("a limpeza remove a empresa fictícia e tudo que nasceu dela, e não encosta na de controle nem em contatos, negociações e bloqueios", async () => {
      const r = (globalThis as Record<string, any>).__ensaio;
      const contagem = (empresaId: string) =>
        consultar(
          BANCO_ENSAIO,
          `SELECT (SELECT count(*)::int FROM "SdrEmpresa" WHERE id = $1) AS empresa, (SELECT count(*)::int FROM "SdrAcompanhamento" WHERE "empresaId" = $1) AS acomp, (SELECT count(*)::int FROM "SdrAbordagem" WHERE "empresaId" = $1) AS abord, (SELECT count(*)::int FROM "SdrInteracao" WHERE "empresaId" = $1) AS inter, (SELECT count(*)::int FROM "SdrImportacaoLinha" WHERE "empresaId" = $1) AS linhas`,
          [empresaId]
        ).then((x) => x[0]);
      const controleAntes = await contagem(r.real.empresaId);
      const totaisAntes = await totais();
      const iaAntes = (await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "SdrIaUso"`))[0].n;
      assert.equal(iaAntes, 2); // uma recusa por empresa (a fictícia e a de controle)

      const desde = new Date(Date.now() - 3_600_000).toISOString().slice(0, 19).replace("T", " ");
      // Primeiro o CRM (o vínculo mora no acompanhamento, que o roteiro da empresa apaga); a empresa de controle fica com o contato e a negociação dela.
      assert.equal((await sql(BANCO_ENSAIO, substituir(docs("sdr-limpar-teste-crm.sql"), { tid: tidEnsaio, marcador: "Zz Teste Sdr Ensaio", desde }))).erro, null);
      const semCrm = await totais();
      assert.deepEqual([semCrm.contatos, semCrm.negociacoes], [totaisAntes.contatos - 1, totaisAntes.negociacoes - 1]);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "Negociacao" WHERE id = $1`, [r.fict.negociacaoId]))[0].n, 0);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "Negociacao" WHERE id = $1`, [r.real.negociacaoId]))[0].n, 1);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "NegociacaoNota" WHERE "negociacaoId" = $1`, [r.fict.negociacaoId]))[0].n, 0);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "TarefaNegociacao" WHERE "negociacaoId" = $1`, [r.fict.negociacaoId]))[0].n, 0);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "NegociacaoNota" WHERE "negociacaoId" = $1`, [r.real.negociacaoId]))[0].n > 0, true);
      const roteiro = substituir(docs("sdr-limpar-teste.sql"), { tid: tidEnsaio, marcador: "Zz Teste Sdr Ensaio", desde });
      assert.equal((await sql(BANCO_ENSAIO, roteiro)).erro, null);

      assert.deepEqual(await contagem(r.fict.empresaId), { empresa: 0, acomp: 0, abord: 0, inter: 0, linhas: 0 });
      assert.deepEqual(await contagem(r.real.empresaId), controleAntes);
      assert.deepEqual(await totais(), semCrm);
      const imp = await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "SdrImportacao" WHERE "tenantId" = $1`, [tidEnsaio]);
      assert.equal(imp[0].n, 1); // só a da empresa de controle
      // Como a IA ficou desligada nas duas, as duas recusas entram na limpeza do horário (é o que se espera no teste real, com uma empresa só).
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "SdrIaUso"`))[0].n, 0);
    });
    test("a limpeza não roda se o marcador não existir, se houver duas empresas com ele, ou se a importação não for um cadastro manual", async () => {
      const r = (globalThis as Record<string, any>).__ensaio;
      const desde = new Date(Date.now() - 3_600_000).toISOString().slice(0, 19).replace("T", " ");
      const roda = (marcador: string, tid = tidEnsaio) => sql(BANCO_ENSAIO, substituir(docs("sdr-limpar-teste.sql"), { tid, marcador, desde }));
      assert.match(String((await roda("Nome que não existe")).erro), /division by zero/);
      assert.match(String((await roda("Empresa Real De Controle", "outra-empresa")).erro), /division by zero/);
      // Duas empresas com o mesmo nome: para sem apagar nada.
      await consultar(BANCO_ENSAIO, `INSERT INTO "SdrEmpresa" (id, "tenantId", "nomeFantasia", "chaveNome", "updatedAt") VALUES ('dup-1', $1, 'Nome Repetido', 'repetido a', now()), ('dup-2', $1, 'Nome Repetido', 'repetido b', now())`, [tidEnsaio]);
      assert.match(String((await roda("Nome Repetido")).erro), /division by zero/);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "SdrEmpresa" WHERE "nomeFantasia" = 'Nome Repetido'`))[0].n, 2);
      // Importação grande (não é cadastro manual): não pode ser apagada junto.
      await consultar(BANCO_ENSAIO, `UPDATE "SdrImportacao" SET "totalLinhas" = 40, "nomeArquivo" = 'lista-real.csv' WHERE "tenantId" = $1`, [tidEnsaio]);
      assert.match(String((await roda("Empresa Real De Controle")).erro), /division by zero/);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "SdrEmpresa" WHERE "nomeFantasia" = 'Empresa Real De Controle'`))[0].n, 1);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "SdrImportacao" WHERE "tenantId" = $1`, [tidEnsaio]))[0].n, 1);
      await consultar(BANCO_ENSAIO, `DELETE FROM "SdrEmpresa" WHERE id IN ('dup-1','dup-2')`);
      // Roteiro do CRM: sem o marcador, com negociação criada antes do início do teste ou que não é do SDR, ele para sem apagar nada.
      const crm = (marcador: string, desdeX = desde) => sql(BANCO_ENSAIO, substituir(docs("sdr-limpar-teste-crm.sql"), { tid: tidEnsaio, marcador, desde: desdeX }));
      const futuro = new Date(Date.now() + 3_600_000).toISOString().slice(0, 19).replace("T", " ");
      assert.match(String((await crm("Nome que não existe")).erro), /division by zero/);
      assert.match(String((await crm("Empresa Real De Controle", futuro)).erro), /division by zero/);
      await consultar(BANCO_ENSAIO, `UPDATE "Negociacao" SET origem = 'Instagram' WHERE id = $1`, [r.real.negociacaoId]);
      assert.match(String((await crm("Empresa Real De Controle")).erro), /division by zero/);
      await consultar(BANCO_ENSAIO, `UPDATE "Negociacao" SET origem = 'SDR' WHERE id = $1`, [r.real.negociacaoId]);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "Negociacao" WHERE id = $1`, [r.real.negociacaoId]))[0].n, 1);
      // Contato com conversa não é apagado, mesmo que a negociação seja.
      const contatoReal = (await consultar(BANCO_ENSAIO, `SELECT "contactId" AS id FROM "Negociacao" WHERE id = $1`, [r.real.negociacaoId]))[0].id;
      assert.equal((await sql(BANCO_ENSAIO, `INSERT INTO "WhatsAppSession" (id, "tenantId", "updatedAt") VALUES ('sess-ens', '${tidEnsaio}', now()); INSERT INTO "Conversation" (id, "tenantId", "sessionId", "contactId") VALUES ('conv-ens', '${tidEnsaio}', 'sess-ens', '${contatoReal}')`)).erro, null);
      assert.equal((await crm("Empresa Real De Controle")).erro, null);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "Contact" WHERE id = $1`, [contatoReal]))[0].n, 1);
      assert.equal((await consultar(BANCO_ENSAIO, `SELECT count(*)::int AS n FROM "Negociacao" WHERE id = $1`, [r.real.negociacaoId]))[0].n, 0);
      assert.ok(r);
    });

    test("rollback da aplicação: o código antigo segue lendo, criando, editando e apagando empresa, inclusive uma com dados nas tabelas novas, e o banco não muda", async () => {
      const semeadas = await sql(
        BANCO_ENSAIO,
        `INSERT INTO "SdrEmpresa" (id, "tenantId", "razaoSocial", "chaveNome", "updatedAt") VALUES ('ens-emp', '${tidEnsaio}', 'Empresa Ensaio', 'empresa ensaio', now());
         INSERT INTO "SdrAcompanhamento" (id, "tenantId", "empresaId", "updatedAt") VALUES ('ens-ac', '${tidEnsaio}', 'ens-emp', now());
         INSERT INTO "SdrAbordagem" (id, "tenantId", "empresaId", produto, canal, texto, "updatedAt") VALUES ('ens-ab', '${tidEnsaio}', 'ens-emp', 'DILON_ZAP', 'EMAIL', 'texto', now());
         INSERT INTO "SdrInteracao" (id, "tenantId", "empresaId", tipo) VALUES ('ens-in', '${tidEnsaio}', 'ens-emp', 'NOTA');`
      );
      assert.equal(semeadas.erro, null);
      const esquemaAntes = await diff(urlEnsaio, ["--to-schema-datamodel", schemaAtual]);
      const r = await lerComCliente("sdr-antigo", { URL_ANTES: urlEnsaio, TID: tidEnsaio, EMP: "ens-emp" });
      assert.equal(r.erro, undefined, r.erro);
      assert.equal(r.depois, r.antes); // criou uma e apagou outra
      const sobra = await consultar(BANCO_ENSAIO, `SELECT (SELECT count(*)::int FROM "SdrAcompanhamento" WHERE id = 'ens-ac') + (SELECT count(*)::int FROM "SdrAbordagem" WHERE id = 'ens-ab') + (SELECT count(*)::int FROM "SdrInteracao" WHERE id = 'ens-in') AS n`);
      assert.equal(sobra[0].n, 0); // a cascata do banco cuidou das tabelas que o código antigo nem conhece
      assert.match(esquemaAntes, /No difference detected/);
      assert.match(await diff(urlEnsaio, ["--to-schema-datamodel", schemaAtual]), /No difference detected/);
      assert.deepEqual((await lerComCliente("ler", { URL_ANTES: urlEnsaio })).recursos, antesDoPush.recursos);
    });
  });
});

describe("as consultas de conferência", () => {
  const SOMENTE_LEITURA = ["sdr-conferencia.sql", "sdr-identificar-empresa.sql"];

  test("rodam sem erro contra o schema atual", async () => {
    for (const arquivo of SOMENTE_LEITURA) assert.equal((await sql(BANCO_TESTE.banco, docs(arquivo))).erro, null, arquivo);
  });
  test("são somente leitura: qualquer escrita é recusada pelo próprio banco", async () => {
    for (const nome of SOMENTE_LEITURA) {
      const arquivo = docs(nome);
      const comEscrita = arquivo.replace("BEGIN TRANSACTION READ ONLY;", `BEGIN TRANSACTION READ ONLY;\nDELETE FROM "SdrSupressao";`);
      assert.notEqual(comEscrita, arquivo, nome);
      assert.match(String((await sql(BANCO_TESTE.banco, comEscrita)).erro), /read-only transaction/, nome);
      assert.equal(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE)\b/i.test(semComentarios(arquivo)), false, nome);
      assert.match(arquivo, /ROLLBACK;\s*$/, nome);
    }
  });
});

function ddlAdequado() {
  return docs("sdr-ddl-referencia.sql");
}
