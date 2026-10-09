import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";

/**
 * Tudo que MUDA uma negociação passa por aqui, e cada mudança grava o evento
 * correspondente na mesma transação.
 *
 * O histórico não é enfeite: os indicadores de conversão leem dele (ver
 * funil-indicadores.ts). Uma rota que mudasse a etapa sem gravar o evento
 * faria a negociação "pular" a etapa nas estatísticas, e a taxa de conversão
 * ficaria errada sem erro nenhum. Por isso as rotas não chamam
 * `prisma.negociacao.update` direto.
 *
 * Quem chama já conferiu que a negociação é do tenant da sessão.
 */

type Quem = Pick<CurrentUser, "id" | "name">;

type NegociacaoAtual = {
  id: string;
  funilId: string;
  stageId: string;
  status: "ABERTA" | "GANHA" | "PERDIDA";
};

export class ErroDeNegocio extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** A etapa tem que ser do mesmo funil da negociação — não se "pula" de funil movendo. */
async function etapaDoFunil(stageId: string, funilId: string) {
  const etapa = await prisma.stage.findFirst({ where: { id: stageId, funilId } });
  if (!etapa) throw new ErroDeNegocio("etapa não pertence a este funil", 400);
  return etapa;
}

export async function criarNegociacao(args: {
  tenantId: string;
  quem: Quem;
  contactId: string;
  funilId: string;
  stageId: string;
  titulo: string;
  valorCents: number;
  recorrencia: "UNICA" | "MENSAL";
  responsavelId: string | null;
  origem: string | null;
  previsaoFechamento: Date | null;
}) {
  const etapa = await etapaDoFunil(args.stageId, args.funilId);
  return prisma.$transaction(async (tx) => {
    const negociacao = await tx.negociacao.create({
      data: {
        tenantId: args.tenantId,
        contactId: args.contactId,
        funilId: args.funilId,
        stageId: etapa.id,
        titulo: args.titulo,
        valorCents: args.valorCents,
        recorrencia: args.recorrencia,
        responsavelId: args.responsavelId,
        origem: args.origem,
        previsaoFechamento: args.previsaoFechamento,
      },
    });
    await tx.historicoDeEtapa.create({
      data: {
        negociacaoId: negociacao.id,
        tipo: "CRIADA",
        paraStageId: etapa.id,
        paraEtapaNome: etapa.name,
        porUserId: args.quem.id,
        porNome: args.quem.name,
      },
    });
    return negociacao;
  });
}

export async function moverNegociacao(n: NegociacaoAtual, stageId: string, quem: Quem) {
  if (n.status !== "ABERTA") throw new ErroDeNegocio("reabra a negociação antes de mover", 409);
  if (n.stageId === stageId) return;

  const [de, para] = await Promise.all([
    prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } }),
    etapaDoFunil(stageId, n.funilId),
  ]);

  await prisma.$transaction([
    prisma.negociacao.update({ where: { id: n.id }, data: { stageId: para.id, etapaDesde: new Date() } }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "ETAPA",
        deStageId: n.stageId,
        paraStageId: para.id,
        deEtapaNome: de?.name ?? null,
        paraEtapaNome: para.name,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

export async function ganharNegociacao(n: NegociacaoAtual, quem: Quem) {
  if (n.status !== "ABERTA") throw new ErroDeNegocio("a negociação já foi encerrada", 409);
  const etapa = await prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } });
  await prisma.$transaction([
    prisma.negociacao.update({
      where: { id: n.id },
      data: { status: "GANHA", fechadaEm: new Date(), motivoPerdaId: null, detalhePerda: null },
    }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "GANHA",
        deStageId: n.stageId,
        deEtapaNome: etapa?.name ?? null,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

export async function perderNegociacao(
  n: NegociacaoAtual,
  tenantId: string,
  motivo: { motivoPerdaId: string | null; detalhe: string | null },
  quem: Quem
) {
  if (n.status !== "ABERTA") throw new ErroDeNegocio("a negociação já foi encerrada", 409);

  // Perda sem motivo não ensina nada: a lista existe pra responder "por que
  // estamos perdendo?". O motivo precisa ser da empresa.
  if (!motivo.motivoPerdaId) throw new ErroDeNegocio("informe o motivo da perda", 400);
  const m = await prisma.motivoDePerda.findFirst({ where: { id: motivo.motivoPerdaId, tenantId } });
  if (!m) throw new ErroDeNegocio("motivo de perda inválido", 400);

  const etapa = await prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } });
  await prisma.$transaction([
    prisma.negociacao.update({
      where: { id: n.id },
      data: { status: "PERDIDA", fechadaEm: new Date(), motivoPerdaId: m.id, detalhePerda: motivo.detalhe },
    }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "PERDIDA",
        deStageId: n.stageId,
        deEtapaNome: etapa?.name ?? null,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}

/** Reabre uma negociação encerrada, opcionalmente numa etapa específica. */
export async function reabrirNegociacao(n: NegociacaoAtual, quem: Quem, stageId?: string) {
  if (n.status === "ABERTA") throw new ErroDeNegocio("a negociação já está aberta", 409);
  const destino = stageId ? await etapaDoFunil(stageId, n.funilId) : null;
  const alvoId = destino?.id ?? n.stageId;
  const alvoNome = destino?.name ?? (await prisma.stage.findUnique({ where: { id: n.stageId }, select: { name: true } }))?.name ?? null;

  await prisma.$transaction([
    prisma.negociacao.update({
      where: { id: n.id },
      data: {
        status: "ABERTA",
        fechadaEm: null,
        motivoPerdaId: null,
        detalhePerda: null,
        stageId: alvoId,
        // Reabrir recomeça a contagem de "parada": senão ela voltaria já
        // marcada como esquecida, com a data de meses atrás.
        etapaDesde: new Date(),
      },
    }),
    prisma.historicoDeEtapa.create({
      data: {
        negociacaoId: n.id,
        tipo: "REABERTA",
        paraStageId: alvoId,
        paraEtapaNome: alvoNome,
        porUserId: quem.id,
        porNome: quem.name,
      },
    }),
  ]);
}
