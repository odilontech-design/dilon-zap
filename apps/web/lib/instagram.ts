import { prisma } from "@dilon-zap/db";
import {
  ErroInstagram,
  appInstagramDoAmbiente,
  assinarEstado,
  assinarMensagensInstagram,
  assinaturaDoWebhookValida,
  chaveDoAmbiente,
  cifrar,
  decifrar,
  enviarTextoInstagram,
  lerEstado,
  lerEventosDeMensagem,
  perfilDoContatoInstagram,
  perfilInstagram,
  renovarTokenInstagram,
  telefoneDoLead,
  tokenLongoInstagram,
  trocarCodigoInstagram,
  urlDeAutorizacaoInstagram,
} from "@dilon-zap/portais";
import { registrarEntradaLead } from "@/lib/lead-portal";

/**
 * Caixa de entrada do Instagram da loja. Módulo próprio: guarda as conversas e
 * mensagens numa estrutura separada do Inbox do WhatsApp (que não é tocado).
 * Quando o cliente passa o WhatsApp numa mensagem, a conversa vira lead no CRM
 * (mesma regra dos portais: contato + negociação + tarefa de chamar).
 */

const JANELA_MS = 24 * 60 * 60 * 1000;
const RENOVAR_ANTES_MS = 20 * 86_400_000;

export const instagramConfigurado = () => !!(appInstagramDoAmbiente() && process.env.PORTAIS_CHAVE && process.env.INSTAGRAM_VERIFY_TOKEN);
const segredo = () => process.env.PORTAIS_CHAVE ?? "";
const chave = () => chaveDoAmbiente(segredo());
export const urlDeRetornoInstagram = (urlBase: string) => `${urlBase.replace(/\/$/, "")}/api/instagram/retorno`;
export const urlDoWebhookInstagram = (urlBase: string) => `${urlBase.replace(/\/$/, "")}/api/instagram/webhook`;

export function urlDeConexaoInstagram(tenantId: string, userId: string, urlBase: string): string | null {
  const app = appInstagramDoAmbiente();
  if (!app || !segredo()) return null;
  return urlDeAutorizacaoInstagram(app, urlDeRetornoInstagram(urlBase), assinarEstado({ tenantId, userId, portal: "INSTAGRAM" }, segredo()));
}

/** O retorno do OAuth: troca o código pelo token, guarda a conta (cifrada) e assina os webhooks de mensagem. */
export async function concluirConexaoInstagram(code: string, state: string, urlBase: string): Promise<{ ok: true; username: string; webhook: boolean } | { ok: false; motivo: "invalida" | "falhou" | "outra-loja" | "nao-configurada"; erro?: string }> {
  const app = appInstagramDoAmbiente();
  if (!app || !segredo()) return { ok: false, motivo: "nao-configurada" };
  const estado = lerEstado(state, segredo());
  if (!estado || estado.portal !== "INSTAGRAM") return { ok: false, motivo: "invalida" };
  try {
    const curto = await trocarCodigoInstagram(app, urlDeRetornoInstagram(urlBase), code);
    const longo = await tokenLongoInstagram(app, curto.token);
    const perfil = await perfilInstagram(longo.token);
    const dono = await prisma.instagramConta.findUnique({ where: { igUserId: perfil.id }, select: { tenantId: true } });
    if (dono && dono.tenantId !== estado.tenantId) return { ok: false, motivo: "outra-loja" };
    let webhook = false;
    try {
      await assinarMensagensInstagram(longo.token);
      webhook = true;
    } catch {
      // A conta conecta mesmo assim; o painel mostra que as mensagens novas ainda não chegam.
    }
    const dados = { igUserId: perfil.id, username: perfil.username, nome: perfil.nome, accessTokenCripto: cifrar(longo.token, chave()), expiraEm: longo.expiraEm, status: "CONECTADA" as const, erro: null, webhookEm: webhook ? new Date() : null, conectadaEm: new Date() };
    await prisma.instagramConta.upsert({ where: { tenantId: estado.tenantId }, create: { tenantId: estado.tenantId, ...dados }, update: dados });
    return { ok: true, username: perfil.username, webhook };
  } catch (e) {
    return { ok: false, motivo: "falhou", erro: e instanceof Error ? e.message : undefined };
  }
}

export async function desconectarInstagram(tenantId: string) {
  // Guarda as conversas (histórico), só para de receber e responder.
  await prisma.instagramConta.updateMany({ where: { tenantId }, data: { status: "DESCONECTADA", accessTokenCripto: "", erro: null } });
}

async function tokenDaConta(tenantId: string): Promise<{ id: string; token: string } | null> {
  const c = await prisma.instagramConta.findUnique({ where: { tenantId } });
  if (!c || c.status === "DESCONECTADA" || !c.accessTokenCripto) return null;
  return { id: c.id, token: decifrar(c.accessTokenCripto, chave()) };
}

/** Tira o telefone de uma mensagem ("meu zap é 21 99876-5432"), só se tem DDD e 9 dígitos de celular ou 8 de fixo. */
export function telefoneNaMensagem(texto: string): string | null {
  const m = texto.match(/(?:\+?55[\s.-]*)?\(?\b(\d{2})\)?[\s.-]*(9?\d{4})[\s.-]?(\d{4})\b/);
  return m ? telefoneDoLead(`${m[1]}${m[2]}${m[3]}`) : null;
}

export type ResultadoWebhook = { status: number; processadas?: number };

/**
 * Recebe o POST da Meta. O corpo bruto é necessário para conferir a assinatura
 * (HMAC com o segredo do app). Mensagens de contas que não são de nenhuma loja
 * são ignoradas; a mesma mensagem (mid) entregue duas vezes não duplica.
 */
export async function receberWebhookInstagram(corpoBruto: string, assinatura: string | null): Promise<ResultadoWebhook> {
  const app = appInstagramDoAmbiente();
  if (!app) return { status: 503 };
  if (!assinaturaDoWebhookValida(corpoBruto, assinatura, app.segredo)) return { status: 401 };
  let json: unknown;
  try {
    json = JSON.parse(corpoBruto);
  } catch {
    return { status: 400 };
  }
  let processadas = 0;
  for (const ev of lerEventosDeMensagem(json)) {
    const conta = await prisma.instagramConta.findUnique({ where: { igUserId: ev.contaId } });
    if (!conta || conta.status === "DESCONECTADA") continue;
    const ja = await prisma.instagramMensagem.findUnique({ where: { tenantId_mid: { tenantId: conta.tenantId, mid: ev.mid } }, select: { id: true } });
    if (ja) continue;

    let conversa = await prisma.instagramConversa.findUnique({ where: { contaId_igsid: { contaId: conta.id, igsid: ev.igsid } } });
    if (!conversa) {
      const perfil = conta.accessTokenCripto ? await perfilDoContatoInstagram(decifrar(conta.accessTokenCripto, chave()), ev.igsid) : null;
      conversa = await prisma.instagramConversa.create({
        data: { tenantId: conta.tenantId, contaId: conta.id, igsid: ev.igsid, nome: perfil?.nome ?? null, username: perfil?.username ?? null, ultimaMensagemEm: ev.quando, ultimoTexto: ev.texto.slice(0, 200) },
      });
    }
    try {
      await prisma.instagramMensagem.create({
        data: { tenantId: conta.tenantId, conversaId: conversa.id, mid: ev.mid, direcao: ev.eco ? "SAIDA" : "ENTRADA", texto: ev.texto, anexos: ev.anexos.length ? ev.anexos : undefined, enviadaEm: ev.quando },
      });
    } catch {
      continue; // entregue em paralelo: a outra chamada já gravou
    }
    const maisNova = ev.quando >= conversa.ultimaMensagemEm;
    await prisma.instagramConversa.update({
      where: { id: conversa.id },
      data: {
        ...(maisNova ? { ultimaMensagemEm: ev.quando, ultimoTexto: ev.texto.slice(0, 200) } : {}),
        ...(ev.eco ? { respondidaEm: ev.quando, naoLidas: 0 } : { ultimaEntradaEm: ev.quando, naoLidas: { increment: 1 }, respondidaEm: null }),
      },
    });
    processadas++;
    if (!ev.eco && !conversa.negociacaoId) {
      const tel = telefoneNaMensagem(ev.texto);
      if (tel) await criarNegociacaoDaConversa(conta.tenantId, conversa.id, tel).catch((e) => console.error("[instagram] negociação não criada:", e instanceof Error ? e.message : e));
    }
  }
  return { status: 200, processadas };
}

/** Vira lead no CRM: contato pelo WhatsApp informado, negociação (origem Instagram) e tarefa de chamar. */
export async function criarNegociacaoDaConversa(tenantId: string, conversaId: string, telefone: string): Promise<{ negociacaoId: string | null }> {
  const conversa = await prisma.instagramConversa.findFirst({ where: { id: conversaId, tenantId } });
  if (!conversa) throw new Error("conversa não encontrada");
  const tel = telefoneDoLead(telefone);
  if (!tel) throw new Error("WhatsApp inválido: informe com DDD");
  const ultima = await prisma.instagramMensagem.findFirst({ where: { conversaId, direcao: "ENTRADA" }, orderBy: { enviadaEm: "desc" }, select: { texto: true } });
  const r = await registrarEntradaLead(tenantId, {
    portal: "INSTAGRAM",
    chave: `ig:${conversa.contaId}:${conversa.igsid}`,
    contato: "mensagem direta",
    origem: "instagram",
    nome: conversa.nome ?? (conversa.username ? `@${conversa.username}` : "Contato do Instagram"),
    email: null,
    telefone: tel,
    mensagem: ultima?.texto ?? "",
    idNoPortal: null,
    linkAnuncio: null,
    criadoEm: conversa.createdAt,
    carro: null,
  });
  await prisma.instagramConversa.update({ where: { id: conversa.id }, data: { telefone: tel, negociacaoId: r.negociacaoId } });
  return { negociacaoId: r.negociacaoId };
}

export type RespostaDeEnvio = { ok: true } | { ok: false; erro: string; reconectar?: boolean };

/** A equipe responde pelo Zap. Só dentro de 24 h da última mensagem do cliente (regra da Meta). */
export async function responderNoInstagram(tenantId: string, conversaId: string, texto: string, userId: string): Promise<RespostaDeEnvio> {
  const t = texto.trim();
  if (!t) return { ok: false, erro: "escreva a mensagem" };
  const conversa = await prisma.instagramConversa.findFirst({ where: { id: conversaId, tenantId } });
  if (!conversa) return { ok: false, erro: "conversa não encontrada" };
  if (!conversa.ultimaEntradaEm || Date.now() - conversa.ultimaEntradaEm.getTime() > JANELA_MS) {
    return { ok: false, erro: "Passaram mais de 24 horas desde a última mensagem do cliente: o Instagram só deixa responder quem escreveu nas últimas 24 h. Chame pelo WhatsApp se tiver o número." };
  }
  const conta = await tokenDaConta(tenantId);
  if (!conta) return { ok: false, erro: "Instagram desconectado: conecte a conta em Veículos > Instagram.", reconectar: true };
  try {
    const { mid } = await enviarTextoInstagram(conta.token, conversa.igsid, t);
    const agora = new Date();
    await prisma.instagramMensagem.upsert({
      where: { tenantId_mid: { tenantId, mid } },
      create: { tenantId, conversaId, mid, direcao: "SAIDA", texto: t.slice(0, 1000), enviadaEm: agora, enviadaPorId: userId },
      update: { enviadaPorId: userId },
    });
    await prisma.instagramConversa.update({ where: { id: conversaId }, data: { ultimaMensagemEm: agora, ultimoTexto: t.slice(0, 200), respondidaEm: agora, naoLidas: 0 } });
    if (conversa.negociacaoId) await prisma.leadPortal.updateMany({ where: { tenantId, portal: "INSTAGRAM", chave: `ig:${conversa.contaId}:${conversa.igsid}`, respondidoEm: null }, data: { respondidoEm: agora } });
    return { ok: true };
  } catch (e) {
    if (e instanceof ErroInstagram) {
      if (e.foraDaJanela) return { ok: false, erro: "O Instagram recusou: passou a janela de 24 h desde a última mensagem do cliente." };
      if (e.tokenInvalido) {
        await prisma.instagramConta.update({ where: { id: conta.id }, data: { status: "ERRO", erro: "O Instagram pediu para reconectar a conta." } });
        return { ok: false, erro: "O Instagram pediu para reconectar a conta.", reconectar: true };
      }
      return { ok: false, erro: e.message };
    }
    throw e;
  }
}

/** Renova os tokens que vencem nos próximos 20 dias (chamado por cron diário). */
export async function renovarTokensInstagram(): Promise<{ renovados: number; erros: number }> {
  const limite = new Date(Date.now() + RENOVAR_ANTES_MS);
  const contas = await prisma.instagramConta.findMany({ where: { status: "CONECTADA", expiraEm: { lt: limite } } });
  let renovados = 0;
  let erros = 0;
  for (const c of contas) {
    try {
      const novo = await renovarTokenInstagram(decifrar(c.accessTokenCripto, chave()));
      await prisma.instagramConta.update({ where: { id: c.id }, data: { accessTokenCripto: cifrar(novo.token, chave()), expiraEm: novo.expiraEm, erro: null } });
      renovados++;
    } catch (e) {
      erros++;
      const vencida = c.expiraEm && c.expiraEm.getTime() < Date.now();
      await prisma.instagramConta.update({ where: { id: c.id }, data: { erro: (e instanceof Error ? e.message : "falha ao renovar").slice(0, 300), ...(vencida ? { status: "ERRO" } : {}) } });
    }
  }
  return { renovados, erros };
}
