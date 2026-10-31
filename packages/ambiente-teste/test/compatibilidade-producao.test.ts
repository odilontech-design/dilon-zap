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
const COMMIT_EM_PRODUCAO = "f57d844";

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

  test("é só aditivo: cria objetos do SDR, acrescenta um valor ao enum e nada mais", () => {
    const instrucoes = semComentarios(ddl()).split(/;\n/).map((s) => s.trim()).filter(Boolean);
    assert.equal(instrucoes.length > 30, true);
    const permitidas = [
      /^CREATE TYPE "\w+Sdr" AS ENUM \(/,
      /^CREATE TABLE "Sdr\w+" \(/,
      /^CREATE (UNIQUE )?INDEX "Sdr\w+" ON "Sdr\w+"\(/,
      /^ALTER TYPE "Recurso" ADD VALUE 'SDR'$/,
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
    assert.equal(alvos.length > 8, true);
    assert.deepEqual(alvos.filter((a) => a !== "Tenant" && !a.startsWith("Sdr")), []);
  });
  test("cria exatamente as tabelas que o schema declara para o SDR", () => {
    const criadas = [...ddl().matchAll(/CREATE TABLE "(Sdr\w+)"/g)].map((m) => m[1]).sort();
    const declaradas = [...fs.readFileSync(schemaAtual, "utf8").matchAll(/^model (Sdr\w+) /gm)].map((m) => m[1]).sort();
    assert.deepEqual(criadas, declaradas);
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
  const lerComCliente = async (fase: string) => {
    const { stdout } = await executar(process.execPath, [path.join(tmp, "verificar.cjs"), fase], {
      cwd: tmp,
      // NODE_PATH: o cliente gerado fora do repositório precisa achar o @prisma/client.
      env: { ...process.env, CLIENTE_ANTIGO: clienteAntigo, URL_ANTES: urlDe(BANCO_ANTES), NODE_PATH: path.join(raiz, "node_modules") },
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
  test("o valor SDR existe no enum depois do SQL e as tabelas novas nascem vazias", async () => {
    const r = await sql(
      BANCO_ANTES,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'Recurso' AND e.enumlabel = 'SDR') THEN RAISE EXCEPTION 'sem SDR no enum'; END IF;
        IF (SELECT count(*) FROM "SdrEmpresa") + (SELECT count(*) FROM "SdrTrabalho") + (SELECT count(*) FROM "SdrIcp") <> 0 THEN RAISE EXCEPTION 'tabelas não vazias'; END IF;
      END $$;`
    );
    assert.equal(r.erro, null);
  });
  test("o schema fica em sincronia com o banco depois do SQL (o db push não teria mais nada a fazer)", async () => {
    // Exit code 0 = nenhuma diferença; 2 = ainda há diferença.
    const saida = await prismaCli(["migrate", "diff", "--from-url", urlDe(BANCO_ANTES), "--to-schema-datamodel", schemaAtual, "--exit-code"], tmp);
    assert.match(saida, /No difference detected/);
  });
  test("a ordem importa: com a linha SDR, o cliente antigo quebra; apagando a linha, volta", async () => {
    const ativar = docs("sdr-ativar-recurso.sql");
    assert.equal((await sql(BANCO_ANTES, substituir(ativar, { tid, slug: "empresa-antiga" }))).erro, null);

    const quebrado = await lerComCliente("ler");
    assert.match(String(quebrado.erro), /SDR|enum/i); // é por isso que o recurso só liga depois do site novo

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
