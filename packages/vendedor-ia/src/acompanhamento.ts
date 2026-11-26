import { prisma } from "@dilon-zap/db";
import { enfileirar, lojasAtivas, type Conversa, type Dependencias, type Loja } from "./executar";
import { nomeDoVeiculo } from "./ficha";
import { celular, horaNaLoja, primeiroNome } from "./imediata";

/**
 * Acompanhamento automático: quando o cliente que a IA estava atendendo some, a IA retoma a conversa — no máximo DUAS
 * vezes, sem pressão, e nunca onde uma pessoa da loja já entrou. Roda no worker do Vendedor IA (nunca no do WhatsApp):
 * só grava a mensagem na fila de saída, como a IA já faz.
 *
 * Mexe com o número da loja, então o desenho é de quem não quer ser banido nem virar chato:
 *  - desligado por padrão; só vale para conversas que começaram DEPOIS de ligar (`acompanhamentoDesde`);
 *  - só conversa que a IA atende (ATIVA), sem responsável, aberta, no número geral e de contato em celular;
 *  - 1º toque depois de 24 h de silêncio, 2º depois de mais 72 h; nunca um 3º; passou de 6 dias, não escreve mais;
 *  - só de segunda a sábado, das 9h às 19h no horário da loja;
 *  - teto por hora (configurável, padrão 5), por dia (30) e pelo menos 90 s entre um envio e outro;
 *  - para na hora se o cliente pediu para parar, se uma pessoa da loja já falou com ele ou se a IA foi parada ("Assumir").
 * Quando o cliente responde, a conversa volta ao Vendedor IA normal.
 */

export const MAX_TOQUES = 2;
export const SILENCIO_PARA_O_1_TOQUE_MS = 24 * 3_600_000;
export const SILENCIO_PARA_O_2_TOQUE_MS = 72 * 3_600_000;
export const PRAZO_DO_1_TOQUE_MS = 6 * 86_400_000;
export const PRAZO_DO_2_TOQUE_MS = 7 * 86_400_000;
export const HORA_INICIAL_ACOMP = 9;
export const HORA_FINAL_ACOMP = 19;
export const INTERVALO_ENTRE_TOQUES_MS = 90_000;
export const TETO_POR_DIA = 30;
const POR_RODADA = 2;

/* ------------------------------------------------------------------ regras puras */

export type Autor = "cliente" | "pessoa" | "ia" | "automatica";
export type MensagemDaConversa = { de: Autor; em: Date; texto: string };

/** Quem escreveu, pelo que o banco guarda da mensagem. */
export function autorDaMensagem(m: { direction: string; senderUserId?: string | null; deCelular?: boolean | null; referenciaExterna?: string | null }): Autor {
  if (m.direction === "INBOUND") return "cliente";
  if (m.senderUserId || m.deCelular) return "pessoa";
  if (m.referenciaExterna?.startsWith("vendedor-ia:")) return "ia";
  return "automatica";
}

/**
 * O cliente pediu para parar? Pega "parar", "pare", "não quero mais", "me tire da lista", "chega"... Erra para o lado
 * seguro: um "não quero financiar" também silencia o acompanhamento, e silenciar a mais custa uma mensagem, não uma queixa.
 */
export function pediuParaParar(texto: string): boolean {
  const t = texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
  return /\b(parar|pare|para de (me )?(mandar|enviar|escrever|chamar)|nao (quero|tenho interesse|me (mande|envie|escreva|chame)|precisa)|nao precisa mais|sair|saia|descadastr\w*|remov\w+|me tire|chega|nao insista|sem interesse|bloquear)\b/.test(t);
}

/** Segunda a sábado, 9h às 19h no horário da loja. */
export function dentroDoHorarioDoAcompanhamento(agora: Date, timezone: string): boolean {
  const hora = horaNaLoja(agora, timezone);
  const dia = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(agora);
  return dia !== "Sun" && hora >= HORA_INICIAL_ACOMP && hora < HORA_FINAL_ACOMP;
}

export type Decisao =
  | { acao: "enviar"; tentativa: 1 | 2 }
  /** Ainda não é a hora (ou é a vez da IA/da equipe): olha de novo na próxima volta, sem marcar nada. */
  | { acao: "esperar"; motivo: string }
  /** Não vale mais a pena para esta conversa: marca e não olha de novo. */
  | { acao: "ignorar"; motivo: string };

/**
 * Esta conversa merece um toque agora? `mensagens` em qualquer ordem; `toquesEnviados` é quantos já saíram.
 * Não olha horário nem teto (isso é da loja, não da conversa).
 */
export function decidirAcompanhamento(p: { mensagens: MensagemDaConversa[]; toquesEnviados: number; agora: Date }): Decisao {
  const msgs = [...p.mensagens].sort((a, b) => a.em.getTime() - b.em.getTime());
  if (msgs.some((m) => m.de === "cliente" && pediuParaParar(m.texto))) return { acao: "ignorar", motivo: "o cliente pediu para parar" };
  if (msgs.some((m) => m.de === "pessoa")) return { acao: "ignorar", motivo: "uma pessoa da loja já falou com o cliente" };
  if (p.toquesEnviados >= MAX_TOQUES) return { acao: "ignorar", motivo: `já fez os ${MAX_TOQUES} toques` };

  const reais = msgs.filter((m) => m.de !== "automatica");
  const ultima = reais[reais.length - 1];
  if (!ultima) return { acao: "esperar", motivo: "a IA ainda não falou" };
  // Se a última palavra é do cliente, é a vez da IA responder, não de cobrar.
  if (ultima.de === "cliente") return { acao: "esperar", motivo: "o cliente está esperando resposta" };

  const silencio = p.agora.getTime() - ultima.em.getTime();
  const tentativa = (p.toquesEnviados + 1) as 1 | 2;
  const minimo = tentativa === 1 ? SILENCIO_PARA_O_1_TOQUE_MS : SILENCIO_PARA_O_2_TOQUE_MS;
  const maximo = tentativa === 1 ? PRAZO_DO_1_TOQUE_MS : PRAZO_DO_2_TOQUE_MS;
  if (silencio > maximo) return { acao: "ignorar", motivo: "faz tempo demais para retomar" };
  if (silencio < minimo) return { acao: "esperar", motivo: "ainda é cedo" };
  return { acao: "enviar", tentativa };
}

/**
 * O texto do toque. Curto, educado, sem preço, sem pressão e sem fingir que é uma pessoa. O 2º dá uma saída fácil
 * ("se já resolveu, é só avisar"), que é também o que mais evita denúncia do número. Duas variações por toque, escolhidas
 * pela conversa, para a loja não mandar sempre o mesmo texto palavra por palavra.
 */
export function montarAcompanhamento(i: { tentativa: 1 | 2; nome: string; assistente: string; loja: string; carro: string | null; variante: number }): string {
  const nome = primeiroNome(i.nome);
  const oi = nome ? `Oi, ${nome}!` : "Oi!";
  const quem = `Aqui é ${i.assistente} da ${i.loja}.`;
  const v = i.variante % 2;
  if (i.tentativa === 1) {
    if (i.carro) {
      return v === 0
        ? `${oi} ${quem} Passando para saber se você ainda tem interesse no ${i.carro}. Se quiser, te passo mais detalhes ou a gente combina uma visita. 😊`
        : `${oi} ${quem} Ficou alguma dúvida sobre o ${i.carro}? Posso te mandar mais fotos ou informações, é só falar. 😊`;
    }
    return v === 0
      ? `${oi} ${quem} Passando para saber se você ainda está procurando um carro. Se quiser, te mostro opções do nosso estoque. 😊`
      : `${oi} ${quem} Conseguiu ver o que você procurava? Se ainda estiver na busca, posso te ajudar com opções do estoque. 😊`;
  }
  if (i.carro) {
    return v === 0
      ? `${oi} Não quero te incomodar: só confirmando se o ${i.carro} ainda faz sentido para você. Se já resolveu, sem problema, é só me avisar que eu não escrevo mais.`
      : `${oi} Última mensagem por aqui: o ${i.carro} ainda é do seu interesse? Se não for mais, é só me dizer que eu paro de escrever.`;
  }
  return v === 0
    ? `${oi} Não quero te incomodar: só confirmando se você ainda está procurando carro. Se já resolveu, sem problema, é só me avisar que eu não escrevo mais.`
    : `${oi} Última mensagem por aqui: você ainda está atrás de um carro? Se não estiver mais, é só me dizer que eu paro de escrever.`;
}

/** Uma variação estável por conversa (a mesma conversa sempre cai na mesma, as conversas se espalham entre as duas). */
export function varianteDaConversa(conversationId: string): number {
  let h = 0;
  for (let i = 0; i < conversationId.length; i++) h = (h * 31 + conversationId.charCodeAt(i)) >>> 0;
  // Os bits de baixo do hash seguem a paridade dos caracteres; misturar antes de escolher espalha as conversas de verdade.
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h = (h ^ (h >>> 12)) >>> 0;
  return h % 2;
}

/**
 * Dá para falar com este contato? Se o cliente já escreveu para a loja, o WhatsApp dele é real — e hoje quase todo contato
 * vem como "@lid" (na Sales, 111 de 114), sem número à vista. Sem mensagem dele (um lead de portal que nunca respondeu),
 * só vale número de celular de verdade em "@s.whatsapp.net": telefone fixo ou número errado não recebe toque.
 */
export function contatoAlcancavel(waJid: string, clienteJaEscreveu: boolean): boolean {
  if (waJid.endsWith("@g.us")) return false;
  if (clienteJaEscreveu) return true;
  if (!waJid.endsWith("@s.whatsapp.net")) return false;
  return celular(waJid.split("@")[0].replace(/D/g, ""));
}

/* ------------------------------------------------------------------ o ciclo */

/** Uma volta: devolve quantos toques saíram. */
export async function cicloDeAcompanhamento(deps: Dependencias): Promise<{ enviados: number; erros: number }> {
  const agora = deps.agora?.() ?? new Date();
  let enviados = 0;
  let erros = 0;
  for (const loja of await lojasAtivas()) {
    if (!loja.acompanhamento || !loja.acompanhamentoDesde) continue;
    if (!dentroDoHorarioDoAcompanhamento(agora, loja.tenant.timezone)) continue;
    try {
      enviados += await tratarLoja(loja, deps, agora);
    } catch (e) {
      erros++;
      console.error(`[acompanhamento] loja ${loja.tenantId}:`, e instanceof Error ? e.message : e);
    }
  }
  return { enviados, erros };
}

async function tratarLoja(loja: Loja, deps: Dependencias, agora: Date): Promise<number> {
  // Tetos e espaçamento primeiro: se a loja já está no limite, nem olha as conversas.
  const umaHoraAtras = new Date(agora.getTime() - 3_600_000);
  const umDiaAtras = new Date(agora.getTime() - 86_400_000);
  const [naHora, noDia, ultimo] = await Promise.all([
    prisma.acompanhamentoIa.count({ where: { tenantId: loja.tenantId, resultado: "enviada", enviadoEm: { gte: umaHoraAtras } } }),
    prisma.acompanhamentoIa.count({ where: { tenantId: loja.tenantId, resultado: "enviada", enviadoEm: { gte: umDiaAtras } } }),
    prisma.acompanhamentoIa.findFirst({ where: { tenantId: loja.tenantId, resultado: "enviada" }, orderBy: { enviadoEm: "desc" }, select: { enviadoEm: true } }),
  ]);
  let enviadosNaHora = naHora;
  let enviadosNoDia = noDia;
  const ultimoEnvio = ultimo?.enviadoEm.getTime() ?? 0;
  if (enviadosNaHora >= loja.acompanhamentoPorHora || enviadosNoDia >= TETO_POR_DIA) return 0;
  if (agora.getTime() - ultimoEnvio < INTERVALO_ENTRE_TOQUES_MS) return 0;

  // Candidatas: conversas que a IA atende (ATIVA, desde que o acompanhamento foi ligado), abertas, sem responsável, no número
  // geral, paradas há mais de 24 h (e há menos de 8 dias).
  const daIa = await prisma.vendedorIaConversa.findMany({
    where: { tenantId: loja.tenantId, status: "ATIVA", iniciadaEm: { gte: loja.acompanhamentoDesde! } },
    orderBy: { updatedAt: "asc" },
    take: 1000,
    select: { conversationId: true },
  });
  if (!daIa.length) return 0;
  const conversas = await prisma.conversation.findMany({
    where: {
      id: { in: daIa.map((c) => c.conversationId) },
      tenantId: loja.tenantId,
      status: "OPEN",
      assignedToId: null,
      session: { setorId: null },
      contact: { grupo: false },
      lastMessageAt: { lte: new Date(agora.getTime() - SILENCIO_PARA_O_1_TOQUE_MS), gte: new Date(agora.getTime() - 8 * 86_400_000) },
    },
    orderBy: { lastMessageAt: "asc" },
    take: 200,
    select: { id: true, tenantId: true, sessionId: true, setorId: true, contact: { select: { name: true, waJid: true } } },
  });
  if (!conversas.length) return 0;
  const candidatas = conversas.map((conversation) => ({ conversationId: conversation.id, conversation }));
  const ids = conversas.map((c) => c.id);

  const [freios, toques, mensagens] = await Promise.all([
    prisma.conversaAgente.findMany({ where: { conversationId: { in: ids }, estado: "DESLIGADO" }, select: { conversationId: true } }),
    prisma.acompanhamentoIa.findMany({ where: { conversationId: { in: ids } }, select: { conversationId: true, tentativa: true, resultado: true } }),
    prisma.message.findMany({
      where: { conversationId: { in: ids }, status: { not: "FAILED" } },
      orderBy: { createdAt: "asc" },
      take: 50_000,
      select: { conversationId: true, direction: true, body: true, createdAt: true, senderUserId: true, deCelular: true, referenciaExterna: true },
    }),
  ]);
  const comFreio = new Set(freios.map((f) => f.conversationId));
  const toquesDa = new Map<string, { enviados: number; descartada: boolean }>();
  for (const t of toques) {
    const x = toquesDa.get(t.conversationId) ?? { enviados: 0, descartada: false };
    if (t.tentativa === 0) x.descartada = true;
    else if (t.resultado === "enviada") x.enviados++;
    toquesDa.set(t.conversationId, x);
  }
  const mensagensDa = new Map<string, MensagemDaConversa[]>();
  for (const m of mensagens) mensagensDa.set(m.conversationId, [...(mensagensDa.get(m.conversationId) ?? []), { de: autorDaMensagem(m), em: m.createdAt, texto: m.body }]);

  const nomeLoja = loja.tenant.veiculosConfig?.nomeLoja?.trim() || loja.tenant.name;
  let enviados = 0;

  for (const c of candidatas) {
    if (enviados >= POR_RODADA || enviadosNaHora >= loja.acompanhamentoPorHora || enviadosNoDia >= TETO_POR_DIA) break;
    const conv = c.conversation;
    const estado = toquesDa.get(conv.id) ?? { enviados: 0, descartada: false };
    if (estado.descartada || comFreio.has(conv.id)) continue;

    const clienteJaEscreveu = (mensagensDa.get(conv.id) ?? []).some((m) => m.de === "cliente");
    if (!contatoAlcancavel(conv.contact.waJid, clienteJaEscreveu)) {
      await descartar(loja.tenantId, conv.id, "contato sem celular de WhatsApp");
      continue;
    }
    const d = decidirAcompanhamento({ mensagens: mensagensDa.get(conv.id) ?? [], toquesEnviados: estado.enviados, agora });
    if (d.acao === "esperar") continue;
    if (d.acao === "ignorar") {
      await descartar(loja.tenantId, conv.id, d.motivo);
      continue;
    }

    try {
      const carro = await carroDoLead(loja.tenantId, conv.id);
      const body = montarAcompanhamento({ tentativa: d.tentativa, nome: conv.contact.name ?? "", assistente: loja.nomeAssistente, loja: nomeLoja, carro, variante: varianteDaConversa(conv.id) });
      const conversa: Conversa = { id: conv.id, tenantId: conv.tenantId, sessionId: conv.sessionId, setorId: conv.setorId, contact: conv.contact };
      await enfileirar(conversa, [{ body }], "acomp");
      await prisma.acompanhamentoIa.create({ data: { tenantId: loja.tenantId, conversationId: conv.id, tentativa: d.tentativa, resultado: "enviada", enviadoEm: agora } });
      await deps.acordarFila?.(loja.tenantId);
      enviados++;
      enviadosNaHora++;
      enviadosNoDia++;
      // O espaçamento entre toques vale também dentro da rodada: o resto fica para as próximas voltas.
      break;
    } catch (e) {
      console.error(`[acompanhamento] conversa ${conv.id}:`, e instanceof Error ? e.message : e);
      await prisma.acompanhamentoIa
        .create({ data: { tenantId: loja.tenantId, conversationId: conv.id, tentativa: d.tentativa, resultado: `erro: ${e instanceof Error ? e.message : "desconhecido"}`.slice(0, 200), enviadoEm: agora } })
        .catch(() => {});
    }
  }
  return enviados;
}

/** Marca (tentativa 0) que esta conversa não recebe mais toques, para não reavaliar a cada volta. */
async function descartar(tenantId: string, conversationId: string, motivo: string) {
  await prisma.acompanhamentoIa.upsert({
    where: { conversationId_tentativa: { conversationId, tentativa: 0 } },
    create: { tenantId, conversationId, tentativa: 0, resultado: `ignorada: ${motivo}`.slice(0, 200) },
    update: {},
  });
}

/** O carro que o cliente pediu pelo portal, se ainda está à venda: o toque cita o carro; sem ele, fala de carro em geral. */
async function carroDoLead(tenantId: string, conversationId: string): Promise<string | null> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { contactId: true } });
  if (!conv) return null;
  const negs = await prisma.negociacao.findMany({ where: { tenantId, contactId: conv.contactId }, select: { id: true } });
  if (!negs.length) return null;
  const lead = await prisma.leadPortal.findFirst({ where: { tenantId, negociacaoId: { in: negs.map((n) => n.id) }, veiculoId: { not: null } }, orderBy: { recebidoEm: "desc" }, select: { veiculoId: true } });
  if (!lead?.veiculoId) return null;
  const v = await prisma.veiculo.findFirst({ where: { id: lead.veiculoId, tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } }, select: { marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true } });
  return v ? nomeDoVeiculo(v) : null;
}
