import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { usoDoMes } from "./executar";

/**
 * O controle do Vendedor IA de carros numa conversa, direto do Inbox: parar a IA ("assumir"), devolver a conversa a ela
 * ou voltar às regras automáticas. Usa a mesma tabela de controle por conversa que o vendedor do SDR (`ConversaAgente`):
 * DESLIGADO é o freio (a IA não responde mais aqui e o que ela deixou na fila é cancelado); LIGADO recomeça a conversa
 * para a IA, mesmo que a equipe já tivesse falado; sem linha, valem as regras automáticas.
 */

export class ErroDoControle extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
  }
}

export const controleDeCarrosSchema = z.object({ acao: z.enum(["ligar", "desligar", "automatico"]) }).strict();

/** As mensagens que a IA de carros grava levam este prefixo na referência externa (ver `enfileirar`). */
const PREFIXO_DA_IA = "vendedor-ia:";

async function conversaDoTenant(tenantId: string, conversationId: string) {
  const c = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId }, select: { id: true, contact: { select: { grupo: true } } } });
  if (!c) throw new ErroDoControle("conversa não encontrada", 404);
  if (c.contact.grupo) throw new ErroDoControle("o Vendedor IA não atende grupos", 409);
  return c;
}

/** O estado da IA nesta conversa, para a faixa do Inbox. */
export async function obterControleDeCarros(tenantId: string, conversationId: string) {
  await conversaDoTenant(tenantId, conversationId);
  const [cfg, controle, estado] = await Promise.all([
    prisma.vendedorIaConfig.findUnique({ where: { tenantId }, select: { ativo: true } }),
    prisma.conversaAgente.findUnique({ where: { conversationId } }),
    prisma.vendedorIaConversa.findUnique({ where: { conversationId } }),
  ]);
  return {
    /** O Vendedor IA está ligado na loja (Veículos > Vendedor IA). */
    ligadoNaLoja: cfg?.ativo ?? false,
    controle: controle && controle.tenantId === tenantId ? controle.estado : null,
    alteradoPor: controle?.alteradoPorNome ?? null,
    estado: estado && estado.tenantId === tenantId ? { status: estado.status, motivo: estado.motivo, resumo: estado.resumo, turnos: estado.turnos } : null,
  };
}

export async function definirControleDeCarros(tenantId: string, conversationId: string, bruto: unknown, autor: { id: string; name: string }, agora: Date = new Date()) {
  const d = controleDeCarrosSchema.parse(bruto);
  await conversaDoTenant(tenantId, conversationId);
  const quem = { alteradoPorId: autor.id, alteradoPorNome: autor.name };
  let canceladas = 0;

  if (d.acao === "automatico") {
    await prisma.conversaAgente.deleteMany({ where: { conversationId, tenantId } });
  } else if (d.acao === "desligar") {
    await prisma.conversaAgente.upsert({ where: { conversationId }, create: { conversationId, tenantId, estado: "DESLIGADO", ...quem }, update: { estado: "DESLIGADO", campanhaId: null, ...quem } });
    // Parar tem de valer já: o que a IA deixou na fila e ainda não saiu é cancelado.
    canceladas = (
      await prisma.message.updateMany({
        where: { conversationId, direction: "OUTBOUND", status: "PENDING", referenciaExterna: { startsWith: PREFIXO_DA_IA } },
        data: { status: "FAILED", errorMessage: "Cancelada: a equipe assumiu a conversa.", statusUpdatedAt: agora },
      })
    ).count;
    await prisma.vendedorIaConversa.updateMany({ where: { conversationId, tenantId, status: "ATIVA" }, data: { status: "TRANSFERIDA", motivo: `assumida por ${autor.name}`, transferidaEm: agora } });
  } else {
    const [cfg, atual] = await Promise.all([prisma.vendedorIaConfig.findUnique({ where: { tenantId } }), prisma.vendedorIaConversa.findUnique({ where: { conversationId } })]);
    if (!cfg?.ativo) throw new ErroDoControle("ligue o Vendedor IA em Veículos > Vendedor IA antes de devolver a conversa a ele", 409);
    // Conversa nova para a IA conta como lead: respeita os limites do mês (a que já era lead não conta de novo).
    if (!atual) {
      const uso = await usoDoMes(tenantId, agora);
      const limiteLeads = cfg.leadsContratados === null ? cfg.limiteLeadsMes : Math.min(cfg.limiteLeadsMes, cfg.leadsContratados);
      if (uso.leads >= limiteLeads || (cfg.limiteCustoMesCents != null && uso.custoMicrosUsd >= cfg.limiteCustoMesCents * 10_000)) {
        throw new ErroDoControle("o limite de leads ou de custo do mês do Vendedor IA foi atingido", 409);
      }
    }
    await prisma.conversaAgente.upsert({ where: { conversationId }, create: { conversationId, tenantId, estado: "LIGADO", ...quem }, update: { estado: "LIGADO", ...quem } });
    // Recomeça a conversa para a IA: zera o limite de respostas e passa a contar só as falas de pessoas dali em diante.
    // A última mensagem do cliente, se ainda estiver sem resposta, a IA responde.
    const zerado = { status: "ATIVA" as const, motivo: null, resumo: null, turnos: 0, respondidoAte: null, iniciadaEm: agora, transferidaEm: null };
    await prisma.vendedorIaConversa.upsert({ where: { conversationId }, create: { conversationId, tenantId, ...zerado }, update: zerado });
  }
  return { ...(await obterControleDeCarros(tenantId, conversationId)), canceladas };
}
