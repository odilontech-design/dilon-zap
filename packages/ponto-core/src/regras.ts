/**
 * Regras de cálculo de jornada.
 *
 * Os padrões são os da CLT. Convenção coletiva muda vários deles (percentual
 * de hora extra, faixa noturna, adicional), e por isso tudo é configurável por
 * jornada. Percentuais em pontos-base: 5000 = 50%.
 *
 * Estes padrões são ponto de partida e precisam de revisão de um profissional
 * de DP ou de um advogado trabalhista antes de ir para cliente.
 */

/**
 * - `UTIL`: dia com jornada prevista (ou flexível).
 * - `DESCANSO`: folga ou repouso semanal. Tudo o que for trabalhado é extra.
 * - `FERIADO`: igual ao descanso, salvo se `feriadoTrabalhadoComoExtra` for
 *   falso (escala 12x36, art. 59-A, parágrafo único), quando vira dia comum.
 */
export type TipoDia = "UTIL" | "DESCANSO" | "FERIADO";

/**
 * Faixa de hora extra em dia útil. As faixas são acumulativas: com
 * `[{ateMin: 120, 5000}, {ateMin: null, 10000}]`, as 2 primeiras horas extras
 * do dia saem a 50% e o que passar disso a 100%.
 */
export interface FaixaExtra {
  ateMin: number | null;
  percentualBp: number;
}

export interface RegrasCalculo {
  /** Art. 58, §1º: variação por marcação que não conta. */
  toleranciaPorMarcacaoMin: number;
  /** Art. 58, §1º: teto diário da soma das variações. */
  toleranciaDiariaMin: number;

  extrasDiaUtil: FaixaExtra[];
  /** Domingos, folgas e feriados trabalhados. */
  percentualDescansoBp: number;
  feriadoTrabalhadoComoExtra: boolean;
  /** Art. 59: até 2 horas extras por dia. Passar disso gera ocorrência. */
  limiteExtraDiarioMin: number;

  noturno: {
    /** Art. 73: urbano das 22h às 5h. */
    inicioMin: number;
    fimMin: number;
    percentualBp: number;
    /** Art. 73, §1º: a hora noturna tem 52min30s. */
    horaReduzida: boolean;
    /**
     * Súmula 60, II, do TST: quem cumpre o período noturno inteiro e continua
     * trabalhando recebe o adicional também sobre as horas prorrogadas.
     */
    prorrogacao: boolean;
  };

  /** Art. 66: 11 horas entre o fim de uma jornada e o início da próxima. */
  interjornadaMinimaMin: number;

  /** Art. 71: intervalo mínimo conforme a duração trabalhada. */
  intervalo: {
    /** Jornada acima de 6h. */
    acimaDe6hMin: number;
    /** Jornada acima de 4h e até 6h. */
    acimaDe4hMin: number;
  };
}

export const REGRAS_CLT_PADRAO: RegrasCalculo = {
  toleranciaPorMarcacaoMin: 5,
  toleranciaDiariaMin: 10,
  extrasDiaUtil: [{ ateMin: null, percentualBp: 5000 }],
  percentualDescansoBp: 10000,
  feriadoTrabalhadoComoExtra: true,
  limiteExtraDiarioMin: 120,
  noturno: {
    inicioMin: 22 * 60,
    fimMin: 5 * 60,
    percentualBp: 2000,
    horaReduzida: true,
    prorrogacao: true,
  },
  interjornadaMinimaMin: 11 * 60,
  intervalo: { acimaDe6hMin: 60, acimaDe4hMin: 15 },
};

/** Monta regras a partir do padrão da CLT, trocando só o que a jornada muda. */
export function regras(sobrescrever: Partial<RegrasCalculo> = {}): RegrasCalculo {
  return {
    ...REGRAS_CLT_PADRAO,
    ...sobrescrever,
    noturno: { ...REGRAS_CLT_PADRAO.noturno, ...sobrescrever.noturno },
    intervalo: { ...REGRAS_CLT_PADRAO.intervalo, ...sobrescrever.intervalo },
  };
}

/** Intervalo intrajornada exigido para quem trabalhou `trabalhadoMin` (tempo real). */
export function intervaloExigido(trabalhadoMin: number, r: RegrasCalculo): number {
  if (trabalhadoMin > 6 * 60) return r.intervalo.acimaDe6hMin;
  if (trabalhadoMin > 4 * 60) return r.intervalo.acimaDe4hMin;
  return 0;
}
