/**
 * Testes da verificação de isolamento entre empresas.
 * Rodar: npm run test:verificar   (não usa banco, não precisa de .env)
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { analisarArquivo, type Achado } from "./analisador";
import { lerModelos } from "./modelos";

const SCHEMA = readFileSync(join(__dirname, "../../packages/db/prisma/schema.prisma"), "utf8");
const MODELOS = lerModelos(SCHEMA);

function analisar(codigo: string, arquivo = "apps/web/app/api/exemplo/route.ts"): Achado[] {
  // Rotas "exemplo" levam requireUser para não disparar R6 nos testes das outras regras.
  const texto = `import { prisma } from "@dilon-zap/db";\nconst user = await requireUser();\n${codigo}`;
  return analisarArquivo({ arquivo, texto, modelos: MODELOS });
}
const regras = (a: Achado[]) => a.map((x) => `${x.regra}:${x.gravidade}`);

describe("schema", () => {
  test("Contact tem tenantId próprio; Message não tem; Tenant é a própria empresa", () => {
    assert.equal(MODELOS.get("contact")?.temTenantId, true);
    assert.equal(MODELOS.get("message")?.temTenantId, false);
    assert.ok(MODELOS.get("conversation")?.relacoes.has("contact"));
  });
});

describe("R1: leitura sem tenantId", () => {
  test("findMany sem tenantId é ERRO", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.findMany({ where: { grupo: false } });`)), ["R1:ERRO"]);
  });
  test("findMany sem nenhum argumento é ERRO", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.findMany();`)), ["R1:ERRO"]);
  });
  test("com tenantId da sessão não há achado", () => {
    assert.deepEqual(analisar(`await prisma.contact.findMany({ where: { tenantId: user.tenantId } });`), []);
  });
  test("tenantId dentro de AND é aceito", () => {
    assert.deepEqual(analisar(`await prisma.contact.findMany({ where: { AND: [{ grupo: false }, { tenantId: user.tenantId }] } });`), []);
  });
  test("tenantId em filtro de relação é aceito", () => {
    assert.deepEqual(analisar(`await prisma.conversation.findMany({ where: { contact: { tenantId: user.tenantId } } });`), []);
  });
  test("findUnique só por id é ERRO e a mensagem diz isso", () => {
    const a = analisar(`await prisma.contact.findUnique({ where: { id: params.id } });`);
    assert.deepEqual(regras(a), ["R1:ERRO"]);
    assert.match(a[0].mensagem, /só por `id`/);
    assert.equal(a[0].prioridade, "ALTA");
  });
  test("where em variável ou com spread é AVISO (não dá para ler)", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.findMany({ where: filtro });`)), ["R1:AVISO"]);
    assert.deepEqual(regras(analisar(`await prisma.contact.findMany({ where: { ...base, grupo: false } });`)), ["R1:AVISO"]);
  });
  test("modelo Tenant é ignorado (o id dele é o próprio tenant)", () => {
    assert.deepEqual(analisar(`await prisma.tenant.findUnique({ where: { id: user.tenantId } });`), []);
  });
  test("cliente de transação (tx) também é verificado", () => {
    assert.deepEqual(regras(analisar(`await prisma.$transaction(async (tx) => { await tx.contact.findMany({ where: {} }); });`)), ["R1:ERRO"]);
  });
});

describe("R2: escrita sem tenantId", () => {
  test("update só por id vindo do pedido é ERRO de prioridade ALTA", () => {
    const a = analisar(`await prisma.contact.update({ where: { id: params.id }, data: { name: "x" } });`);
    assert.deepEqual(regras(a), ["R2:ERRO"]);
    assert.equal(a[0].prioridade, "ALTA");
  });
  test("update com id e tenantId (extendedWhereUnique do Prisma 5) é aceito", () => {
    assert.deepEqual(analisar(`await prisma.contact.update({ where: { id: params.id, tenantId: user.tenantId }, data: {} });`), []);
  });
  test("updateMany e deleteMany sem tenantId são ERRO", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.updateMany({ where: { grupo: true }, data: {} });`)), ["R2:ERRO"]);
    assert.deepEqual(regras(analisar(`await prisma.contact.deleteMany({ where: { grupo: true } });`)), ["R2:ERRO"]);
  });
  test("busca filtrada e depois update pelo mesmo id vira só AVISO (padrão busca-depois-age)", () => {
    const a = analisar(`
      async function f(id: string) {
        const c = await prisma.contact.findFirst({ where: { id, tenantId: user.tenantId } });
        await prisma.contact.update({ where: { id }, data: {} });
      }`);
    assert.deepEqual(regras(a), ["R2:AVISO"]);
  });
  test("a busca filtrada de OUTRA função não vale", () => {
    const a = analisar(`
      async function a(id: string) { await prisma.contact.findFirst({ where: { id, tenantId: user.tenantId } }); }
      async function b(id: string) { await prisma.contact.update({ where: { id }, data: {} }); }`);
    assert.deepEqual(regras(a), ["R2:ERRO"]);
  });
  test("update do próprio usuário (id da sessão) não é achado", () => {
    assert.deepEqual(analisar(`await prisma.user.update({ where: { id: user.id }, data: {} });`), []);
  });
  test("id de registro já carregado é AVISO, não ERRO", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.update({ where: { id: contato.id }, data: {} });`)), ["R2:AVISO"]);
  });
  test("chave composta com valores de registro carregado é AVISO", () => {
    assert.deepEqual(regras(analisar(`await prisma.conversation.upsert({ where: { contactId_sessionId: { contactId: contato.id, sessionId: sessao.id } }, create: { tenantId: user.tenantId }, update: {} });`)), ["R2:AVISO"]);
  });
});

describe("R3: criação sem tenantId", () => {
  test("create sem tenantId é ERRO", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.create({ data: { name: "x" } });`)), ["R3:ERRO"]);
  });
  test("create com tenantId ou com tenant.connect é aceito", () => {
    assert.deepEqual(analisar(`await prisma.contact.create({ data: { tenantId: user.tenantId, name: "x" } });`), []);
    assert.deepEqual(analisar(`await prisma.contact.create({ data: { tenant: { connect: { id: user.tenantId } }, name: "x" } });`), []);
  });
  test("createMany com um item sem tenantId é ERRO", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.createMany({ data: [{ tenantId: user.tenantId }, { name: "sem" }] });`)), ["R3:ERRO"]);
  });
  test("dados com spread ou variável são AVISO", () => {
    assert.deepEqual(regras(analisar(`await prisma.contact.create({ data: { ...resto, name: "x" } });`)), ["R3:AVISO"]);
    assert.deepEqual(regras(analisar(`await prisma.contact.create({ data: dados });`)), ["R3:AVISO"]);
  });
});

describe("R4: tenantId vindo do pedido", () => {
  test("params.tenantId e body.tenantId em rota são ERRO", () => {
    assert.ok(regras(analisar(`await prisma.contact.findMany({ where: { tenantId: params.tenantId } });`)).includes("R4:ERRO"));
    assert.ok(regras(analisar(`await prisma.contact.findMany({ where: { tenantId: body.tenantId } });`)).includes("R4:ERRO"));
  });
  test("tenantId de um parâmetro de função do worker não é pedido", () => {
    const a = analisar(`async function f(params: { tenantId: string }) { await prisma.contact.findMany({ where: { tenantId: params.tenantId } }); }`, "apps/worker/src/x.ts");
    assert.deepEqual(a, []);
  });
  test("input.tenantId de função de domínio (lib) não é pedido", () => {
    assert.deepEqual(analisar(`await prisma.contact.findFirst({ where: { id: input.id, tenantId: input.tenantId } });`, "apps/web/lib/x.ts"), []);
  });
  test("em área de administração, o tenant do pedido é só informativo", () => {
    const a = analisar(`await prisma.contact.findMany({ where: { tenantId: params.id } });`, "apps/web/app/api/admin/x/route.ts");
    assert.deepEqual(regras(a), ["R4:INFO"]);
  });
});

describe("R5: SQL cru", () => {
  test("$queryRawUnsafe é ERRO", () => {
    assert.deepEqual(regras(analisar("await prisma.$queryRawUnsafe(`select * from x where id = ${id}`);")), ["R5:ERRO"]);
  });
  test("$queryRaw sem tenantId é AVISO; com tenantId, nada", () => {
    assert.deepEqual(regras(analisar("await prisma.$queryRaw`select * from \"Contact\"`;")), ["R5:AVISO"]);
    assert.deepEqual(analisar("await prisma.$queryRaw`select * from \"Contact\" where \"tenantId\" = ${user.tenantId}`;"), []);
  });
});

describe("R6 e R7: rota sem acesso e campo secreto", () => {
  test("rota de API sem checagem de acesso é AVISO", () => {
    const a = analisarArquivo({ arquivo: "apps/web/app/api/x/route.ts", texto: `import { prisma } from "@dilon-zap/db";\nexport async function GET() { return Response.json({}); }`, modelos: MODELOS });
    assert.deepEqual(regras(a), ["R6:AVISO"]);
  });
  test("rota com requireUser, webhook e cron não geram R6", () => {
    assert.deepEqual(analisar(`export async function GET() {}`), []);
    const w = analisarArquivo({ arquivo: "apps/web/app/api/webhooks/x/route.ts", texto: `import { prisma } from "@dilon-zap/db";\nexport async function POST() {}`, modelos: MODELOS });
    assert.deepEqual(w, []);
  });
  test("passwordHash selecionado em rota de API é AVISO", () => {
    assert.deepEqual(regras(analisar(`await prisma.user.findMany({ where: { tenantId: user.tenantId }, select: { passwordHash: true } });`)), ["R7:AVISO"]);
  });
});

describe("R8: isenção", () => {
  test("isenção com motivo silencia o achado", () => {
    assert.deepEqual(analisar(`// verificar-tenant: ok — o id vem da lista já filtrada acima\nawait prisma.contact.update({ where: { id: params.id }, data: {} });`), []);
  });
  test("isenção sem motivo vira ERRO R8", () => {
    assert.deepEqual(regras(analisar(`// verificar-tenant: ok\nawait prisma.contact.update({ where: { id: params.id }, data: {} });`)), ["R8:ERRO"]);
    assert.deepEqual(regras(analisar(`// verificar-tenant: ok — ok\nawait prisma.contact.update({ where: { id: params.id }, data: {} });`)), ["R8:ERRO"]);
  });
});

describe("R9: modelo sem tenantId próprio", () => {
  test("update só por id em Message é AVISO", () => {
    assert.deepEqual(regras(analisar(`await prisma.message.update({ where: { id: m.id }, data: {} });`)), ["R9:AVISO"]);
  });
  test("com filtro de relação não há achado", () => {
    assert.deepEqual(analisar(`await prisma.message.findFirst({ where: { id: m.id, conversation: { tenantId: user.tenantId } } });`), []);
  });
});

describe("área de administração", () => {
  test("consulta sem tenantId em /admin/ é INFO (SUPERADMIN atravessa empresas)", () => {
    const a = analisar(`await prisma.contact.findMany({ where: {} });`, "apps/web/app/api/admin/contatos/route.ts");
    assert.deepEqual(regras(a), ["R1:INFO"]);
  });
});

describe("impressão digital estável", () => {
  test("mudar a linha do achado não muda a impressão", () => {
    const a = analisar(`await prisma.contact.findMany({ where: {} });`);
    const b = analisar(`\n\n\n// comentário\nawait prisma.contact.findMany({ where: {} });`);
    assert.notEqual(a[0].linha, b[0].linha);
    assert.equal(a[0].impressao, b[0].impressao);
  });
  test("duas chamadas idênticas no mesmo arquivo têm impressões diferentes", () => {
    const a = analisar(`await prisma.contact.findMany({ where: {} });\nawait prisma.contact.findMany({ where: {} });`);
    assert.equal(a.length, 2);
    assert.notEqual(a[0].impressao, a[1].impressao);
  });
});

describe("segurança da própria ferramenta", () => {
  test("o código da verificação nunca importa banco, rede nem processo filho", () => {
    for (const arq of ["analisador.ts", "modelos.ts", "cli.ts"]) {
      const fonte = readFileSync(join(__dirname, arq), "utf8");
      const imports = [...fonte.matchAll(/(?:from|require\(|import\()\s*["']([^"']+)["']/g)].map((m) => m[1]);
      for (const i of imports) {
        assert.ok(i.startsWith(".") || i.startsWith("node:fs") || i.startsWith("node:path") || i.startsWith("node:crypto") || i === "typescript", `${arq} importa "${i}", que não é permitido`);
      }
      const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.ok(!/child_process|node:http|node:https|node:net|\bfetch\(/.test(codigo), `${arq} usa rede ou processo filho`);
    }
  });
  test("o CLI nunca grava fora da linha de base", () => {
    const fonte = readFileSync(join(__dirname, "cli.ts"), "utf8");
    const gravacoes = [...fonte.matchAll(/writeFileSync\(([^,]+),/g)].map((m) => m[1].trim());
    assert.deepEqual(gravacoes, ["caminhoBase"]);
  });
});

describe("o comando de ponta a ponta", () => {
  const rodar = (arquivo: string, env: Record<string, string> = {}) =>
    spawnSync("npx", ["tsx", "scripts/verificar-tenant/cli.ts", "--sem-baseline", "--arquivo", arquivo], {
      cwd: join(__dirname, "../.."),
      encoding: "utf8",
      env: { ...process.env, ...env },
    });
  test("arquivo inseguro reprova (exit 1), mesmo com um DATABASE_URL de produção falso no ambiente", () => {
    const r = rodar("scripts/verificar-tenant/fixtures/inseguro.ts", { DATABASE_URL: "postgresql://producao.invalida:5432/x" });
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /REPROVADO/);
    assert.match(r.stdout, /R1.*inseguro\.ts/s);
    assert.match(r.stdout, /R2/);
  });
  test("arquivo no padrão certo aprova (exit 0)", () => {
    const r = rodar("scripts/verificar-tenant/fixtures/seguro.ts");
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /APROVADO/);
  });
});
