import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { prisma } from "@dilon-zap/db";
import { RODAPE_DE_DESCADASTRO, corpoDoEmail } from "../../sdr-core/src/canais";
import { ErroSdrCore } from "../../sdr-core/src/erros";
import { sdrDoTenant, type EnviadorDeEmail, type MensagemDeEmail } from "../../sdr-core/src/index";
import { espelharNoCrm, garantirNegociacao } from "../../../apps/web/lib/sdr/crm";
import { converterEmNegociacao } from "../../../apps/web/lib/sdr/converter";
import { criarEnviadorSmtp, lerConfigSmtp, limitesDoSdr } from "../../../apps/web/lib/sdr/smtp";
import { USUARIOS } from "../src/semente";
import { Sessao, logado } from "./ajudantes";
import { cnpjDe } from "./dados";

/**
 * Saída por e-mail e por WhatsApp, e o espelho no CRM. Nada aqui fala com servidor de e-mail nem com o WhatsApp de
 * verdade: o envio é trocado por um falso, e o WhatsApp só abre uma tela (que o sistema nem alcança nos testes).
 */

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../../..");
const autor = { id: "u-teste", name: "Felipe Teste" };
const dia = 86_400_000;
const status = (n: number) => (e: unknown) => e instanceof ErroSdrCore && e.status === n;

let tenantE = "";
let tenantF = "";
let dilonId = "";

const C = (t = tenantE) => sdrDoTenant(t).comercial;

async function empresa(tenantId: string, nome: string, extra: Record<string, unknown> = {}) {
  return prisma.sdrEmpresa.create({ data: { tenantId, razaoSocial: `${nome} Ltda`, nomeFantasia: nome, chaveNome: nome.toLowerCase(), uf: "RJ", cidade: "Rio de Janeiro", segmento: "Limpeza", ...extra } });
}

function enviadorFalso(opcoes: { configurado?: boolean; falha?: () => Error | null; atrasoMs?: number } = {}) {
  const mensagens: MensagemDeEmail[] = [];
  const enviador: EnviadorDeEmail = {
    configurado: () => opcoes.configurado ?? true,
    remetente: () => ({ nome: "Dilon Tech", email: "felipe@dilontech.teste" }),
    async enviar(m) {
      if (opcoes.atrasoMs) await new Promise((r) => setTimeout(r, opcoes.atrasoMs));
      const erro = opcoes.falha?.();
      if (erro) throw erro;
      mensagens.push(m);
      return { messageId: `<${mensagens.length}@teste>` };
    },
  };
  return { enviador, mensagens };
}

/** Abordagem pronta e aprovada para enviar. */
async function aprovada(tenantId: string, empresaId: string, canal: "EMAIL" | "WHATSAPP" | "LIGACAO" | "MENSAGEM" = "EMAIL", texto?: string, assunto: string | null = "Assunto do teste") {
  const ab = await C(tenantId).criarAbordagem(empresaId, { produto: "DILON_ZAP", canal, texto: texto ?? "Olá! Texto da abordagem de teste, sem aviso nenhum.", assunto: canal === "EMAIL" ? assunto : null }, autor);
  await C(tenantId).aprovarAbordagem(ab.id, autor);
  return ab.id;
}

before(async () => {
  tenantE = (await prisma.tenant.create({ data: { name: "canais-e", slug: "canais-teste-e" } })).id;
  tenantF = (await prisma.tenant.create({ data: { name: "canais-f", slug: "canais-teste-f" } })).id;
  dilonId = (await prisma.tenant.findFirstOrThrow({ where: { slug: "dilon-tech-local" } })).id;
});
after(async () => {
  await prisma.tenant.deleteMany({ where: { id: { in: [tenantE, tenantF] } } });
});

describe("e-mail pelo sistema", () => {
  let emp = "";
  before(async () => {
    emp = (await empresa(tenantE, "Alfa Mail", { email: "contato@alfamail.com.br", emailDominio: "alfamail.com.br", telefone: "5521911112222" })).id;
    await C().salvar(emp, { decisorEmail: "diretor@alfamail.com.br" }, autor);
  });

  test("sem configuração no servidor, não envia e não grava nada", async () => {
    const id = await aprovada(tenantE, emp);
    const f = enviadorFalso({ configurado: false });
    await assert.rejects(() => C().enviarEmail(id, {}, autor, f.enviador, 20), status(503));
    assert.equal(await prisma.sdrEnvioEmail.count({ where: { tenantId: tenantE } }), 0);
    const sit = await C().situacaoDoEmail(f.enviador, 20);
    assert.deepEqual([sit.configurado, sit.de], [false, null]);
  });
  test("só envia abordagem aprovada, com texto idêntico ao aprovado e com assunto", async () => {
    const f = enviadorFalso();
    const rascunho = await C().criarAbordagem(emp, { produto: "DILON_ZAP", canal: "EMAIL", texto: "Texto ainda sem aprovação.", assunto: "Assunto" }, autor);
    await assert.rejects(() => C().enviarEmail(rascunho.id, {}, autor, f.enviador, 20), status(409));
    await C().aprovarAbordagem(rascunho.id, autor);
    await prisma.sdrAbordagem.update({ where: { id: rascunho.id }, data: { texto: "Texto trocado por fora da aprovação." } });
    await assert.rejects(() => C().enviarEmail(rascunho.id, {}, autor, f.enviador, 20), status(409));
    const semAssunto = await aprovada(tenantE, emp, "EMAIL", "Texto sem assunto.", "   ");
    await assert.rejects(() => C().enviarEmail(semAssunto, {}, autor, f.enviador, 20), status(409));
    assert.equal(f.mensagens.length, 0);
  });
  test("e-mail do tipo errado não sai", async () => {
    const f = enviadorFalso();
    const id = await aprovada(tenantE, emp, "LIGACAO");
    await assert.rejects(() => C().enviarEmail(id, {}, autor, f.enviador, 20), status(409));
    assert.equal(f.mensagens.length, 0);
  });
  test("envia em nome de quem está logado, para o decisor, com o rodapé de descadastro, e registra o contato", async () => {
    const f = enviadorFalso();
    const id = await aprovada(tenantE, emp, "EMAIL", "Olá! Texto exato aprovado.", "Assunto aprovado");
    const quando = new Date(Date.now() + 3 * dia).toISOString();
    const r = await C().enviarEmail(id, { proximaAcao: "Fazer follow-up", proximaAcaoEm: quando }, autor, f.enviador, 20);
    assert.equal(f.mensagens.length, 1);
    const m = f.mensagens[0];
    assert.deepEqual([m.de.nome, m.de.email, m.para, m.assunto], ["Felipe Teste", "felipe@dilontech.teste", "diretor@alfamail.com.br", "Assunto aprovado"]);
    assert.equal(m.texto.startsWith("Olá! Texto exato aprovado."), true);
    assert.equal(m.texto.endsWith(RODAPE_DE_DESCADASTRO), true);
    assert.match(m.cabecalhos["List-Unsubscribe"], /^<mailto:felipe@dilontech\.teste\?subject=nao-contatar>$/);
    const envio = await prisma.sdrEnvioEmail.findUniqueOrThrow({ where: { id: r.envioId } });
    assert.deepEqual([envio.status, envio.messageId, envio.para, envio.corpo, envio.enviadoPorNome], ["ENVIADO", "<1@teste>", "diretor@alfamail.com.br", m.texto, "Felipe Teste"]);
    const f2 = await C().ficha(emp);
    assert.deepEqual([f2.acompanhamento.etapa, f2.acompanhamento.proximaAcaoEm?.toISOString(), f2.acompanhamento.proximaAcao], ["CONTATADA", quando, "Fazer follow-up"]);
    const contato = f2.interacoes.find((i) => i.tipo === "CONTATO" && i.abordagemId === id)!;
    assert.deepEqual([contato.canal, contato.resultado], ["EMAIL", "e-mail enviado pelo sistema para diretor@alfamail.com.br"]);
  });
  test("o mesmo e-mail não sai duas vezes para o mesmo destinatário", async () => {
    const f = enviadorFalso();
    const id = await aprovada(tenantE, emp);
    await C().enviarEmail(id, {}, autor, f.enviador, 20);
    await assert.rejects(() => C().enviarEmail(id, {}, autor, f.enviador, 20), (e) => status(409)(e) && /já foi enviado/.test((e as Error).message));
    assert.equal(f.mensagens.length, 1);
    // Outro destinatário é outro envio.
    await C().enviarEmail(id, { para: "outra.pessoa@alfamail.com.br" }, autor, f.enviador, 20);
    assert.equal(f.mensagens.length, 2);
  });
  test("dois cliques ao mesmo tempo: só um envio de verdade", async () => {
    const f = enviadorFalso({ atrasoMs: 200 });
    const id = await aprovada(tenantE, emp);
    const rs = await Promise.allSettled([C().enviarEmail(id, {}, autor, f.enviador, 20), C().enviarEmail(id, {}, autor, f.enviador, 20)]);
    assert.equal(rs.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(rs.filter((r) => r.status === "rejected").length, 1);
    assert.equal(f.mensagens.length, 1);
  });
  test("falha no servidor de e-mail: nada é registrado como contato, e dá para tentar de novo na mesma linha", async () => {
    let falhar = true;
    const f = enviadorFalso({ falha: () => (falhar ? new Error("535 autenticação recusada") : null) });
    const id = await aprovada(tenantE, emp);
    await assert.rejects(() => C().enviarEmail(id, {}, autor, f.enviador, 20), (e) => status(502)(e) && /autenticação recusada/.test((e as Error).message));
    const linhas = await prisma.sdrEnvioEmail.findMany({ where: { abordagemId: id } });
    assert.deepEqual(linhas.map((l) => l.status), ["FALHOU"]);
    assert.equal((await C().ficha(emp)).interacoes.some((i) => i.tipo === "CONTATO" && i.abordagemId === id), false);
    falhar = false;
    await C().enviarEmail(id, {}, autor, f.enviador, 20);
    assert.deepEqual((await prisma.sdrEnvioEmail.findMany({ where: { abordagemId: id } })).map((l) => l.status), ["ENVIADO"]);
  });
  test("o limite diário trava os envios seguintes", async () => {
    const t = (await prisma.tenant.create({ data: { name: "canais-limite", slug: "canais-teste-limite" } })).id;
    try {
      const e = (await empresa(t, "Limite", { email: "oi@limite.com.br" })).id;
      const f = enviadorFalso();
      const um = await aprovada(t, e, "EMAIL", "Primeiro texto.");
      const dois = await aprovada(t, e, "EMAIL", "Segundo texto.");
      const tres = await aprovada(t, e, "EMAIL", "Terceiro texto.");
      await sdrDoTenant(t).comercial.enviarEmail(um, {}, autor, f.enviador, 2);
      await sdrDoTenant(t).comercial.enviarEmail(dois, {}, autor, f.enviador, 2);
      await assert.rejects(() => sdrDoTenant(t).comercial.enviarEmail(tres, {}, autor, f.enviador, 2), (er) => status(429)(er) && /limite de 2/.test((er as Error).message));
      assert.equal(f.mensagens.length, 2);
      assert.deepEqual([(await sdrDoTenant(t).comercial.situacaoDoEmail(f.enviador, 2)).enviadosHoje], [2]);
    } finally {
      await prisma.tenant.delete({ where: { id: t } });
    }
  });
  test("destinatário ou domínio bloqueado, empresa bloqueada e 'não contatar' não recebem", async () => {
    const t = (await prisma.tenant.create({ data: { name: "canais-bloq", slug: "canais-teste-bloq" } })).id;
    try {
      const V = sdrDoTenant(t).comercial;
      const f = enviadorFalso();
      const e = (await empresa(t, "Bloq", { email: "oi@bloq.com.br", emailDominio: "bloq.com.br", cnpj: cnpjDe(7001) })).id;
      const id = await aprovada(t, e);
      await prisma.sdrSupressao.create({ data: { tenantId: t, tipo: "EMAIL", valor: "x@outro.com.br", motivo: "OPOSICAO" } });
      await assert.rejects(() => V.enviarEmail(id, { para: "x@outro.com.br" }, autor, f.enviador, 20), status(409));
      await prisma.sdrSupressao.create({ data: { tenantId: t, tipo: "DOMINIO", valor: "proibido.com.br", motivo: "OPOSICAO" } });
      await assert.rejects(() => V.enviarEmail(id, { para: "qualquer@proibido.com.br" }, autor, f.enviador, 20), status(409));
      await prisma.sdrSupressao.create({ data: { tenantId: t, tipo: "CNPJ", valor: cnpjDe(7001), motivo: "EMPRESA_BLOQUEADA" } });
      await assert.rejects(() => V.enviarEmail(id, {}, autor, f.enviador, 20), status(409));
      assert.equal(f.mensagens.length, 0);
      assert.equal(await prisma.sdrEnvioEmail.count({ where: { tenantId: t } }), 0);
    } finally {
      await prisma.tenant.delete({ where: { id: t } });
    }
  });
  test("sem e-mail de destino, e-mail inválido e campos estranhos são recusados", async () => {
    const f = enviadorFalso();
    const semEmail = (await empresa(tenantE, "Sem Email")).id;
    const id = await aprovada(tenantE, semEmail);
    await assert.rejects(() => C().enviarEmail(id, {}, autor, f.enviador, 20), status(422));
    await assert.rejects(() => C().enviarEmail(id, { para: "isto-nao-e-email" }, autor, f.enviador, 20), status(400));
    await assert.rejects(() => C().enviarEmail(id, { tenantId: "outro" }, autor, f.enviador, 20));
    await assert.rejects(() => C().enviarEmail(id, { texto: "outro texto" }, autor, f.enviador, 20));
    assert.equal(f.mensagens.length, 0);
  });
  test("outra organização não envia nem enxerga", async () => {
    const f = enviadorFalso();
    const id = await aprovada(tenantE, emp);
    await assert.rejects(() => C(tenantF).enviarEmail(id, {}, autor, f.enviador, 20), status(404));
    assert.equal(await prisma.sdrEnvioEmail.count({ where: { tenantId: tenantF } }), 0);
  });
  test("o rodapé só é acrescentado quando o texto ainda não tem aviso de descadastro", () => {
    assert.equal(corpoDoEmail("Olá.").endsWith(RODAPE_DE_DESCADASTRO), true);
    assert.equal(corpoDoEmail("Olá. Se preferir não receber contato, é só avisar."), "Olá. Se preferir não receber contato, é só avisar.");
    assert.equal(corpoDoEmail("Olá.\n\n\n").startsWith("Olá.\n\n--\n"), true);
  });
});

describe("SMTP (adaptador)", () => {
  const env = { SDR_SMTP_HOST: "smtp.exemplo.teste", SDR_SMTP_PORT: "587", SDR_SMTP_USER: "felipe@dilontech.teste", SDR_SMTP_PASS: "senha-super-secreta-9", SDR_SMTP_FROM: "felipe@dilontech.teste" };

  test("sem host, usuário ou senha, o envio fica desligado", () => {
    assert.equal(lerConfigSmtp({}), null);
    assert.equal(lerConfigSmtp({ ...env, SDR_SMTP_PASS: "" }), null);
    assert.equal(lerConfigSmtp({ ...env, SDR_SMTP_PORT: "abc" }), null);
    assert.equal(criarEnviadorSmtp({ env: {} }).configurado(), false);
  });
  test("porta 587 usa STARTTLS e 465 usa TLS direto", () => {
    assert.deepEqual([lerConfigSmtp(env)!.port, lerConfigSmtp(env)!.secure], [587, false]);
    assert.equal(lerConfigSmtp({ ...env, SDR_SMTP_PORT: "465" })!.secure, true);
    assert.equal(lerConfigSmtp({ ...env, SDR_SMTP_FROM: undefined })!.from, "felipe@dilontech.teste");
  });
  test("monta a mensagem certa, com responder-para e descadastro, e sem expor a senha", async () => {
    const chamadas: { opcoes: any; mensagem: any }[] = [];
    const enviador = criarEnviadorSmtp({
      env,
      criarTransporte: ((opcoes: any) => ({ sendMail: async (mensagem: any) => (chamadas.push({ opcoes, mensagem }), { messageId: "<abc@x>" }), close() {} })) as never,
    });
    assert.equal(enviador.configurado(), true);
    const r = await enviador.enviar({ de: { nome: "Felipe", email: "ignorado@x.com" }, para: "alvo@empresa.com.br", assunto: "Oi", texto: "Corpo", cabecalhos: { "List-Unsubscribe": "<mailto:felipe@dilontech.teste>" } });
    assert.equal(r.messageId, "<abc@x>");
    const { opcoes, mensagem } = chamadas[0];
    assert.deepEqual([opcoes.host, opcoes.port, opcoes.secure, opcoes.requireTLS, opcoes.auth.user], ["smtp.exemplo.teste", 587, false, true, "felipe@dilontech.teste"]);
    assert.equal(opcoes.connectionTimeout > 0 && opcoes.socketTimeout > 0, true);
    // O endereço de saída é sempre o da caixa configurada: o nome é de quem está logado.
    assert.deepEqual([mensagem.from, mensagem.replyTo, mensagem.to, mensagem.subject, mensagem.text], [{ name: "Felipe", address: "felipe@dilontech.teste" }, "felipe@dilontech.teste", "alvo@empresa.com.br", "Oi", "Corpo"]);
    assert.equal(mensagem.headers["List-Unsubscribe"], "<mailto:felipe@dilontech.teste>");
  });
  test("erro do servidor de e-mail nunca devolve a senha", async () => {
    const enviador = criarEnviadorSmtp({ env, criarTransporte: (() => ({ sendMail: async () => Promise.reject(new Error("Invalid login: senha-super-secreta-9 recusada")), close() {} })) as never });
    await assert.rejects(() => enviador.enviar({ de: { nome: "F", email: "f@x.com" }, para: "a@b.com", assunto: "x", texto: "y", cabecalhos: {} }), (e: Error) => !e.message.includes("senha-super-secreta-9") && e.message.includes("[oculto]"));
  });
  test("sem configuração, enviar nem cria transporte", async () => {
    let criou = false;
    const enviador = criarEnviadorSmtp({ env: {}, criarTransporte: (() => ((criou = true), {})) as never });
    await assert.rejects(() => enviador.enviar({ de: { nome: "F", email: "f@x.com" }, para: "a@b.com", assunto: "x", texto: "y", cabecalhos: {} }));
    assert.equal(criou, false);
  });
  test("os limites têm padrão baixo e teto", () => {
    assert.deepEqual(limitesDoSdr({}), { emailPorDia: 20, whatsapp: { limiteDiario: 10, intervaloMinimoSegundos: 90 } });
    assert.equal(limitesDoSdr({ SDR_EMAIL_LIMITE_DIARIO: "5000" }).emailPorDia, 200);
    assert.equal(limitesDoSdr({ SDR_EMAIL_LIMITE_DIARIO: "-3" }).emailPorDia, 20);
    assert.equal(limitesDoSdr({ SDR_WHATSAPP_LIMITE_DIARIO: "999" }).whatsapp.limiteDiario, 50);
  });
  test("a senha só é lida em smtp.ts", () => {
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!["node_modules", ".next"].includes(e.name)) varrer(p);
        } else if (/\.(ts|tsx)$/.test(e.name) && /SDR_SMTP_PASS/.test(fs.readFileSync(p, "utf8"))) achados.push(path.relative(raiz, p).replace(/\\/g, "/"));
      }
    };
    varrer(path.join(raiz, "apps"));
    varrer(path.join(raiz, "packages/sdr-core"));
    assert.deepEqual(achados, ["apps/web/lib/sdr/smtp.ts"]);
  });
});

describe("WhatsApp: uma conversa por clique, sem envio pelo sistema", () => {
  let t = "";
  let emp = "";
  const W = () => sdrDoTenant(t).comercial;
  const livre = { limiteDiario: 10, intervaloMinimoSegundos: 0 };

  before(async () => {
    t = (await prisma.tenant.create({ data: { name: "canais-wa", slug: "canais-teste-wa" } })).id;
    emp = (await empresa(t, "Zap Alvo", { telefone: "5521933334444" })).id;
  });
  after(async () => {
    await prisma.tenant.delete({ where: { id: t } });
  });

  test("a mensagem curta de WhatsApp usa só os dados cadastrados", async () => {
    const m = await W().criarAbordagem(emp, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "x", modelo: true }, autor);
    assert.equal(m.assunto, null);
    assert.match(m.texto, /Zap Alvo/);
    assert.match(m.texto, /não receber mensagens/);
    assert.equal(m.texto.length < 400, true);
  });
  test("abre a conversa com a mensagem aprovada, o telefone certo e o nome, e registra a abertura", async () => {
    const id = await aprovada(t, emp, "WHATSAPP", "Olá, tudo bem? Posso te apresentar o Dilon Zap?");
    const mensagensAntes = await prisma.message.count();
    const r = await W().abrirConversaNoWhatsapp(id, autor, livre);
    assert.equal(r.telefone, "5521933334444");
    const u = new URL(r.url, "http://x");
    assert.equal(u.pathname, "/abrir-conversa");
    assert.deepEqual([u.searchParams.get("telefone"), u.searchParams.get("nome"), u.searchParams.get("mensagem")], ["5521933334444", "Zap Alvo", "Olá, tudo bem? Posso te apresentar o Dilon Zap?"]);
    const h = (await W().ficha(emp)).interacoes.find((i) => i.resultado?.startsWith("conversa aberta no WhatsApp"))!;
    assert.deepEqual([h.tipo, h.canal, h.abordagemId], ["ABORDAGEM", "WHATSAPP", id]);
    // Abrir não é contatar: a empresa segue "não contatada" até a pessoa registrar o contato.
    assert.equal((await W().ficha(emp)).acompanhamento.etapa, "NAO_CONTATADA");
    assert.equal(await prisma.message.count(), mensagensAntes);
    assert.equal(await prisma.contact.count({ where: { tenantId: t } }), 0);
  });
  test("o telefone do decisor tem preferência sobre o da empresa", async () => {
    const e = (await empresa(t, "Com Decisor", { telefone: "5521900000001" })).id;
    await W().salvar(e, { decisorTelefone: "(21) 98888-7777" }, autor);
    const id = await aprovada(t, e, "WHATSAPP", "Mensagem de teste para o decisor.");
    assert.equal((await W().abrirConversaNoWhatsapp(id, autor, livre)).telefone, "5521988887777");
  });
  test("só abre mensagem aprovada, de WhatsApp, com o texto idêntico ao aprovado", async () => {
    const e = (await empresa(t, "Regras Wa", { telefone: "5521900000002" })).id;
    const rascunho = await W().criarAbordagem(e, { produto: "DILON_ZAP", canal: "WHATSAPP", texto: "Rascunho ainda sem aprovar." }, autor);
    await assert.rejects(() => W().abrirConversaNoWhatsapp(rascunho.id, autor, livre), status(409));
    await W().aprovarAbordagem(rascunho.id, autor);
    await prisma.sdrAbordagem.update({ where: { id: rascunho.id }, data: { texto: "Trocado por fora." } });
    await assert.rejects(() => W().abrirConversaNoWhatsapp(rascunho.id, autor, livre), status(409));
    const email = await aprovada(t, e, "EMAIL");
    await assert.rejects(() => W().abrirConversaNoWhatsapp(email, autor, livre), status(409));
  });
  test("sem telefone, com telefone inválido ou bloqueado, ou empresa bloqueada: não abre", async () => {
    const sem = (await empresa(t, "Sem Telefone")).id;
    const idSem = await aprovada(t, sem, "WHATSAPP");
    await assert.rejects(() => W().abrirConversaNoWhatsapp(idSem, autor, livre), status(422));
    const bloqueado = (await empresa(t, "Tel Bloqueado", { telefone: "5521955556666" })).id;
    const idB = await aprovada(t, bloqueado, "WHATSAPP", "Mensagem para telefone que será bloqueado.");
    await prisma.sdrSupressao.create({ data: { tenantId: t, tipo: "TELEFONE", valor: "5521955556666", motivo: "OPOSICAO" } });
    await assert.rejects(() => W().abrirConversaNoWhatsapp(idB, autor, livre), status(409));
  });
  test("intervalo mínimo e limite diário seguram a rajada", async () => {
    const t2 = (await prisma.tenant.create({ data: { name: "canais-wa2", slug: "canais-teste-wa2" } })).id;
    try {
      const X = sdrDoTenant(t2).comercial;
      const e1 = (await empresa(t2, "Um", { telefone: "5521900001111" })).id;
      const e2 = (await empresa(t2, "Dois", { telefone: "5521900002222" })).id;
      const e3 = (await empresa(t2, "Tres", { telefone: "5521900003333" })).id;
      const [a1, a2, a3] = [await aprovada(t2, e1, "WHATSAPP", "Mensagem um de teste."), await aprovada(t2, e2, "WHATSAPP", "Mensagem dois de teste."), await aprovada(t2, e3, "WHATSAPP", "Mensagem três de teste.")];
      assert.equal((await X.abrirConversaNoWhatsapp(a1, autor, { limiteDiario: 2, intervaloMinimoSegundos: 3600 })).restantesHoje, 1);
      await assert.rejects(() => X.abrirConversaNoWhatsapp(a2, autor, { limiteDiario: 2, intervaloMinimoSegundos: 3600 }), (e) => status(429)(e) && /aguarde/.test((e as Error).message));
      await X.abrirConversaNoWhatsapp(a2, autor, { limiteDiario: 2, intervaloMinimoSegundos: 0 });
      await assert.rejects(() => X.abrirConversaNoWhatsapp(a3, autor, { limiteDiario: 2, intervaloMinimoSegundos: 0 }), (e) => status(429)(e) && /limite de 2/.test((e as Error).message));
    } finally {
      await prisma.tenant.delete({ where: { id: t2 } });
    }
  });
  test("outra organização não abre conversa", async () => {
    const id = await aprovada(t, emp, "WHATSAPP", "Mensagem de teste de isolamento.");
    await assert.rejects(() => sdrDoTenant(tenantF).comercial.abrirConversaNoWhatsapp(id, autor, livre), status(404));
  });
  test("a tela de abrir conversa só envia depois do clique em Enviar", () => {
    const pagina = fs.readFileSync(path.join(raiz, "apps/web/app/(dashboard)/abrir-conversa/page.tsx"), "utf8");
    assert.match(pagina, /um link nunca\s+\* dispara mensagem sozinho/);
  });
});

describe("espelho no CRM", () => {
  let t = "";
  let userId = "";
  let funilId = "";
  let primeiraEtapa = "";
  const acessoDe = (tenantId: string) => ({ user: { id: userId, name: "Felipe Teste", email: "f@t.teste", tenantId, role: "OWNER" }, sdr: sdrDoTenant(tenantId), podeEscrever: true }) as never;
  const criarNegociacaoFalsa = (async (a: any) =>
    prisma.negociacao.create({
      data: { tenantId: a.tenantId, contactId: a.contactId, funilId: a.funilId, stageId: a.stageId, titulo: a.titulo, valorCents: 0, recorrencia: "UNICA", valorMensalCents: 0, responsavelId: a.responsavelId, origem: a.origem },
    })) as never;
  const deps = (empresaId: string, tenantId = t) => ({ acesso: acessoDe(tenantId), empresaId, prisma, criarNegociacao: criarNegociacaoFalsa });

  before(async () => {
    t = (await prisma.tenant.create({ data: { name: "canais-crm", slug: "canais-teste-crm" } })).id;
    userId = (await prisma.user.create({ data: { tenantId: t, email: "crm@canais.teste", name: "Felipe Teste", role: "OWNER", passwordHash: "x" } })).id;
    funilId = (await prisma.funil.create({ data: { tenantId: t, nome: "Prospecção Ativa" } })).id;
    primeiraEtapa = (await prisma.stage.create({ data: { tenantId: t, funilId, name: "Contato inicial", position: 0 } })).id;
    await prisma.stage.create({ data: { tenantId: t, funilId, name: "Reunião", position: 1 } });
  });
  after(async () => {
    await prisma.tenant.delete({ where: { id: t } });
  });

  const contatoRegistrado = async (empresaId: string, extra: Record<string, unknown> = {}) => {
    const id = await aprovada(t, empresaId, "EMAIL", `Texto ${Math.random().toString(36).slice(2)} da abordagem.`);
    return { id, r: await sdrDoTenant(t).comercial.registrarContato(id, { canal: "EMAIL", resultado: "enviado", ...extra }, autor) };
  };

  test("o primeiro contato cria contato e negociação no funil, em nome do responsável, e vincula no SDR", async () => {
    const e = (await empresa(t, "Crm Um", { telefone: "5521944445555" })).id;
    await sdrDoTenant(t).comercial.salvar(e, { decisorNome: "Ana Souza", produto: "DILON_FACILITIES" }, autor);
    const quando = new Date(Date.now() + 3 * dia);
    const { r } = await contatoRegistrado(e, { proximaAcao: "Ligar para a Ana", proximaAcaoEm: quando.toISOString() });
    const crm = await espelharNoCrm(deps(e), { tipo: "CONTATO", canal: "EMAIL", resultado: "enviado", assunto: "Assunto", texto: r.interacao.texto ?? "", proximaAcao: "Ligar para a Ana", proximaAcaoEm: quando });
    assert.equal(crm.ok, true);
    if (!crm.ok) return;
    assert.equal(crm.criada, true);
    const neg = await prisma.negociacao.findUniqueOrThrow({ where: { id: crm.negociacaoId }, include: { contact: true } });
    assert.deepEqual([neg.funilId, neg.stageId, neg.responsavelId, neg.origem, neg.contact.waJid, neg.contact.name], [funilId, primeiraEtapa, userId, "SDR", "5521944445555@s.whatsapp.net", "Ana Souza (Crm Um)"]);
    assert.match(neg.titulo, /Crm Um — Dilon Facilities/);
    const nota = await prisma.negociacaoNota.findFirstOrThrow({ where: { negociacaoId: crm.negociacaoId } });
    assert.match(nota.texto, /^SDR · Contato registrado \(e-mail\) — enviado\nAssunto: Assunto\n\n/);
    assert.equal(nota.porNome, "Felipe Teste");
    const tarefa = await prisma.tarefaNegociacao.findFirstOrThrow({ where: { negociacaoId: crm.negociacaoId } });
    assert.deepEqual([tarefa.titulo, tarefa.tipo, tarefa.venceEm.toISOString(), tarefa.responsavelId, tarefa.concluidaEm], ["SDR: Ligar para a Ana", "EMAIL", quando.toISOString(), userId, null]);
    const ficha = await sdrDoTenant(t).comercial.ficha(e);
    assert.deepEqual([ficha.acompanhamento.negociacaoId, ficha.acompanhamento.etapa], [crm.negociacaoId, "CONTATADA"]);
    assert.equal(ficha.interacoes.some((i) => i.tipo === "CRM"), true);
  });
  test("o segundo contato usa a mesma negociação, anota de novo e troca o follow-up", async () => {
    const e = (await empresa(t, "Crm Dois", { telefone: "5521944446666" })).id;
    const primeiro = await contatoRegistrado(e);
    const a = await espelharNoCrm(deps(e), { tipo: "CONTATO", canal: "EMAIL", texto: primeiro.r.interacao.texto ?? "", proximaAcaoEm: new Date(Date.now() + dia) });
    const segundo = await contatoRegistrado(e);
    const b = await espelharNoCrm(deps(e), { tipo: "CONTATO", canal: "LIGACAO", texto: segundo.r.interacao.texto ?? "", proximaAcao: "Cobrar resposta", proximaAcaoEm: new Date(Date.now() + 2 * dia) });
    assert.equal(a.ok && b.ok && a.negociacaoId === b.negociacaoId && !b.criada, true);
    if (!a.ok) return;
    assert.equal(await prisma.negociacao.count({ where: { tenantId: t, contact: { phoneNumber: null, waJid: "5521944446666@s.whatsapp.net" } } }), 1);
    assert.equal(await prisma.negociacaoNota.count({ where: { negociacaoId: a.negociacaoId } }), 2);
    const tarefas = await prisma.tarefaNegociacao.findMany({ where: { negociacaoId: a.negociacaoId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(tarefas.map((x) => [x.titulo, x.tipo, x.concluidaEm !== null]), [["SDR: Fazer follow-up", "EMAIL", true], ["SDR: Cobrar resposta", "LIGACAO", false]]);
  });
  test("a resposta vira nota; sem interesse e não contatar encerram as tarefas do SDR; tarefas de outras origens ficam", async () => {
    const e = (await empresa(t, "Crm Tres", { telefone: "5521944447777" })).id;
    const c = await contatoRegistrado(e);
    const neg = await espelharNoCrm(deps(e), { tipo: "CONTATO", canal: "EMAIL", texto: c.r.interacao.texto ?? "", proximaAcaoEm: new Date(Date.now() + dia) });
    if (!neg.ok) throw new Error(neg.motivo);
    await prisma.tarefaNegociacao.create({ data: { tenantId: t, negociacaoId: neg.negociacaoId, titulo: "Tarefa manual do vendedor", tipo: "TAREFA", venceEm: new Date(Date.now() + dia), responsavelId: userId } });
    const r = await espelharNoCrm(deps(e), { tipo: "RESPOSTA", etapa: "RESPONDEU", nota: "Pediu para falar semana que vem" });
    assert.equal(r.ok, true);
    assert.equal((await prisma.negociacaoNota.findFirstOrThrow({ where: { negociacaoId: neg.negociacaoId }, orderBy: { em: "desc" } })).texto, "SDR · respondeu: Pediu para falar semana que vem");
    // Respondeu: o lembrete de "sem resposta" do SDR deixa de valer, e a tarefa manual continua aberta.
    const abertas = await prisma.tarefaNegociacao.findMany({ where: { negociacaoId: neg.negociacaoId, concluidaEm: null } });
    assert.deepEqual(abertas.map((x) => x.titulo), ["Tarefa manual do vendedor"]);
    await espelharNoCrm(deps(e), { tipo: "RESPOSTA", etapa: "SEM_INTERESSE" });
    assert.equal((await prisma.tarefaNegociacao.findMany({ where: { negociacaoId: neg.negociacaoId, concluidaEm: null } })).length, 1);
  });
  test("resposta de empresa que ainda não está no CRM não cria nada", async () => {
    const e = (await empresa(t, "Crm Fora", { telefone: "5521944448888" })).id;
    const r = await espelharNoCrm(deps(e), { tipo: "RESPOSTA", etapa: "RESPONDEU" });
    assert.deepEqual([r.ok, !r.ok && /ainda não está no CRM/.test(r.motivo)], [false, true]);
    assert.equal(await prisma.contact.count({ where: { tenantId: t, waJid: "5521944448888@s.whatsapp.net" } }), 0);
  });
  test("sem telefone ou sem o funil, o CRM avisa e o SDR já tinha registrado o contato", async () => {
    const semFone = (await empresa(t, "Crm Sem Fone")).id;
    const c = await contatoRegistrado(semFone);
    const r = await espelharNoCrm(deps(semFone), { tipo: "CONTATO", canal: "EMAIL", texto: c.r.interacao.texto ?? "" });
    assert.deepEqual([r.ok, !r.ok && /telefone/.test(r.motivo)], [false, true]);
    assert.equal((await sdrDoTenant(t).comercial.ficha(semFone)).interacoes.some((i) => i.tipo === "CONTATO"), true);

    const t2 = (await prisma.tenant.create({ data: { name: "canais-crm2", slug: "canais-teste-crm2" } })).id;
    try {
      const e2 = (await empresa(t2, "Sem Funil", { telefone: "5521944449999" })).id;
      const aid = await aprovada(t2, e2);
      const ctt = await sdrDoTenant(t2).comercial.registrarContato(aid, { canal: "EMAIL" }, autor);
      const r2 = await espelharNoCrm(deps(e2, t2), { tipo: "CONTATO", canal: "EMAIL", texto: ctt.interacao.texto ?? "" });
      assert.deepEqual([r2.ok, !r2.ok && /Prospecção ativa/.test(r2.motivo)], [false, true]);
      assert.equal(await prisma.contact.count({ where: { tenantId: t2 } }), 0);
    } finally {
      await prisma.tenant.delete({ where: { id: t2 } });
    }
  });
  test("empresa bloqueada não vai ao CRM", async () => {
    const e = (await empresa(t, "Crm Bloq", { telefone: "5521944440001", cnpj: cnpjDe(7100) })).id;
    const c = await contatoRegistrado(e);
    await prisma.sdrSupressao.create({ data: { tenantId: t, tipo: "CNPJ", valor: cnpjDe(7100), motivo: "EMPRESA_BLOQUEADA" } });
    const r = await espelharNoCrm(deps(e), { tipo: "CONTATO", canal: "EMAIL", texto: c.r.interacao.texto ?? "" });
    assert.equal(r.ok, false);
    assert.equal(await prisma.contact.count({ where: { tenantId: t, waJid: "5521944440001@s.whatsapp.net" } }), 0);
  });
  test("contato que já existe (pelo número) e negociação aberta no funil são reaproveitados", async () => {
    const e = (await empresa(t, "Crm Reuso", { telefone: "5521944440002" })).id;
    const contato = await prisma.contact.create({ data: { tenantId: t, waJid: "123456@lid", phoneNumber: "5521944440002", name: "Já existia" } });
    const existente = await prisma.negociacao.create({ data: { tenantId: t, contactId: contato.id, funilId, stageId: primeiraEtapa, titulo: "Negociação à mão", valorCents: 0, recorrencia: "UNICA", valorMensalCents: 0 } });
    const r = await garantirNegociacao(deps(e));
    assert.deepEqual([r.negociacaoId, r.criada], [existente.id, false]);
    assert.equal(await prisma.contact.count({ where: { tenantId: t, phoneNumber: "5521944440002" } }), 1);
    assert.equal((await sdrDoTenant(t).comercial.ficha(e)).acompanhamento.negociacaoId, existente.id);
  });
  test("marcar como oportunidade exige interesse, reaproveita a negociação e é repetível", async () => {
    const e = (await empresa(t, "Crm Oportunidade", { telefone: "5521944440003" })).id;
    await assert.rejects(() => converterEmNegociacao(deps(e)), status(409));
    const c = await contatoRegistrado(e);
    const crm = await espelharNoCrm(deps(e), { tipo: "CONTATO", canal: "EMAIL", texto: c.r.interacao.texto ?? "" });
    if (!crm.ok) throw new Error(crm.motivo);
    await assert.rejects(() => converterEmNegociacao(deps(e)), status(409));
    await sdrDoTenant(t).comercial.registrarResultado(e, { etapa: "REUNIAO" }, autor);
    const antes = await prisma.negociacao.count({ where: { tenantId: t } });
    const r = await converterEmNegociacao(deps(e));
    assert.deepEqual([r.negociacaoId, r.jaExistia, r.criada], [crm.negociacaoId, false, false]);
    assert.equal(await prisma.negociacao.count({ where: { tenantId: t } }), antes);
    assert.equal((await sdrDoTenant(t).comercial.ficha(e)).acompanhamento.etapa, "CONVERTIDA");
    assert.deepEqual(await converterEmNegociacao(deps(e)), { negociacaoId: crm.negociacaoId, jaExistia: true, criada: false });
  });
  test("idempotência: chamadas simultâneas e repetidas não duplicam contato nem negociação", async () => {
    const e = (await empresa(t, "Crm Concorrente", { telefone: "5521944440005" })).id;
    const rs = await Promise.all([1, 2, 3, 4].map(() => garantirNegociacao(deps(e))));
    assert.equal(new Set(rs.map((r) => r.negociacaoId)).size, 1);
    assert.equal(rs.filter((r) => r.criada).length, 1);
    assert.equal(await prisma.negociacao.count({ where: { tenantId: t, titulo: { startsWith: "Crm Concorrente" } } }), 1);
    assert.equal(await prisma.contact.count({ where: { tenantId: t, waJid: "5521944440005@s.whatsapp.net" } }), 1);
    // Repetir depois também devolve a mesma.
    const de_novo = await garantirNegociacao(deps(e));
    assert.deepEqual([de_novo.negociacaoId, de_novo.criada], [rs[0].negociacaoId, false]);
    // Duas empresas diferentes com o mesmo telefone partilham o contato e o funil, mas cada uma tem a sua negociação aberta apenas se ainda não existir uma.
    const outra = (await empresa(t, "Crm Concorrente Filial", { telefone: "5521944440005" })).id;
    const filial = await garantirNegociacao(deps(outra));
    assert.equal(filial.negociacaoId, rs[0].negociacaoId);
    assert.equal(await prisma.contact.count({ where: { tenantId: t, waJid: "5521944440005@s.whatsapp.net" } }), 1);
  });
  test("outra organização não cria negociação para esta empresa", async () => {
    const e = (await empresa(t, "Crm Isolada", { telefone: "5521944440004" })).id;
    await assert.rejects(() => garantirNegociacao(deps(e, tenantF)), status(404));
  });
});

describe("rotas de e-mail, WhatsApp e CRM", () => {
  let empresaId = "";
  let funilId = "";

  before(async () => {
    empresaId = (await empresa(dilonId, "Rota Canais", { telefone: "5521966660000", email: "contato@rotacanais.com.br", emailDominio: "rotacanais.com.br" })).id;
  });
  after(async () => {
    await prisma.negociacao.deleteMany({ where: { tenantId: dilonId, origem: "SDR" } });
    await prisma.contact.deleteMany({ where: { tenantId: dilonId, waJid: "5521966660000@s.whatsapp.net" } });
    if (funilId) {
      await prisma.stage.deleteMany({ where: { funilId } });
      await prisma.funil.deleteMany({ where: { id: funilId } });
    }
    await prisma.sdrEmpresa.deleteMany({ where: { tenantId: dilonId, id: empresaId } });
  });

  test("situação do e-mail: o responsável e o financeiro leem, os outros não, e nunca há senha na resposta", async () => {
    assert.equal((await new Sessao().chamar("/api/sdr/email")).status, 307);
    for (const u of [USUARIOS.dono, USUARIOS.financeiro]) {
      const r = await (await logado(u)).chamar("/api/sdr/email");
      assert.equal(r.status, 200);
      const j = (await r.json()) as { configurado: boolean; limiteDiario: number; whatsapp: { limiteDiario: number } };
      // No ambiente de teste não há caixa de e-mail configurada.
      assert.deepEqual([j.configurado, j.limiteDiario, j.whatsapp.limiteDiario], [false, 20, 10]);
      assert.equal(/senha|pass|secret/i.test(JSON.stringify(j)), false);
    }
    for (const u of [USUARIOS.atendente, USUARIOS.externo]) assert.equal((await (await logado(u)).chamar("/api/sdr/email")).status, 403);
  });
  test("enviar e-mail: sem login vai ao login, sem permissão não passa, e sem caixa configurada responde 503", async () => {
    const dono = await logado(USUARIOS.dono);
    const ab = (await (await dono.chamar(`/api/sdr/empresas/${empresaId}/abordagens`, "POST", { produto: "DILON_ZAP", canal: "EMAIL", texto: "Texto de teste da rota.", assunto: "Assunto da rota" })).json()) as { id: string };
    assert.equal((await dono.chamar(`/api/sdr/abordagens/${ab.id}/aprovar`, "POST")).status, 200);
    assert.equal((await new Sessao().chamar(`/api/sdr/abordagens/${ab.id}/enviar-email`, "POST", {})).status, 307);
    assert.equal((await (await logado(USUARIOS.financeiro)).chamar(`/api/sdr/abordagens/${ab.id}/enviar-email`, "POST", {})).status, 403);
    assert.equal((await (await logado(USUARIOS.atendente)).chamar(`/api/sdr/abordagens/${ab.id}/enviar-email`, "POST", {})).status, 403);
    const r = await dono.chamar(`/api/sdr/abordagens/${ab.id}/enviar-email`, "POST", {});
    assert.equal(r.status, 503);
    assert.match(((await r.json()) as { error: string }).error, /não está configurado/);
    assert.equal((await dono.chamar(`/api/sdr/abordagens/${ab.id}/enviar-email`, "POST", { tenantId: "outro" })).status, 400);
    assert.equal(await prisma.sdrEnvioEmail.count({ where: { tenantId: dilonId } }), 0);
  });
  test("WhatsApp pela rota: abre uma conversa, segura a segunda por causa do intervalo e recusa quem não pode", async () => {
    const dono = await logado(USUARIOS.dono);
    const criar = async (texto: string) => {
      const ab = (await (await dono.chamar(`/api/sdr/empresas/${empresaId}/abordagens`, "POST", { produto: "DILON_ZAP", canal: "WHATSAPP", texto })).json()) as { id: string };
      await dono.chamar(`/api/sdr/abordagens/${ab.id}/aprovar`, "POST");
      return ab.id;
    };
    const a1 = await criar("Mensagem de WhatsApp um da rota.");
    const a2 = await criar("Mensagem de WhatsApp dois da rota.");
    assert.equal((await new Sessao().chamar(`/api/sdr/abordagens/${a1}/whatsapp`, "POST")).status, 307);
    assert.equal((await (await logado(USUARIOS.financeiro)).chamar(`/api/sdr/abordagens/${a1}/whatsapp`, "POST")).status, 403);
    const r = await dono.chamar(`/api/sdr/abordagens/${a1}/whatsapp`, "POST");
    assert.equal(r.status, 200);
    const j = (await r.json()) as { url: string; telefone: string };
    assert.match(j.url, /^\/abrir-conversa\?telefone=5521966660000&nome=Rota%20Canais&mensagem=/);
    assert.equal((await dono.chamar(`/api/sdr/abordagens/${a2}/whatsapp`, "POST")).status, 429);
  });
  test("o contato registrado leva a empresa ao CRM quando o funil existe, e avisa quando não existe", async () => {
    const dono = await logado(USUARIOS.dono);
    const novo = async (texto: string) => {
      const ab = (await (await dono.chamar(`/api/sdr/empresas/${empresaId}/abordagens`, "POST", { produto: "DILON_ZAP", canal: "LIGACAO", texto })).json()) as { id: string };
      await dono.chamar(`/api/sdr/abordagens/${ab.id}/aprovar`, "POST");
      return ab.id;
    };
    // Ainda sem o funil: o SDR registra e o CRM avisa.
    const semFunil = (await (await dono.chamar(`/api/sdr/abordagens/${await novo("Roteiro de ligação número um.")}/contato`, "POST", { canal: "LIGACAO" })).json()) as { crm: { ok: boolean; motivo: string } };
    assert.deepEqual([semFunil.crm.ok, /Prospecção ativa/.test(semFunil.crm.motivo)], [false, true]);

    funilId = (await prisma.funil.create({ data: { tenantId: dilonId, nome: "Prospecção ativa" } })).id;
    await prisma.stage.create({ data: { tenantId: dilonId, funilId, name: "Contato inicial", position: 0 } });
    const proximaAcaoEm = new Date(Date.now() + 2 * dia).toISOString();
    const r = await dono.chamar(`/api/sdr/abordagens/${await novo("Roteiro de ligação número dois.")}/contato`, "POST", { canal: "LIGACAO", resultado: "falei com a recepção", proximaAcao: "Ligar de novo", proximaAcaoEm });
    assert.equal(r.status, 201);
    const j = (await r.json()) as { crm: { ok: boolean; negociacaoId: string; criada: boolean } };
    assert.deepEqual([j.crm.ok, j.crm.criada], [true, true]);
    const neg = await prisma.negociacao.findUniqueOrThrow({ where: { id: j.crm.negociacaoId }, include: { eventos: true } });
    assert.deepEqual([neg.funilId, neg.origem, neg.responsavelId !== null, neg.eventos.some((e) => e.tipo === "CRIADA")], [funilId, "SDR", true, true]);
    assert.equal((await prisma.tarefaNegociacao.findMany({ where: { negociacaoId: neg.id, concluidaEm: null } })).map((t) => t.titulo).join(), "SDR: Ligar de novo");

    // A resposta chega ao CRM como nota; marcar como oportunidade não cria outra negociação.
    const resp = (await (await dono.chamar(`/api/sdr/empresas/${empresaId}/resultado`, "POST", { etapa: "INTERESSE", nota: "Quer a demonstração" })).json()) as { crm: { ok: boolean } };
    assert.equal(resp.crm.ok, true);
    assert.equal((await prisma.negociacaoNota.findMany({ where: { negociacaoId: neg.id } })).some((n) => n.texto.includes("demonstrou interesse: Quer a demonstração")), true);
    const antes = await prisma.negociacao.count({ where: { tenantId: dilonId, origem: "SDR" } });
    const conv = await dono.chamar(`/api/sdr/empresas/${empresaId}/converter`, "POST");
    assert.equal(conv.status, 200);
    assert.equal(await prisma.negociacao.count({ where: { tenantId: dilonId, origem: "SDR" } }), antes);
  });
});
