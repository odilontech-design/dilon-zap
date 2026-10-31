import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { prisma } from "@dilon-zap/db";
import { PORTA_SITE, PORTA_TUNEL_PRODUCAO, BANCO_TESTE, VARIAVEL_SENHA_USUARIOS } from "../src/config";
import { portasEmUso, testesAprovados } from "../src/riscos";
import { SLUGS, USUARIOS } from "../src/semente";
import { criarCampanhaSchema, criarPerfilSchema, editarCampanhaSchema, editarPerfilSchema } from "../../../apps/web/lib/sdr/esquemas";
import { podeSdr } from "../../../apps/web/lib/sdr/regras";
import { ErroSdr, repositorioSdr } from "../../../apps/web/lib/sdr/repositorio";
import { PLANOS, RECURSOS_GERENCIAVEIS, RECURSOS_RESTRITOS, RECURSOS_SOB_DEMANDA, TODOS_RECURSOS, recursosEfetivos, recursosGerenciaveis } from "../../../apps/web/lib/plano-regras";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizDoPacote = path.resolve(aqui, "..");
const raizRepo = path.resolve(raizDoPacote, "../..");
const BASE = `http://${BANCO_TESTE.host}:${PORTA_SITE}`;
const senha = process.env[VARIAVEL_SENHA_USUARIOS]!;

const autor = { id: "teste", name: "Teste" };
let dilonId = "";
let outraId = "";
let externaId = "";

before(async () => {
  const empresas = await prisma.tenant.findMany({ where: { slug: { in: Object.values(SLUGS) } }, select: { id: true, slug: true } });
  dilonId = empresas.find((e) => e.slug === SLUGS.dilon)!.id;
  outraId = empresas.find((e) => e.slug === SLUGS.outra)!.id;
  externaId = empresas.find((e) => e.slug === SLUGS.externa)!.id;
});

/** Cliente HTTP com cookies. Faz login de verdade pelo NextAuth do site. */
class Sessao {
  private cookies = new Map<string, string>();

  private guardarCookies(r: Response) {
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      this.cookies.set(par.slice(0, i), par.slice(i + 1));
    }
  }

  async chamar(caminho: string, metodo = "GET", corpo?: unknown) {
    const r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      redirect: "manual",
      headers: {
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    this.guardarCookies(r);
    return r;
  }

  async entrar(email: string, senhaUsada = senha): Promise<boolean> {
    const csrf = await this.chamar("/api/auth/csrf");
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrfToken, email, password: senhaUsada, callbackUrl: BASE, json: "true" }),
    });
    this.guardarCookies(r);
    return [...this.cookies.keys()].some((k) => k.includes("session-token"));
  }
}

async function logado(email: string) {
  const s = new Sessao();
  assert.equal(await s.entrar(email), true, "login recusado");
  return s;
}

const perfilValido = (nome: string) => ({
  nome,
  segmentos: ["Clínicas"],
  ufs: ["SP"],
  portes: ["ME"],
  caracteristicas: ["Atende pelo WhatsApp"],
  criterios: [{ nome: "Tem equipe de atendimento", peso: 8, obrigatorio: true }],
});

describe("regras dos recursos restritos (SDR)", () => {
  test("o SDR é um recurso restrito", () => {
    assert.deepEqual(RECURSOS_RESTRITOS, ["SDR"]);
  });
  test("nenhum recurso restrito vem em plano", () => {
    for (const r of RECURSOS_RESTRITOS) for (const p of Object.values(PLANOS)) assert.equal(p.recursos.includes(r), false, r);
  });
  test("a plataforma completa não entrega recurso restrito", () => {
    for (const r of RECURSOS_RESTRITOS) {
      assert.equal(recursosEfetivos({ plano: "ESCALA", plataformaCompleta: true }, []).has(r), false, r);
      assert.equal(TODOS_RECURSOS.includes(r), false, r);
    }
  });
  test("empresa sem assinatura não ganha recurso restrito", () => {
    for (const r of RECURSOS_RESTRITOS) assert.equal(recursosEfetivos(null, []).has(r), false, r);
  });
  test("o painel do superadmin não consegue ligar recurso restrito", () => {
    for (const r of RECURSOS_RESTRITOS) {
      assert.equal(RECURSOS_GERENCIAVEIS.includes(r), false, r);
      assert.equal(RECURSOS_SOB_DEMANDA.includes(r), false, r);
    }
  });
  test("a constante tira o recurso do painel mesmo se ele entrar por engano em outra lista", () => {
    for (const r of RECURSOS_RESTRITOS) {
      const comErro = recursosGerenciaveis([TODOS_RECURSOS, [...RECURSOS_SOB_DEMANDA, r]]);
      assert.equal(comErro.includes(r), false, r);
      assert.equal(comErro.includes("FUNIL_SAAS"), true);
      // Sem a constante o recurso passaria, o que prova que é ela quem barra.
      assert.equal(recursosGerenciaveis([TODOS_RECURSOS, [...RECURSOS_SOB_DEMANDA, r]], []).includes(r), true, r);
    }
  });
  test("só a linha em TenantRecurso liga o recurso restrito", () => {
    for (const r of RECURSOS_RESTRITOS) {
      assert.equal(recursosEfetivos({ plano: "ESSENCIAL", plataformaCompleta: false }, [{ recurso: r, ativo: true }]).has(r), true, r);
    }
  });
  test("no banco, só as empresas previstas têm o SDR", async () => {
    const linhas = await prisma.tenantRecurso.findMany({ where: { recurso: "SDR" }, select: { tenantId: true } });
    assert.deepEqual(linhas.map((l) => l.tenantId).sort(), [dilonId, outraId].sort());
  });
});

describe("permissões por perfil", () => {
  const casos: [string, string, boolean, boolean][] = [
    ["responsável lê e escreve", "OWNER", true, true],
    ["superadmin lê e escreve na própria empresa", "SUPERADMIN", true, true],
    ["financeiro só lê", "FINANCEIRO", true, false],
    ["atendente não acessa", "AGENT", false, false],
    ["papel desconhecido não acessa", "OUTRO", false, false],
  ];
  for (const [nome, papel, ler, escrever] of casos) {
    test(nome, () => {
      assert.equal(podeSdr(papel, "ler"), ler);
      assert.equal(podeSdr(papel, "escrever"), escrever);
    });
  }
  test("sem papel não acessa", () => assert.equal(podeSdr(undefined, "ler"), false));
});

describe("validação dos dados", () => {
  test("tenantId no corpo é recusado ao criar perfil", () => {
    assert.equal(criarPerfilSchema.safeParse({ ...perfilValido("X y"), tenantId: "outro" }).success, false);
  });
  test("tenantId no corpo é recusado ao editar perfil", () => {
    assert.equal(editarPerfilSchema.safeParse({ tenantId: "outro" }).success, false);
  });
  test("tenantId no corpo é recusado ao criar campanha", () => {
    assert.equal(criarCampanhaSchema.safeParse({ nome: "Xy", icpId: "1", tenantId: "outro" }).success, false);
  });
  test("tenantId no corpo é recusado ao editar campanha", () => {
    assert.equal(editarCampanhaSchema.safeParse({ tenantId: "outro" }).success, false);
  });
  test("UF, porte, CNAE e peso fora da lista são recusados", () => {
    assert.equal(criarPerfilSchema.safeParse({ nome: "Xy", ufs: ["ZZ"] }).success, false);
    assert.equal(criarPerfilSchema.safeParse({ nome: "Xy", portes: ["ENORME"] }).success, false);
    assert.equal(criarPerfilSchema.safeParse({ nome: "Xy", cnaes: ["12"] }).success, false);
    assert.equal(criarPerfilSchema.safeParse({ nome: "Xy", criterios: [{ nome: "a", peso: 11, obrigatorio: false }] }).success, false);
  });
});

describe("isolamento no repositório, com Prisma real", () => {
  const nomeA = "Repo perfil A";
  let perfilA = "";
  let perfilB = "";
  let campanhaA = "";

  before(async () => {
    perfilA = (await repositorioSdr(dilonId).criarPerfil(criarPerfilSchema.parse(perfilValido(nomeA)), autor)).id;
    perfilB = (await repositorioSdr(outraId).criarPerfil(criarPerfilSchema.parse(perfilValido("Repo perfil B")), autor)).id;
    campanhaA = (await repositorioSdr(dilonId).criarCampanha({ nome: "Repo campanha A", icpId: perfilA }, autor))!.id;
  });

  const status = (n: number) => (e: unknown) => e instanceof ErroSdr && e.status === n;

  test("repositório sem tenant não é criado", () => assert.throws(() => repositorioSdr("")));
  test("a listagem traz só os perfis da empresa", async () => {
    const ids = (await repositorioSdr(outraId).listarPerfis()).map((p) => p.id);
    assert.equal(ids.includes(perfilB), true);
    assert.equal(ids.includes(perfilA), false);
  });
  test("a listagem traz só as campanhas da empresa", async () => {
    const ids = (await repositorioSdr(outraId).listarCampanhas()).map((c) => c.id);
    assert.equal(ids.includes(campanhaA), false);
  });
  test("perfil de outra empresa não é lido", async () => {
    assert.equal(await repositorioSdr(outraId).obterPerfil(perfilA), null);
  });
  test("campanha de outra empresa não é lida", async () => {
    assert.equal(await repositorioSdr(outraId).obterCampanha(campanhaA), null);
  });
  test("perfil de outra empresa não é editado", async () => {
    await assert.rejects(repositorioSdr(outraId).editarPerfil(perfilA, { nome: "Invadido" }), status(404));
    assert.equal((await prisma.sdrIcp.findUnique({ where: { id: perfilA } }))?.nome, nomeA);
  });
  test("campanha de outra empresa não é editada", async () => {
    await assert.rejects(repositorioSdr(outraId).editarCampanha(campanhaA, { nome: "Invadida" }), status(404));
  });
  test("perfil de outra empresa não é excluído", async () => {
    await assert.rejects(repositorioSdr(outraId).excluirPerfil(perfilA), status(404));
    assert.notEqual(await prisma.sdrIcp.findUnique({ where: { id: perfilA } }), null);
  });
  test("campanha de outra empresa não é excluída", async () => {
    await assert.rejects(repositorioSdr(outraId).excluirCampanha(campanhaA), status(404));
    assert.notEqual(await prisma.sdrCampanha.findUnique({ where: { id: campanhaA } }), null);
  });
  test("campanha não usa perfil de outra empresa", async () => {
    await assert.rejects(repositorioSdr(outraId).criarCampanha({ nome: "Cruzada", icpId: perfilA }, autor), status(400));
  });
  test("editar campanha não troca para perfil de outra empresa", async () => {
    await assert.rejects(repositorioSdr(dilonId).editarCampanha(campanhaA, { icpId: perfilB }), status(400));
  });
  test("o próprio banco recusa campanha ligada a perfil de outra empresa", async () => {
    await assert.rejects(prisma.sdrCampanha.create({ data: { tenantId: outraId, nome: "Direto", icpId: perfilA } }));
  });
  test("o mesmo nome pode existir em duas empresas", async () => {
    const p = await repositorioSdr(outraId).criarPerfil(criarPerfilSchema.parse(perfilValido(nomeA)), autor);
    assert.equal(p.tenantId, outraId);
    await repositorioSdr(outraId).excluirPerfil(p.id);
  });
  test("o nome não se repete dentro da empresa", async () => {
    await assert.rejects(repositorioSdr(dilonId).criarPerfil(criarPerfilSchema.parse(perfilValido(nomeA)), autor), status(409));
  });
  test("perfil em uso não é excluído", async () => {
    await assert.rejects(repositorioSdr(dilonId).excluirPerfil(perfilA), status(409));
  });
  test("apagar uma empresa não atinge o SDR da outra", async () => {
    const t = await prisma.tenant.create({ data: { name: "Apagável", slug: "apagavel-local" } });
    const p = await repositorioSdr(t.id).criarPerfil(criarPerfilSchema.parse(perfilValido("Apagável")), autor);
    await repositorioSdr(t.id).criarCampanha({ nome: "Apagável", icpId: p.id }, autor);
    const antes = await prisma.sdrIcp.count({ where: { tenantId: dilonId } });
    await prisma.tenant.delete({ where: { id: t.id } });
    assert.equal(await prisma.sdrIcp.count({ where: { tenantId: t.id } }), 0);
    assert.equal(await prisma.sdrCampanha.count({ where: { tenantId: t.id } }), 0);
    assert.equal(await prisma.sdrIcp.count({ where: { tenantId: dilonId } }), antes);
  });
});

describe("chamada direta às APIs sem login", () => {
  const rotas: [string, string][] = [
    ["GET", "/api/sdr/icps"],
    ["POST", "/api/sdr/icps"],
    ["GET", "/api/sdr/icps/qualquer"],
    ["PATCH", "/api/sdr/icps/qualquer"],
    ["DELETE", "/api/sdr/icps/qualquer"],
    ["GET", "/api/sdr/campanhas"],
    ["POST", "/api/sdr/campanhas"],
    ["GET", "/api/sdr/campanhas/qualquer"],
    ["PATCH", "/api/sdr/campanhas/qualquer"],
    ["DELETE", "/api/sdr/campanhas/qualquer"],
  ];
  for (const [metodo, rota] of rotas) {
    test(`${metodo} ${rota} manda para o login`, async () => {
      const r = await new Sessao().chamar(rota, metodo, metodo === "GET" || metodo === "DELETE" ? undefined : {});
      assert.equal(r.status, 307);
      assert.equal(new URL(r.headers.get("location")!, BASE).pathname, "/login");
    });
  }
  test("a tela /sdr manda para o login", async () => {
    const r = await new Sessao().chamar("/sdr");
    assert.equal(r.status >= 300 && r.status < 400, true);
    assert.equal(new URL(r.headers.get("location")!, BASE).pathname, "/login");
  });
  test("cookie de sessão inventado não entra", async () => {
    const r = await fetch(`${BASE}/api/sdr/icps`, { redirect: "manual", headers: { cookie: "next-auth.session-token=inventado" } });
    assert.equal(r.status, 307);
  });
});

describe("acesso autorizado ao SDR", () => {
  let dono: Sessao;
  let perfilId = "";
  let campanhaId = "";

  before(async () => {
    dono = await logado(USUARIOS.dono);
  });

  test("a tela /sdr abre para o responsável", async () => {
    const r = await dono.chamar("/sdr");
    assert.equal(r.status, 200);
    assert.equal((await r.text()).includes("Campanhas e perfis de cliente ideal"), true);
  });
  test("cria perfil com segmento, região, porte, características e critérios", async () => {
    const r = await dono.chamar("/api/sdr/icps", "POST", perfilValido("API perfil"));
    assert.equal(r.status, 201);
    const p = (await r.json()) as { id: string; tenantId: string; segmentos: string[]; ufs: string[]; portes: string[]; caracteristicas: string[]; criterios: unknown[] };
    perfilId = p.id;
    assert.equal(p.tenantId, dilonId);
    assert.deepEqual([p.segmentos, p.ufs, p.portes, p.caracteristicas], [["Clínicas"], ["SP"], ["ME"], ["Atende pelo WhatsApp"]]);
    assert.equal(p.criterios.length, 1);
  });
  test("o perfil foi gravado na empresa da sessão", async () => {
    const linha = await prisma.sdrIcp.findUnique({ where: { id: perfilId } });
    assert.equal(linha?.tenantId, dilonId);
    assert.equal(linha?.criadoPorNome, "Dono Teste");
  });
  test("cria campanha ligada ao perfil", async () => {
    const r = await dono.chamar("/api/sdr/campanhas", "POST", { nome: "API campanha", icpId: perfilId });
    assert.equal(r.status, 201);
    const c = (await r.json()) as { id: string; status: string; icp: { id: string } };
    campanhaId = c.id;
    assert.equal(c.status, "RASCUNHO");
    assert.equal(c.icp.id, perfilId);
  });
  test("edita perfil e campanha", async () => {
    assert.equal((await dono.chamar(`/api/sdr/icps/${perfilId}`, "PATCH", { descricao: "Editado" })).status, 200);
    const r = await dono.chamar(`/api/sdr/campanhas/${campanhaId}`, "PATCH", { status: "ATIVA" });
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { status: string }).status, "ATIVA");
  });
  test("lista e lê perfil e campanha", async () => {
    const perfis = (await (await dono.chamar("/api/sdr/icps")).json()) as { perfis: { id: string }[]; podeEscrever: boolean };
    assert.equal(perfis.perfis.some((p) => p.id === perfilId), true);
    assert.equal(perfis.podeEscrever, true);
    assert.equal((await dono.chamar(`/api/sdr/campanhas/${campanhaId}`)).status, 200);
  });
  test("tenantId enviado no corpo é recusado", async () => {
    const r = await dono.chamar("/api/sdr/icps", "POST", { ...perfilValido("Forjado"), tenantId: outraId });
    assert.equal(r.status, 400);
    assert.equal(await prisma.sdrIcp.count({ where: { nome: "Forjado" } }), 0);
  });
  test("tenantId na URL é ignorado", async () => {
    const r = await dono.chamar(`/api/sdr/icps?tenantId=${outraId}`);
    const { perfis } = (await r.json()) as { perfis: { tenantId: string }[] };
    assert.equal(perfis.every((p) => p.tenantId === dilonId), true);
  });
  test("as ações ficam na auditoria da empresa", async () => {
    const n = await prisma.auditLog.count({ where: { targetTenantId: dilonId, action: { startsWith: "sdr." } } });
    assert.equal(n >= 4, true);
  });
  test("ativar campanha não dispara nada", async () => {
    assert.equal(await prisma.message.count(), 0);
    assert.equal(await prisma.scheduledMessage.count(), 0);
    assert.equal(await prisma.conversation.count(), 0);
  });
  test("exclui campanha e depois o perfil", async () => {
    const tem = await dono.chamar("/api/sdr/icps", "POST", perfilValido("API apagar"));
    const novo = ((await tem.json()) as { id: string }).id;
    const c = await dono.chamar("/api/sdr/campanhas", "POST", { nome: "API apagar", icpId: novo });
    const cid = ((await c.json()) as { id: string }).id;
    assert.equal((await dono.chamar(`/api/sdr/icps/${novo}`, "DELETE")).status, 409);
    assert.equal((await dono.chamar(`/api/sdr/campanhas/${cid}`, "DELETE")).status, 200);
    assert.equal((await dono.chamar(`/api/sdr/icps/${novo}`, "DELETE")).status, 200);
  });
});

describe("permissões por perfil nas APIs", () => {
  let perfilId = "";
  before(async () => {
    perfilId = (await repositorioSdr(dilonId).criarPerfil(criarPerfilSchema.parse(perfilValido("API permissões")), autor)).id;
  });

  test("superadmin usa o SDR da própria empresa", async () => {
    const s = await logado(USUARIOS.superadmin);
    assert.equal((await s.chamar("/api/sdr/icps")).status, 200);
    assert.equal((await s.chamar(`/api/sdr/icps/${perfilId}`, "PATCH", { descricao: "Pelo suporte" })).status, 200);
  });
  test("financeiro lê, sem poder escrever", async () => {
    const s = await logado(USUARIOS.financeiro);
    const r = await s.chamar("/api/sdr/icps");
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as { podeEscrever: boolean }).podeEscrever, false);
    assert.equal((await s.chamar("/sdr")).status, 200);
    assert.equal((await s.chamar("/api/sdr/icps", "POST", perfilValido("Do financeiro"))).status, 403);
    assert.equal((await s.chamar(`/api/sdr/icps/${perfilId}`, "PATCH", { descricao: "x" })).status, 403);
    assert.equal((await s.chamar(`/api/sdr/icps/${perfilId}`, "DELETE")).status, 403);
    assert.equal((await s.chamar("/api/sdr/campanhas", "POST", { nome: "Xy", icpId: perfilId })).status, 403);
  });
  test("atendente não lê nem escreve", async () => {
    const s = await logado(USUARIOS.atendente);
    assert.equal((await s.chamar("/api/sdr/icps")).status, 403);
    assert.equal((await s.chamar("/api/sdr/campanhas")).status, 403);
    assert.equal((await s.chamar(`/api/sdr/icps/${perfilId}`)).status, 403);
    assert.equal((await s.chamar("/api/sdr/icps", "POST", perfilValido("Do atendente"))).status, 403);
  });
  test("atendente que abre a tela volta para o painel", async () => {
    const r = await (await logado(USUARIOS.atendente)).chamar("/sdr");
    assert.equal(new URL(r.headers.get("location") ?? "/", BASE).pathname, "/painel");
  });
  test("usuário desativado não entra", async () => {
    assert.equal(await new Sessao().entrar(USUARIOS.desativado), false);
  });
  test("mudança de papel vale na hora, sem novo login", async () => {
    const s = await logado(USUARIOS.superadmin);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: USUARIOS.superadmin } });
    assert.equal((await s.chamar("/api/sdr/icps")).status, 200);
    await prisma.user.update({ where: { id: u.id }, data: { role: "AGENT" } });
    try {
      assert.equal((await s.chamar("/api/sdr/icps")).status, 403);
    } finally {
      await prisma.user.update({ where: { id: u.id }, data: { role: u.role } });
    }
  });
  test("usuário desativado com sessão aberta perde o acesso na hora", async () => {
    const s = await logado(USUARIOS.financeiro);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: USUARIOS.financeiro } });
    await prisma.user.update({ where: { id: u.id }, data: { deactivatedAt: new Date() } });
    try {
      assert.equal((await s.chamar("/api/sdr/icps")).status, 403);
    } finally {
      await prisma.user.update({ where: { id: u.id }, data: { deactivatedAt: null } });
    }
  });
});

describe("bloqueio de outras empresas nas APIs", () => {
  let perfilDilon = "";
  let campanhaDilon = "";
  let externo: Sessao;
  let outro: Sessao;

  before(async () => {
    perfilDilon = (await repositorioSdr(dilonId).criarPerfil(criarPerfilSchema.parse(perfilValido("API alvo")), autor)).id;
    campanhaDilon = (await repositorioSdr(dilonId).criarCampanha({ nome: "API alvo", icpId: perfilDilon }, autor))!.id;
    externo = await logado(USUARIOS.externo);
    outro = await logado(USUARIOS.outro);
  });

  test("empresa sem o recurso recebe 403 em toda rota", async () => {
    const chamadas: [string, string, unknown?][] = [
      ["/api/sdr/icps", "GET"],
      ["/api/sdr/icps", "POST", perfilValido("Da externa")],
      [`/api/sdr/icps/${perfilDilon}`, "GET"],
      [`/api/sdr/icps/${perfilDilon}`, "PATCH", { descricao: "x" }],
      [`/api/sdr/icps/${perfilDilon}`, "DELETE"],
      ["/api/sdr/campanhas", "GET"],
      ["/api/sdr/campanhas", "POST", { nome: "Xy", icpId: perfilDilon }],
      [`/api/sdr/campanhas/${campanhaDilon}`, "GET"],
      [`/api/sdr/campanhas/${campanhaDilon}`, "PATCH", { status: "ATIVA" }],
      [`/api/sdr/campanhas/${campanhaDilon}`, "DELETE"],
    ];
    for (const [rota, metodo, corpo] of chamadas) {
      assert.equal((await externo.chamar(rota, metodo, corpo)).status, 403, `${metodo} ${rota}`);
    }
    assert.equal(await prisma.sdrIcp.count({ where: { tenantId: externaId } }), 0);
  });
  test("empresa sem o recurso que abre a tela volta para o painel", async () => {
    const r = await externo.chamar("/sdr");
    assert.equal(new URL(r.headers.get("location") ?? "/", BASE).pathname, "/painel");
  });
  test("superadmin de empresa sem o recurso também é barrado", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: USUARIOS.externo } });
    await prisma.user.update({ where: { id: u.id }, data: { role: "SUPERADMIN" } });
    try {
      assert.equal((await externo.chamar("/api/sdr/icps")).status, 403);
    } finally {
      await prisma.user.update({ where: { id: u.id }, data: { role: "OWNER" } });
    }
  });
  test("outra empresa com o recurso não vê os cadastros pela lista", async () => {
    const p = (await (await outro.chamar("/api/sdr/icps")).json()) as { perfis: { id: string }[] };
    const c = (await (await outro.chamar("/api/sdr/campanhas")).json()) as { campanhas: { id: string }[] };
    assert.equal(p.perfis.some((x) => x.id === perfilDilon), false);
    assert.equal(c.campanhas.some((x) => x.id === campanhaDilon), false);
  });
  test("outra empresa não lê por id", async () => {
    assert.equal((await outro.chamar(`/api/sdr/icps/${perfilDilon}`)).status, 404);
    assert.equal((await outro.chamar(`/api/sdr/campanhas/${campanhaDilon}`)).status, 404);
  });
  test("outra empresa não edita por id", async () => {
    assert.equal((await outro.chamar(`/api/sdr/icps/${perfilDilon}`, "PATCH", { nome: "Invadido" })).status, 404);
    assert.equal((await outro.chamar(`/api/sdr/campanhas/${campanhaDilon}`, "PATCH", { nome: "Invadida" })).status, 404);
    assert.equal((await prisma.sdrIcp.findUnique({ where: { id: perfilDilon } }))?.nome, "API alvo");
  });
  test("outra empresa não exclui por id", async () => {
    assert.equal((await outro.chamar(`/api/sdr/campanhas/${campanhaDilon}`, "DELETE")).status, 404);
    assert.equal((await outro.chamar(`/api/sdr/icps/${perfilDilon}`, "DELETE")).status, 404);
    assert.notEqual(await prisma.sdrCampanha.findUnique({ where: { id: campanhaDilon } }), null);
  });
  test("outra empresa não liga campanha a perfil alheio", async () => {
    assert.equal((await outro.chamar("/api/sdr/campanhas", "POST", { nome: "Cruzada", icpId: perfilDilon })).status, 400);
  });
  test("tirar o recurso bloqueia a empresa na hora", async () => {
    const s = await logado(USUARIOS.outro);
    assert.equal((await s.chamar("/api/sdr/icps")).status, 200);
    await prisma.tenantRecurso.update({ where: { tenantId_recurso: { tenantId: outraId, recurso: "SDR" } }, data: { ativo: false } });
    try {
      assert.equal((await s.chamar("/api/sdr/icps")).status, 403);
    } finally {
      await prisma.tenantRecurso.update({ where: { tenantId_recurso: { tenantId: outraId, recurso: "SDR" } }, data: { ativo: true } });
    }
  });
});

describe("inicialização segura do site", () => {
  test("o site responde só em 127.0.0.1", async () => {
    const r = await fetch(`${BASE}/api/auth/csrf`);
    assert.equal(r.status, 200);
  });
  test("o que o site grava aparece no banco desta execução", async () => {
    const s = await logado(USUARIOS.dono);
    const r = await s.chamar("/api/sdr/icps", "POST", perfilValido("Prova do banco"));
    const { id } = (await r.json()) as { id: string };
    assert.notEqual(await prisma.sdrIcp.findUnique({ where: { id } }), null);
  });
  test("fora da máquina, o site não fala com o worker", () => {
    assert.equal(process.env.WORKER_INTERNAL_URL, "");
    assert.equal(process.env.WORKER_INTERNAL_SECRET, "");
  });
  test("este processo roda com a guarda e sem o .env do repositório", () => {
    const envRaiz = path.join(raizRepo, ".env");
    assert.equal((process.env.NODE_OPTIONS ?? "").includes("guarda-processo.cjs"), true);
    assert.equal(fs.existsSync(envRaiz), false);
    assert.throws(() => fs.readFileSync(envRaiz), { code: "ENOENT" });
  });
  test("carregar o .env da raiz não traz nada", () => {
    const antes = process.env.DATABASE_URL;
    const r = dotenv.config({ path: path.join(raizRepo, ".env") });
    assert.notEqual(r.error, undefined);
    assert.equal(process.env.DATABASE_URL === antes, true);
    assert.equal(process.env.NEXTAUTH_SECRET?.length, 64);
  });
});

describe("recusa quando há risco de produção", () => {
  const guarda = path.join(raizDoPacote, "src/guarda-processo.cjs");
  const executarComUrl = (url: string | undefined) => {
    const env = { ...process.env, NODE_OPTIONS: "" } as NodeJS.ProcessEnv;
    if (url === undefined) delete env.DATABASE_URL;
    else env.DATABASE_URL = url;
    return spawnSync(process.execPath, ["--require", guarda, "-e", "process.exit(0)"], { env, encoding: "utf8" });
  };
  const casos: [string, string | undefined][] = [
    ["sem DATABASE_URL", undefined],
    ["com o túnel de produção", "postgresql://u:p@localhost:5433/dilonzap"],
    ["com o IP da VPS", "postgresql://dilon_teste:p@178.104.197.156:55432/dilonzap_test"],
    ["com outro banco na mesma porta", "postgresql://dilon_teste:p@127.0.0.1:55432/dilonzap"],
    ["com host= escondido na URL", "postgresql://dilon_teste:p@127.0.0.1:55432/dilonzap_test?host=178.104.197.156"],
  ];
  for (const [nome, url] of casos) {
    test(`o processo não sobe ${nome}`, () => {
      const r = executarComUrl(url);
      assert.equal(r.status, 78);
      assert.equal(/178\.104|5433|u:p/.test(`${r.stdout}${r.stderr}`), false);
    });
  }
  test("o processo sobe com a URL do banco de teste", () => {
    assert.equal(executarComUrl("postgresql://dilon_teste:p@127.0.0.1:55432/dilonzap_test").status, 0);
  });

  test("a guarda de rede do processo bloqueia destinos externos", () => {
    const env = { ...process.env, NODE_OPTIONS: "" } as NodeJS.ProcessEnv;
    const codigo = `const net=require("net");try{net.connect({host:"178.104.197.156",port:5432});process.exit(1)}catch(e){process.exit(e.code==="EACCES"?0:2)}`;
    assert.equal(spawnSync(process.execPath, ["--require", guarda, "-e", codigo], { env }).status, 0);
  });

  const tsx = createRequire(import.meta.url).resolve("tsx");
  const rodarSite = () =>
    new Promise<{ codigo: number | null; saida: string }>((resolve) => {
      const filho = spawn(process.execPath, ["--import", new URL(`file:///${tsx.replace(/\\/g, "/")}`).href, "src/rodar-site.ts"], { env: process.env, cwd: raizDoPacote });
      let saida = "";
      filho.stdout.on("data", (d) => (saida += d));
      filho.stderr.on("data", (d) => (saida += d));
      filho.on("close", (codigo) => resolve({ codigo, saida }));
    });

  test("o comando do site recusa com o túnel de produção aberto", async () => {
    const tunel = net.createServer();
    await new Promise<void>((r) => tunel.listen(PORTA_TUNEL_PRODUCAO, "127.0.0.1", r));
    try {
      const { codigo, saida } = await rodarSite();
      assert.equal(codigo, 1);
      assert.equal(saida.includes(`porta ${PORTA_TUNEL_PRODUCAO}`), true);
      assert.equal(saida.includes("Nada foi executado"), true);
    } finally {
      await new Promise((r) => tunel.close(r));
    }
  });
  test("o comando do site recusa se a porta do banco já está ocupada", async () => {
    const { codigo, saida } = await rodarSite();
    assert.equal(codigo, 1);
    assert.equal(saida.includes(`porta ${BANCO_TESTE.porta}`), true);
  });
  test("teste reprovado nunca conta como aprovado", () => {
    const relatorio = (pass: number, fail: number, cancelled = 0) => `ℹ tests 9\nℹ pass ${pass}\nℹ fail ${fail}\nℹ cancelled ${cancelled}\n`;
    assert.equal(testesAprovados(0, relatorio(9, 0)), true);
    assert.equal(testesAprovados(0, relatorio(8, 1)), false);
    assert.equal(testesAprovados(0, relatorio(8, 0, 1)), false);
    assert.equal(testesAprovados(1, relatorio(9, 0)), false);
    assert.equal(testesAprovados(0, relatorio(0, 0)), false);
    assert.equal(testesAprovados(0, "sem relatório"), false);
  });
  test("a leitura do netstat acha portas ocupadas", () => {
    const saida = "  TCP    127.0.0.1:5433    0.0.0.0:0    LISTENING    123\n  TCP    127.0.0.1:50000    127.0.0.1:5432    ESTABLISHED    9\n";
    assert.deepEqual(portasEmUso(saida, [5433, 5432, 55432]), [5433]);
  });
});

after(async () => {
  await prisma.$disconnect();
});
