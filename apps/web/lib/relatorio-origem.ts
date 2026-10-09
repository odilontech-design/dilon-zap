/**
 * Relatório de origem dos leads: de onde vêm as negociações e quais origens
 * viram dinheiro. Puro, sem banco e sem tela.
 *
 * Duas escolhas:
 *
 *  1. COORTE. O recorte de período é a data de CRIAÇÃO: "dos leads que chegaram
 *     em setembro, quantos já fecharam?". Contar só quem fechou em setembro
 *     misturaria safras e faria uma origem nova parecer pior do que é.
 *
 *  2. AGRUPAR O QUE É IGUAL. A origem é texto livre, e "Instagram", "instagram"
 *     e " Instagram " são a mesma coisa para quem lê o relatório. A chave ignora
 *     maiúsculas, acentos e espaços nas pontas; o nome exibido é a grafia mais
 *     usada. Negociação sem origem vira "Sem origem" — também uma resposta, e
 *     muitas vezes a maior: mostra quanto do funil ninguém sabe de onde veio.
 */

import { diasEntre, filtrarNegociacoes, type EventoIn, type NegociacaoIn } from "./funil-indicadores";

export const SEM_ORIGEM = "Sem origem";

export type LinhaDeOrigem = {
  origem: string;
  leads: number;
  sqls: number;
  abertas: number;
  ganhas: number;
  perdidas: number;
  /** ganhas / (ganhas + perdidas). null sem nenhuma decidida. */
  taxaDeGanho: number | null;
  /** ganhas / leads: do que entrou, quanto virou cliente. */
  conversaoLeadCliente: number | null;
  valorGanhoCents: number;
  novoMrrCents: number;
  ticketMedioCents: number | null;
  cicloMedioDias: number | null;
  /** Parte dos leads do período: para ver quão concentrado está o funil. */
  participacao: number;
};

export type RelatorioOrigem = {
  linhas: LinhaDeOrigem[];
  total: { leads: number; ganhas: number; valorGanhoCents: number; conversaoLeadCliente: number | null };
};

/** Minúsculas, sem acento, espaços colapsados. */
export function chaveDaOrigem(texto: string | null | undefined): string {
  const limpo = (texto ?? "").trim().replace(/\s+/g, " ");
  if (!limpo) return "";
  return limpo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const razao = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function calcularPorOrigem(args: {
  negociacoes: NegociacaoIn[];
  eventos: EventoIn[];
  etapaSqlId: string | null;
  desde?: Date;
  ate?: Date;
}): RelatorioOrigem {
  const coorte = filtrarNegociacoes(args.negociacoes, { desde: args.desde, ate: args.ate });

  // Quem passou pela etapa de qualificação, pelo histórico (mesma regra dos
  // indicadores de SaaS, incluindo a rede de segurança da etapa atual).
  const passouPelaSql = new Set<string>();
  if (args.etapaSqlId) {
    for (const e of args.eventos) {
      if ((e.tipo === "CRIADA" || e.tipo === "ETAPA") && e.paraStageId === args.etapaSqlId) passouPelaSql.add(e.negociacaoId);
    }
    for (const n of args.negociacoes) if (n.stageId === args.etapaSqlId) passouPelaSql.add(n.id);
  }

  // Agrupa por chave e guarda a grafia mais usada de cada uma.
  const grupos = new Map<string, { negs: NegociacaoIn[]; grafias: Map<string, number> }>();
  for (const n of coorte) {
    const chave = chaveDaOrigem(n.origem);
    const g = grupos.get(chave) ?? { negs: [] as NegociacaoIn[], grafias: new Map<string, number>() };
    g.negs.push(n);
    if (chave) {
      const grafia = (n.origem ?? "").trim().replace(/\s+/g, " ");
      g.grafias.set(grafia, (g.grafias.get(grafia) ?? 0) + 1);
    }
    grupos.set(chave, g);
  }

  const totalLeads = coorte.length;
  const linhas: LinhaDeOrigem[] = [...grupos.entries()].map(([chave, g]) => {
    const ganhas = g.negs.filter((n) => n.status === "GANHA");
    const perdidas = g.negs.filter((n) => n.status === "PERDIDA");
    const ciclos = ganhas.filter((n) => n.fechadaEm).map((n) => diasEntre(n.createdAt, n.fechadaEm!));
    const valorGanho = ganhas.reduce((s, n) => s + n.valorCents, 0);

    let origem = SEM_ORIGEM;
    if (chave) {
      // Grafia mais usada; em empate, a que apareceu primeiro.
      origem = [...g.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0];
    }

    return {
      origem,
      leads: g.negs.length,
      sqls: g.negs.filter((n) => passouPelaSql.has(n.id)).length,
      abertas: g.negs.filter((n) => n.status === "ABERTA").length,
      ganhas: ganhas.length,
      perdidas: perdidas.length,
      taxaDeGanho: razao(ganhas.length, ganhas.length + perdidas.length),
      conversaoLeadCliente: razao(ganhas.length, g.negs.length),
      valorGanhoCents: valorGanho,
      novoMrrCents: ganhas.reduce((s, n) => s + n.valorMensalCents, 0),
      ticketMedioCents: ganhas.length ? Math.round(valorGanho / ganhas.length) : null,
      cicloMedioDias: ciclos.length ? Math.round(ciclos.reduce((s, d) => s + d, 0) / ciclos.length) : null,
      participacao: totalLeads ? g.negs.length / totalLeads : 0,
    };
  });

  // Mais leads primeiro; "Sem origem" por último em empate, para não encabeçar a lista.
  linhas.sort((a, b) => b.leads - a.leads || (a.origem === SEM_ORIGEM ? 1 : b.origem === SEM_ORIGEM ? -1 : a.origem.localeCompare(b.origem)));

  const ganhasTotal = coorte.filter((n) => n.status === "GANHA");
  return {
    linhas,
    total: {
      leads: totalLeads,
      ganhas: ganhasTotal.length,
      valorGanhoCents: ganhasTotal.reduce((s, n) => s + n.valorCents, 0),
      conversaoLeadCliente: razao(ganhasTotal.length, totalLeads),
    },
  };
}
