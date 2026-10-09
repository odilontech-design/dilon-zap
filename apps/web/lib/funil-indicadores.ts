/**
 * Indicadores do funil de vendas: puro, sem banco e sem tela.
 *
 * Mora aqui, com teste, porque indicador errado PARECE certo. Uma taxa de
 * conversão de 31% em vez de 21% não dá erro, não trava nada e vira decisão de
 * onde investir. A conta é o que pode sair errada, então é a parte que se
 * testa sem subir navegador nem banco.
 *
 * Duas escolhas de método que atravessam tudo, e que o resto do arquivo só
 * aplica:
 *
 *  1. CONVERSÃO É POR COORTE. A taxa de uma etapa responde "das negociações que
 *     CRIEI no período, quantas chegaram aqui?" — e não "quantas estão aqui
 *     hoje". Contar quem está parado na etapa faria a taxa despencar sempre que
 *     chegasse lead novo, mesmo com o processo igual.
 *
 *  2. "CHEGOU NA ETAPA" VEM DO HISTÓRICO, nunca da etapa atual. Uma negociação
 *     que foi à proposta e voltou à qualificação passou pela proposta; olhar só
 *     onde está esconderia isso.
 */

export type StatusNegociacao = "ABERTA" | "GANHA" | "PERDIDA";
export type Recorrencia = "UNICA" | "MENSAL";
export type TipoEvento = "CRIADA" | "ETAPA" | "GANHA" | "PERDIDA" | "REABERTA";

export type EtapaIn = { id: string; nome: string; position: number; probabilidade: number };

export type NegociacaoIn = {
  id: string;
  funilId: string;
  stageId: string;
  status: StatusNegociacao;
  valorCents: number;
  recorrencia: Recorrencia;
  responsavelId: string | null;
  origem: string | null;
  motivoPerdaId: string | null;
  previsaoFechamento: Date | null;
  etapaDesde: Date;
  createdAt: Date;
  fechadaEm: Date | null;
};

export type EventoIn = { negociacaoId: string; tipo: TipoEvento; paraStageId: string | null; em: Date };

export type FiltrosFunil = {
  funilId?: string;
  responsavelId?: string | "sem";
  origem?: string;
  /** Período de CRIAÇÃO da negociação — define a coorte. */
  desde?: Date;
  ate?: Date;
};

const MS_DIA = 86_400_000;

/**
 * Filtra as negociações. Um único lugar, usado pelo quadro E pelos indicadores:
 * se cada um filtrasse do seu jeito, o quadro mostraria 40 negociações e o
 * indicador contaria 37 — e ninguém saberia qual está certo.
 */
export function filtrarNegociacoes(negociacoes: NegociacaoIn[], f: FiltrosFunil): NegociacaoIn[] {
  return negociacoes.filter((n) => {
    if (f.funilId && n.funilId !== f.funilId) return false;
    if (f.responsavelId === "sem" && n.responsavelId !== null) return false;
    if (f.responsavelId && f.responsavelId !== "sem" && n.responsavelId !== f.responsavelId) return false;
    if (f.origem && (n.origem ?? "") !== f.origem) return false;
    if (f.desde && n.createdAt < f.desde) return false;
    if (f.ate && n.createdAt > f.ate) return false;
    return true;
  });
}

/** Dias inteiros entre duas datas, nunca negativo. */
export function diasEntre(de: Date, ate: Date): number {
  return Math.max(0, Math.floor((ate.getTime() - de.getTime()) / MS_DIA));
}

/** Etapas que cada negociação já ocupou, na ordem em que aconteceu. */
function etapasAlcancadas(n: NegociacaoIn, eventos: EventoIn[]): Set<string> {
  const alcancadas = new Set<string>();
  for (const e of eventos) {
    if (e.negociacaoId !== n.id) continue;
    if ((e.tipo === "CRIADA" || e.tipo === "ETAPA") && e.paraStageId) alcancadas.add(e.paraStageId);
  }
  // Rede de segurança: negociação sem evento (migrada, ou criada antes do
  // histórico) ainda conta na etapa onde está, em vez de sumir do funil.
  alcancadas.add(n.stageId);
  return alcancadas;
}

export type LinhaDeEtapa = {
  etapaId: string;
  nome: string;
  /** Negociações da coorte que já ocuparam esta etapa. */
  chegaram: number;
  /** Sobre a primeira etapa: o funil acumulado. null na primeira. */
  taxaDesdeOInicio: number | null;
  /** Sobre a etapa anterior: onde o funil vaza. null na primeira. */
  taxaDaAnterior: number | null;
  /** Abertas hoje nesta etapa, e o valor delas. */
  abertasAgora: number;
  valorAbertasCents: number;
};

export type Indicadores = {
  /** Quantas negociações a coorte tem. */
  total: number;
  abertas: number;
  ganhas: number;
  perdidas: number;
  /** ganhas / (ganhas + perdidas). null sem nenhuma decidida. */
  taxaDeGanho: number | null;
  valorGanhoCents: number;
  valorAbertoCents: number;
  /** Ticket médio das ganhas. null sem ganhas. */
  ticketMedioCents: number | null;
  /** Dias médios entre criar e ganhar. null sem ganhas. */
  cicloMedioDias: number | null;
  /** Soma dos valores abertos × probabilidade da etapa. */
  previsaoPonderadaCents: number;
  /** MRR novo: valor das ganhas MENSAL. */
  novoMrrCents: number;
  /** Abertas há mais de `diasParada` dias na mesma etapa. */
  paradas: number;
  porEtapa: LinhaDeEtapa[];
  perdasPorMotivo: { motivoId: string | null; quantidade: number; valorCents: number }[];
};

export function calcularIndicadores(args: {
  negociacoes: NegociacaoIn[];
  eventos: EventoIn[];
  /** As etapas do funil analisado, em qualquer ordem. */
  etapas: EtapaIn[];
  agora: Date;
  diasParada?: number;
}): Indicadores {
  const { negociacoes, eventos, agora } = args;
  const diasParada = args.diasParada ?? 14;
  const etapas = [...args.etapas].sort((a, b) => a.position - b.position);
  const probabilidadeDe = new Map(etapas.map((e) => [e.id, e.probabilidade]));

  const abertas = negociacoes.filter((n) => n.status === "ABERTA");
  const ganhas = negociacoes.filter((n) => n.status === "GANHA");
  const perdidas = negociacoes.filter((n) => n.status === "PERDIDA");

  const soma = (l: NegociacaoIn[]) => l.reduce((s, n) => s + n.valorCents, 0);

  // Ciclo só das ganhas COM data de fechamento: uma ganha sem fechadaEm é dado
  // incompleto, e contá-la como zero dias puxaria a média pra baixo.
  const ciclos = ganhas.filter((n) => n.fechadaEm).map((n) => diasEntre(n.createdAt, n.fechadaEm!));

  const decididas = ganhas.length + perdidas.length;

  // Coorte por etapa: quantas já ocuparam cada uma.
  const alcancePorNegociacao = new Map(negociacoes.map((n) => [n.id, etapasAlcancadas(n, eventos)]));
  const primeiraEtapa = etapas[0];
  const chegaramNaPrimeira = primeiraEtapa
    ? negociacoes.filter((n) => alcancePorNegociacao.get(n.id)!.has(primeiraEtapa.id)).length
    : 0;

  let anterior: number | null = null;
  const porEtapa: LinhaDeEtapa[] = etapas.map((etapa, i) => {
    const chegaram = negociacoes.filter((n) => alcancePorNegociacao.get(n.id)!.has(etapa.id)).length;
    const agoraAqui = abertas.filter((n) => n.stageId === etapa.id);

    const linha: LinhaDeEtapa = {
      etapaId: etapa.id,
      nome: etapa.nome,
      chegaram,
      taxaDesdeOInicio: i === 0 || chegaramNaPrimeira === 0 ? null : chegaram / chegaramNaPrimeira,
      taxaDaAnterior: i === 0 || !anterior ? null : chegaram / anterior,
      abertasAgora: agoraAqui.length,
      valorAbertasCents: soma(agoraAqui),
    };
    anterior = chegaram;
    return linha;
  });

  const perdasMap = new Map<string | null, { quantidade: number; valorCents: number }>();
  for (const n of perdidas) {
    const atual = perdasMap.get(n.motivoPerdaId) ?? { quantidade: 0, valorCents: 0 };
    atual.quantidade += 1;
    atual.valorCents += n.valorCents;
    perdasMap.set(n.motivoPerdaId, atual);
  }

  return {
    total: negociacoes.length,
    abertas: abertas.length,
    ganhas: ganhas.length,
    perdidas: perdidas.length,
    taxaDeGanho: decididas === 0 ? null : ganhas.length / decididas,
    valorGanhoCents: soma(ganhas),
    valorAbertoCents: soma(abertas),
    ticketMedioCents: ganhas.length === 0 ? null : Math.round(soma(ganhas) / ganhas.length),
    cicloMedioDias: ciclos.length === 0 ? null : Math.round(ciclos.reduce((s, d) => s + d, 0) / ciclos.length),
    previsaoPonderadaCents: Math.round(
      abertas.reduce((s, n) => s + (n.valorCents * (probabilidadeDe.get(n.stageId) ?? 0)) / 100, 0)
    ),
    novoMrrCents: soma(ganhas.filter((n) => n.recorrencia === "MENSAL")),
    paradas: abertas.filter((n) => diasEntre(n.etapaDesde, agora) > diasParada).length,
    porEtapa,
    perdasPorMotivo: [...perdasMap.entries()]
      .map(([motivoId, v]) => ({ motivoId, ...v }))
      .sort((a, b) => b.quantidade - a.quantidade),
  };
}

/**
 * Taxa como texto, num lugar só. Existe porque `0.2133` na tela vira "21%" ou
 * "21,3%" conforme quem formata, e dois lugares formatando diferente fariam o
 * mesmo número parecer dois.
 */
export function formatarTaxa(taxa: number | null): string {
  if (taxa === null) return "—";
  const pct = taxa * 100;
  // Uma casa só quando faz diferença: "21%" e não "21,0%", mas "0,8%" e não "1%".
  return `${(pct >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10).toString().replace(".", ",")}%`;
}
