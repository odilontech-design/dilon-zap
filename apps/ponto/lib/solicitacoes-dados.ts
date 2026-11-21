import { prisma, type Prisma } from "@dilon-zap/ponto-db";
import { dataHoraNoFuso, horaNoFuso } from "@/lib/datas";
import { resumoSolicitacao, STATUS_SOLICITACAO, TIPOS_SOLICITACAO, type TipoSolicitacao } from "@/lib/solicitacoes-regras";

/** Solicitação pronta para a tela (datas formatadas, resumo em uma linha). */
export interface SolicitacaoVista {
  id: string;
  colaborador: string;
  tipo: TipoSolicitacao;
  tipoRotulo: string;
  status: keyof typeof STATUS_SOLICITACAO;
  statusRotulo: string;
  resumo: string;
  justificativa: string;
  anexo: boolean;
  abertaEm: string;
  decisao: string | null;
  resposta: string | null;
}

export async function listarSolicitacoes(where: Prisma.SolicitacaoWhereInput, fuso: string, take = 100): Promise<SolicitacaoVista[]> {
  const lista = await prisma.solicitacao.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    take,
    include: { colaborador: { select: { nome: true } } },
  });
  const ids = lista.map((s) => s.marcacaoId).filter((x): x is string => Boolean(x));
  const marcacoes = ids.length
    ? new Map((await prisma.marcacao.findMany({ where: { id: { in: ids } }, select: { id: true, instante: true } })).map((m) => [m.id, m.instante]))
    : new Map<string, Date>();

  return lista.map((s) => {
    const marcada = s.marcacaoId ? marcacoes.get(s.marcacaoId) : undefined;
    return {
      id: s.id,
      colaborador: s.colaborador.nome,
      tipo: s.tipo,
      tipoRotulo: TIPOS_SOLICITACAO[s.tipo],
      status: s.status,
      statusRotulo: STATUS_SOLICITACAO[s.status],
      resumo: resumoSolicitacao({
        tipo: s.tipo,
        data: s.data.toISOString().slice(0, 10),
        dataFim: s.dataFim?.toISOString().slice(0, 10),
        hora: s.hora,
        diaSeguinte: s.diaSeguinte,
        minutos: s.minutos,
        horaMarcacao: marcada ? horaNoFuso(marcada, fuso) : null,
      }),
      justificativa: s.justificativa,
      anexo: Boolean(s.anexoChave),
      abertaEm: dataHoraNoFuso(s.criadoEm, fuso),
      decisao: s.decididoEm ? `${s.decididoPor ?? ""} em ${dataHoraNoFuso(s.decididoEm, fuso)}` : null,
      resposta: s.resposta,
    };
  });
}

export function contarPendentes(empresaId: string): Promise<number> {
  return prisma.solicitacao.count({ where: { empresaId, status: "PENDENTE" } });
}

export const TOM_STATUS = { PENDENTE: "amarelo", APROVADA: "verde", RECUSADA: "vermelho", CANCELADA: "neutro" } as const;
