// Caixa de entrada do Instagram contra uma Meta falsa. Rodar de apps/web com:
//   DATABASE_URL=postgresql://... npx tsx lib/instagram.test-manual.ts
import { createHmac, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// ---- a Meta falsa ----
const enviados: { auth: string | undefined; corpo: any }[] = [];
let modoEnvio: "ok" | "janela" | "token" = "ok";
let modoRenovar: "ok" | "falha" = "ok";
const lerCorpo = (req: IncomingMessage) => new Promise<string>((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });
const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const corpo = await lerCorpo(req);
  const json = (o: unknown, status = 200) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (url.pathname === "/oauth/access_token") return corpo.includes("code=bom") ? json({ data: [{ access_token: "curto", user_id: "1784" }] }) : json({ error_message: "código inválido" }, 400);
  if (url.pathname === "/access_token") return json({ access_token: "longo", expires_in: 5184000 });
  if (url.pathname === "/refresh_access_token") return modoRenovar === "ok" ? json({ access_token: "longo2", expires_in: 5184000 }) : json({ error: { message: "token vencido", code: 190 } }, 400);
  if (url.pathname === "/v21.0/me") return json({ user_id: "1784", username: "salesauto", name: "Sales Automóveis" });
  if (url.pathname === "/v21.0/me/subscribed_apps") return json({ success: true });
  if (url.pathname === "/v21.0/me/messages") {
    enviados.push({ auth: req.headers.authorization, corpo: JSON.parse(corpo) });
    if (modoEnvio === "janela") return json({ error: { message: "Outside of allowed window", code: 10, error_subcode: 2534022 } }, 400);
    if (modoEnvio === "token") return json({ error: { message: "Invalid OAuth access token", code: 190 } }, 400);
    return json({ recipient_id: "555", message_id: `mid-saida-${enviados.length}` });
  }
  const m = url.pathname.match(/^\/v21\.0\/(\d+)$/);
  if (m) return json({ name: `Cliente ${m[1]}`, username: `cliente${m[1]}` });
  json({ error: { message: "rota desconhecida", code: 100 } }, 404);
});

async function main() {
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  Object.assign(process.env, { INSTAGRAM_OAUTH_URL: base, INSTAGRAM_API_URL: base, INSTAGRAM_GRAPH_URL: base, INSTAGRAM_APP_ID: "app1", INSTAGRAM_APP_SECRET: "segredo-do-app", INSTAGRAM_VERIFY_TOKEN: "verifica", PORTAIS_CHAVE: randomBytes(32).toString("base64") });

  const { prisma } = await import("@dilon-zap/db");
  const { urlDeConexaoInstagram, concluirConexaoInstagram, receberWebhookInstagram, responderNoInstagram, renovarTokensInstagram, criarNegociacaoDaConversa, telefoneNaMensagem } = await import("./instagram");
  const { respostaDeVerificacao } = await import("@dilon-zap/portais");

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-ig", "teste-ig-2"] } } });
  const t = await prisma.tenant.create({ data: { name: "Loja IG", slug: "teste-ig" } });
  const t2 = await prisma.tenant.create({ data: { name: "Outra IG", slug: "teste-ig-2" } });
  const u = await prisma.user.create({ data: { tenantId: t.id, name: "Atendente", email: "ig-atendente@t.com", passwordHash: "x", role: "AGENT" } });

  // ---- conectar ----
  const url = new URL(urlDeConexaoInstagram(t.id, u.id, "https://zap.exemplo.com")!);
  checa("URL de conexão com app, escopos e retorno", [url.searchParams.get("client_id"), url.searchParams.get("scope"), url.searchParams.get("redirect_uri")], ["app1", "instagram_business_basic,instagram_business_manage_messages", "https://zap.exemplo.com/api/instagram/retorno"]);
  const state = url.searchParams.get("state")!;
  checa("state inválido é recusado", (await concluirConexaoInstagram("bom", "forjado", "https://zap.exemplo.com")).ok, false);
  checa("código inválido falha", (await concluirConexaoInstagram("ruim", state, "https://zap.exemplo.com")).ok, false);
  const c1 = await concluirConexaoInstagram("bom#_", state, "https://zap.exemplo.com");
  checa("conecta e assina o webhook", c1, { ok: true, username: "salesauto", webhook: true });
  const conta = await prisma.instagramConta.findUniqueOrThrow({ where: { tenantId: t.id } });
  checa("token guardado cifrado, expira em ~60 dias", [conta.accessTokenCripto.startsWith("v1.") && !conta.accessTokenCripto.includes("longo"), (conta.expiraEm!.getTime() - Date.now()) / 86_400_000 > 59], [true, true]);
  const stateOutra = new URL(urlDeConexaoInstagram(t2.id, "x", "https://zap.exemplo.com")!).searchParams.get("state")!;
  checa("a mesma conta do Instagram não conecta em duas lojas", await concluirConexaoInstagram("bom", stateOutra, "https://zap.exemplo.com").then((r) => (r.ok ? "ok" : r.motivo)), "outra-loja");

  // ---- webhook ----
  checa("verificação do endereço", [respostaDeVerificacao(new URLSearchParams("hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=123"), "verifica"), respostaDeVerificacao(new URLSearchParams("hub.mode=subscribe&hub.verify_token=errado&hub.challenge=123"), "verifica")], ["123", null]);
  const evento = (mid: string, texto: string, extra: object = {}, sender = "555", recipient = "1784") => JSON.stringify({ object: "instagram", entry: [{ id: "1784", time: Date.now(), messaging: [{ sender: { id: sender }, recipient: { id: recipient }, timestamp: Date.now(), message: { mid, text: texto, ...extra } }] }] });
  const assina = (corpo: string) => `sha256=${createHmac("sha256", "segredo-do-app").update(corpo).digest("hex")}`;
  const b1 = evento("m1", "Oi, o Civic 2018 ainda está disponível?");
  checa("assinatura errada: 401", (await receberWebhookInstagram(b1, "sha256=00")).status, 401);
  checa("mensagem entra", await receberWebhookInstagram(b1, assina(b1)), { status: 200, processadas: 1 });
  const conv = await prisma.instagramConversa.findFirstOrThrow({ where: { tenantId: t.id } });
  checa("conversa com nome do perfil, não lida e sem negociação", [conv.nome, conv.username, conv.naoLidas, conv.negociacaoId, conv.ultimaEntradaEm !== null], ["Cliente 555", "cliente555", 1, null, true]);
  checa("a mesma mensagem (mid) não duplica", [(await receberWebhookInstagram(b1, assina(b1))).processadas, await prisma.instagramMensagem.count({ where: { tenantId: t.id } })], [0, 1]);
  const bEco = evento("m2", "Olá! Está sim, quer visitar?", { is_echo: true }, "1784", "555");
  await receberWebhookInstagram(bEco, assina(bEco));
  const mEco = await prisma.instagramMensagem.findFirstOrThrow({ where: { mid: "m2" } });
  const conv2 = await prisma.instagramConversa.findUniqueOrThrow({ where: { id: conv.id } });
  checa("resposta feita pelo app do Instagram entra como saída e zera não lidas", [mEco.direcao, conv2.naoLidas, conv2.respondidaEm !== null], ["SAIDA", 0, true]);
  const bOutra = JSON.stringify({ object: "instagram", entry: [{ id: "9999", messaging: [{ sender: { id: "1" }, recipient: { id: "9999" }, timestamp: 1, message: { mid: "x1", text: "oi" } }] }] });
  checa("conta que não é de nenhuma loja é ignorada", (await receberWebhookInstagram(bOutra, assina(bOutra))).processadas, 0);
  const bFoto = evento("m3", "", { attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] });
  await receberWebhookInstagram(bFoto, assina(bFoto));
  checa("foto sem texto vira [foto]", (await prisma.instagramMensagem.findFirstOrThrow({ where: { mid: "m3" } })).texto, "[foto]");

  // ---- lead no CRM quando passa o WhatsApp ----
  checa("telefone na mensagem", [telefoneNaMensagem("meu zap é 21 99876-5432, pode chamar"), telefoneNaMensagem("o carro custa 79999"), telefoneNaMensagem("sem número")], ["5521998765432", null, null]);
  const bTel = evento("m4", "pode me chamar no zap (21) 99876-5432");
  await receberWebhookInstagram(bTel, assina(bTel));
  const conv3 = await prisma.instagramConversa.findUniqueOrThrow({ where: { id: conv.id } });
  const neg = await prisma.negociacao.findUniqueOrThrow({ where: { id: conv3.negociacaoId! }, include: { tarefas: true } });
  checa("negociação criada com origem Instagram e tarefa de chamar", [conv3.telefone, neg.origem, neg.titulo, neg.tarefas.length, neg.tarefas[0].tipo], ["5521998765432", "Instagram", "Contato pelo Instagram", 1, "WHATSAPP"]);
  const bTel2 = evento("m5", "meu outro número 21 98888-7777");
  await receberWebhookInstagram(bTel2, assina(bTel2));
  checa("segundo número não abre outra negociação", await prisma.negociacao.count({ where: { tenantId: t.id } }), 1);
  const manual = await prisma.instagramConversa.create({ data: { tenantId: t.id, contaId: conta.id, igsid: "777", nome: "Maria", ultimaMensagemEm: new Date(), ultimoTexto: "oi" } });
  checa("criar negociação à mão exige telefone válido", await criarNegociacaoDaConversa(t.id, manual.id, "123").then(() => "criou", (e) => e.message), "WhatsApp inválido: informe com DDD");
  checa("criar negociação à mão", (await criarNegociacaoDaConversa(t.id, manual.id, "(21) 97777-1234")).negociacaoId !== null, true);

  // ---- responder ----
  const r1 = await responderNoInstagram(t.id, conv.id, "Pode vir hoje até as 18h!", u.id);
  checa("resposta enviada com o token e o destinatário certos", [r1, enviados[0].auth, enviados[0].corpo], [{ ok: true }, "Bearer longo", { recipient: { id: "555" }, message: { text: "Pode vir hoje até as 18h!" } }]);
  const saida = await prisma.instagramMensagem.findFirstOrThrow({ where: { mid: "mid-saida-1" } });
  checa("resposta guardada com quem enviou", [saida.direcao, saida.enviadaPorId], ["SAIDA", u.id]);
  const lead = await prisma.leadPortal.findFirstOrThrow({ where: { tenantId: t.id, portal: "INSTAGRAM", chave: `ig:${conta.id}:555` } });
  checa("relógio do lead parou ao responder", lead.respondidoEm !== null, true);
  checa("mensagem vazia", (await responderNoInstagram(t.id, conv.id, "  ", u.id)).ok, false);

  await prisma.instagramConversa.update({ where: { id: conv.id }, data: { ultimaEntradaEm: new Date(Date.now() - 25 * 3600_000) } });
  const antes = enviados.length;
  const r2 = await responderNoInstagram(t.id, conv.id, "oi", u.id);
  checa("passou de 24 h: recusa sem chamar a Meta", [r2.ok, enviados.length], [false, antes]);
  await prisma.instagramConversa.update({ where: { id: conv.id }, data: { ultimaEntradaEm: new Date() } });
  modoEnvio = "janela";
  checa("a Meta recusa por janela: mensagem clara", (await responderNoInstagram(t.id, conv.id, "oi", u.id)).ok, false);
  modoEnvio = "token";
  const r3 = await responderNoInstagram(t.id, conv.id, "oi", u.id);
  checa("token inválido: pede para reconectar e marca a conta em erro", [r3.ok, "reconectar" in r3 && r3.reconectar, (await prisma.instagramConta.findUniqueOrThrow({ where: { id: conta.id } })).status], [false, true, "ERRO"]);
  await prisma.instagramConta.update({ where: { id: conta.id }, data: { status: "CONECTADA" } });
  modoEnvio = "ok";

  // ---- renovar token ----
  await prisma.instagramConta.update({ where: { id: conta.id }, data: { expiraEm: new Date(Date.now() + 10 * 86_400_000) } });
  checa("renova token perto de vencer", await renovarTokensInstagram(), { renovados: 1, erros: 0 });
  checa("a renovação empurra a validade", ((await prisma.instagramConta.findUniqueOrThrow({ where: { id: conta.id } })).expiraEm!.getTime() - Date.now()) / 86_400_000 > 59, true);
  checa("token longe de vencer não é tocado", await renovarTokensInstagram(), { renovados: 0, erros: 0 });
  await prisma.instagramConta.update({ where: { id: conta.id }, data: { expiraEm: new Date(Date.now() - 1000) } });
  modoRenovar = "falha";
  checa("falha ao renovar token vencido: conta em erro", [await renovarTokensInstagram(), (await prisma.instagramConta.findUniqueOrThrow({ where: { id: conta.id } })).status], [{ renovados: 0, erros: 1 }, "ERRO"]);

  await prisma.tenant.deleteMany({ where: { slug: { in: ["teste-ig", "teste-ig-2"] } } });
  console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
  await prisma.$disconnect();
  servidor.close();
  process.exit(falhas ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
