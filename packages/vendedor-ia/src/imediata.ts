import { prisma } from "@dilon-zap/db";
import { enfileirar, executarFerramenta, lojasAtivas, usoDoMes, type Conversa, type Dependencias, type Loja } from "./executar";
import { nomeDoVeiculo } from "./ficha";

/**
 * Resposta imediata ao lead de portal: quando um lead com telefone chega (Na Pista, MobiAuto, Webmotors...), a IA manda
 * a primeira mensagem em segundos, pelo WhatsApp da loja, com a ficha e as fotos do carro. Se o cliente responder,
 * o Vendedor IA continua a conversa (as regras normais).
 *
 * Roda no worker do Vendedor IA, nunca no do WhatsApp: só grava a mensagem na fila de saída, como a IA já faz.
 * Cuidados para o número da loja não ser tratado como disparo em massa:
 *  - só leads que chegaram DEPOIS de ligar o recurso (`respostaImediataDesde`): ligar não dispara para o atraso;
 *  - só até 60 min depois do lead chegar (resposta de "agora" que chega horas depois soa pior que nenhuma);
 *  - teto por hora (`respostaImediataPorHora`) e pelo menos 20 s entre uma e outra;
 *  - só no horário da loja (7h às 22h), só para celular, e nunca para quem já está em conversa com a loja.
 */

export const PRAZO_DO_LEAD_MS = 60 * 60_000;
export const INTERVALO_ENTRE_ENVIOS_MS = 20_000;
export const HORA_INICIAL = 7;
export const HORA_FINAL = 22;
const POR_RODADA = 3;

export const celular = (telefone: string | null) => !!telefone && telefone.length === 13 && telefone.startsWith("55") && telefone[4] === "9";

export function horaNaLoja(agora: Date, timezone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(agora)) % 24;
}

/** O primeiro nome do jeito de falar: só se for nome mesmo (letras), senão sem nome. */
export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  if (!/^[\p{L}'-]{2,20}$/u.test(p)) return "";
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

export function montarSaudacao(i: { nome: string; assistente: string; loja: string; carro: string | null; portal: string }): string {
  const oi = primeiroNome(i.nome) ? `Olá, ${primeiroNome(i.nome)}!` : "Olá!";
  const quem = `Aqui é ${i.assistente} da ${i.loja}.`;
  return i.carro
    ? `${oi} ${quem} Vi que você se interessou pelo ${i.carro} no ${i.portal}. Vou te mandar a ficha e as fotos, e já te ajudo com o que precisar. 😊`
    : `${oi} ${quem} Vi o seu contato pelo ${i.portal}. Me conta o que você procura que eu já te ajudo. 😊`;
}

async function marcar(leadId: string, resultado: string, agora: Date) {
  await prisma.leadPortal.update({ where: { id: leadId }, data: { automaticoEm: agora, automaticoResultado: resultado.slice(0, 200) } });
}

/** Uma volta: devolve quantas primeiras mensagens saíram. */
export async function cicloDeRespostaImediata(deps: Dependencias): Promise<{ enviadas: number; erros: number }> {
  const agora = deps.agora?.() ?? new Date();
  let enviadas = 0;
  let erros = 0;
  for (const loja of await lojasAtivas()) {
    if (!loja.respostaImediata || !loja.respostaImediataDesde) continue;
    try {
      enviadas += await tratarLoja(loja, deps, agora);
    } catch (e) {
      erros++;
      console.error(`[resposta-imediata] loja ${loja.tenantId}:`, e instanceof Error ? e.message : e);
    }
  }
  return { enviadas, erros };
}

async function tratarLoja(loja: Loja, deps: Dependencias, agora: Date): Promise<number> {
  const desde = new Date(Math.max(loja.respostaImediataDesde!.getTime(), agora.getTime() - PRAZO_DO_LEAD_MS));
  const leads = await prisma.leadPortal.findMany({
    where: { tenantId: loja.tenantId, automaticoEm: null, semTelefone: false, negociacaoId: { not: null }, telefone: { not: null }, recebidoEm: { gte: desde } },
    orderBy: { recebidoEm: "asc" },
    take: POR_RODADA,
  });
  if (!leads.length) return 0;

  const umaHoraAtras = new Date(agora.getTime() - 3_600_000);
  const [naHora, ultimo] = await Promise.all([
    prisma.leadPortal.count({ where: { tenantId: loja.tenantId, automaticoResultado: "enviada", automaticoEm: { gte: umaHoraAtras } } }),
    prisma.leadPortal.findFirst({ where: { tenantId: loja.tenantId, automaticoResultado: "enviada" }, orderBy: { automaticoEm: "desc" }, select: { automaticoEm: true } }),
  ]);
  let enviadasNaHora = naHora;
  let ultimoEnvio = ultimo?.automaticoEm?.getTime() ?? 0;
  let enviadas = 0;

  for (const lead of leads) {
    // Teto por hora e espaçamento: sem marcar, o lead espera a próxima volta (até o prazo de 60 min).
    if (enviadasNaHora >= loja.respostaImediataPorHora) break;
    if (agora.getTime() - ultimoEnvio < INTERVALO_ENTRE_ENVIOS_MS) break;

    const hora = horaNaLoja(agora, loja.tenant.timezone);
    if (hora < HORA_INICIAL || hora >= HORA_FINAL) {
      await marcar(lead.id, `ignorada: fora do horário (${HORA_INICIAL}h às ${HORA_FINAL}h)`, agora);
      continue;
    }
    if (!celular(lead.telefone)) {
      await marcar(lead.id, "ignorada: telefone não é celular", agora);
      continue;
    }
    try {
      const r = await responderLead(loja, lead, deps, agora);
      if (r === "enviada") {
        enviadas++;
        enviadasNaHora++;
        ultimoEnvio = agora.getTime();
      }
      await marcar(lead.id, r, agora);
    } catch (e) {
      console.error(`[resposta-imediata] lead ${lead.id}:`, e instanceof Error ? e.message : e);
      await marcar(lead.id, `erro: ${e instanceof Error ? e.message : "desconhecido"}`, agora);
    }
  }
  return enviadas;
}

async function responderLead(loja: Loja, lead: { id: string; portal: string; nome: string; veiculoId: string | null; negociacaoId: string | null }, deps: Dependencias, agora: Date): Promise<string> {
  // A conversa é a do contato da negociação do lead (da empresa da loja, sempre).
  const neg = lead.negociacaoId ? await prisma.negociacao.findFirst({ where: { id: lead.negociacaoId, tenantId: loja.tenantId }, select: { contactId: true } }) : null;
  if (!neg) return "ignorada: sem negociação";
  const sessao = await prisma.whatsAppSession.findFirst({ where: { tenantId: loja.tenantId, setorId: null, status: "CONNECTED" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!sessao) throw new Error("nenhum número de WhatsApp conectado");

  const existente = await prisma.conversation.findUnique({ where: { contactId_sessionId: { contactId: neg.contactId, sessionId: sessao.id } }, select: { id: true } });
  if (existente) {
    const [controle, ia, recente] = await Promise.all([
      prisma.conversaAgente.findUnique({ where: { conversationId: existente.id }, select: { estado: true } }),
      prisma.vendedorIaConversa.findUnique({ where: { conversationId: existente.id }, select: { status: true } }),
      // Já houve fala da loja (pessoa, celular ou IA) nas últimas 24 h: o cliente já está em conversa.
      prisma.message.findFirst({
        where: { conversationId: existente.id, direction: "OUTBOUND", status: { not: "FAILED" }, createdAt: { gte: new Date(agora.getTime() - 86_400_000) }, OR: [{ senderUserId: { not: null } }, { deCelular: true }, { referenciaExterna: { startsWith: "vendedor-ia:" } }] },
        select: { id: true },
      }),
    ]);
    if (controle?.estado === "DESLIGADO") return "ignorada: IA parada nesta conversa";
    if (ia?.status === "TRANSFERIDA") return "ignorada: conversa já com a equipe";
    if (recente) return "ignorada: já em conversa com a loja";
  }

  // Limite do mês, como a IA faz com conversa nova.
  const jaEraLead = existente ? await prisma.vendedorIaConversa.findUnique({ where: { conversationId: existente.id }, select: { conversationId: true } }) : null;
  if (!jaEraLead) {
    const uso = await usoDoMes(loja.tenantId, agora);
    const limite = loja.leadsContratados === null ? loja.limiteLeadsMes : Math.min(loja.limiteLeadsMes, loja.leadsContratados);
    if (uso.leads >= limite || (loja.limiteCustoMesCents != null && uso.custoMicrosUsd >= loja.limiteCustoMesCents * 10_000)) return "ignorada: limite do mês";
  }

  const carro = lead.veiculoId ? await prisma.veiculo.findFirst({ where: { id: lead.veiculoId, tenantId: loja.tenantId, status: { in: ["DISPONIVEL", "RESERVADO"] } }, select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true } }) : null;

  const conv = await prisma.conversation.upsert({
    where: { contactId_sessionId: { contactId: neg.contactId, sessionId: sessao.id } },
    update: {},
    create: { tenantId: loja.tenantId, contactId: neg.contactId, sessionId: sessao.id },
    select: { id: true, tenantId: true, sessionId: true, setorId: true },
  });
  const conversa: Conversa = conv;
  const nomePortal = ({ NAPISTA: "Na Pista", MOBIAUTO: "MobiAuto", WEBMOTORS: "Webmotors", OLX: "OLX", MERCADO_LIVRE: "Mercado Livre", INSTAGRAM: "Instagram" } as Record<string, string>)[lead.portal] ?? lead.portal;
  const nomeLoja = loja.tenant.veiculosConfig?.nomeLoja?.trim() || loja.tenant.name;
  await enfileirar(conversa, [{ body: montarSaudacao({ nome: lead.nome, assistente: loja.nomeAssistente, loja: nomeLoja, carro: carro ? nomeDoVeiculo(carro) : null, portal: nomePortal }) }]);
  // A ficha e as fotos, como o "Enviar carro" do Inbox (respeita preço e km "sob consulta").
  if (carro) await executarFerramenta({ name: "enviar_carro", input: { veiculo_id: carro.id, fotos: 3 } }, { conversa, loja, deps, agora });

  // Daqui em diante a conversa é da IA: se o cliente responder, ela continua. Conta como lead do mês.
  await prisma.vendedorIaConversa.upsert({
    where: { conversationId: conv.id },
    create: { conversationId: conv.id, tenantId: loja.tenantId, iniciadaEm: agora },
    update: {},
  });
  await deps.acordarFila?.(loja.tenantId);
  return "enviada";
}
