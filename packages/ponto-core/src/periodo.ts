import type { ApuracaoDia, ExtraPorPercentual } from "./apuracao";
import type { LancamentoBanco } from "./banco";

export interface DiaApurado {
  /** "AAAA-MM-DD" */
  data: string;
  apuracao: ApuracaoDia;
}

export interface OpcoesFechamento {
  /**
   * `null` = sem banco de horas: extra é paga e débito é descontado.
   * Com banco: extra de dia útil vira crédito e débito vira débito no banco.
   */
  bancoDeHoras: null | {
    /** Folga, domingo e feriado trabalhados também vão para o banco? Padrão comum: não, são pagos. */
    incluirDiasDeDescanso: boolean;
  };
}

export interface FechamentoPeriodo {
  dias: number;
  previstoMin: number;
  trabalhadoMin: number;
  noturnoReduzidoMin: number;
  faltas: number;
  atrasoMin: number;
  saidaAntecipadaMin: number;
  abonoMin: number;
  intervaloSuprimidoMin: number;
  interjornadaFaltanteMin: number;

  /** Horas extras a pagar no período, agrupadas por percentual. */
  extrasAPagar: ExtraPorPercentual[];
  /** Débito a descontar (só sem banco de horas). */
  debitoADescontarMin: number;
  /** Movimento do banco gerado pelo período (alimenta `extratoBanco`). */
  lancamentosBanco: LancamentoBanco[];

  /** Dias com marcação ímpar: o fechamento não deveria ser confirmado com eles. */
  diasIncompletos: string[];
}

/**
 * Soma os dias apurados de um período e decide o destino de cada minuto:
 * pagamento ou banco de horas. Não arredonda nada; o que vai para a folha
 * em horas decimais é conversão da camada de exportação.
 */
export function fecharPeriodo(dias: DiaApurado[], opcoes: OpcoesFechamento): FechamentoPeriodo {
  const extrasAPagar = new Map<number, number>();
  const pagar = (e: ExtraPorPercentual) =>
    extrasAPagar.set(e.percentualBp, (extrasAPagar.get(e.percentualBp) ?? 0) + e.minutos);

  const r: FechamentoPeriodo = {
    dias: dias.length,
    previstoMin: 0,
    trabalhadoMin: 0,
    noturnoReduzidoMin: 0,
    faltas: 0,
    atrasoMin: 0,
    saidaAntecipadaMin: 0,
    abonoMin: 0,
    intervaloSuprimidoMin: 0,
    interjornadaFaltanteMin: 0,
    extrasAPagar: [],
    debitoADescontarMin: 0,
    lancamentosBanco: [],
    diasIncompletos: [],
  };

  for (const { data, apuracao: a } of [...dias].sort((x, y) => x.data.localeCompare(y.data))) {
    r.previstoMin += a.previstoMin;
    r.trabalhadoMin += a.trabalhadoMin;
    r.noturnoReduzidoMin += a.noturnoReduzidoMin;
    r.faltas += a.falta && a.debitoMin > 0 ? 1 : 0;
    r.atrasoMin += a.atrasoMin;
    r.saidaAntecipadaMin += a.saidaAntecipadaMin;
    r.abonoMin += a.abonoUsadoMin;
    r.intervaloSuprimidoMin += a.intervalo.suprimidoMin;
    r.interjornadaFaltanteMin += a.interjornada?.faltanteMin ?? 0;
    if (a.incompleto) r.diasIncompletos.push(data);

    const vaiProBanco =
      opcoes.bancoDeHoras != null && (!a.descanso || opcoes.bancoDeHoras.incluirDiasDeDescanso);

    if (vaiProBanco) {
      if (a.extraMin > 0) r.lancamentosBanco.push({ data, minutos: a.extraMin, descricao: "Crédito do dia" });
      if (a.debitoMin > 0) r.lancamentosBanco.push({ data, minutos: -a.debitoMin, descricao: "Débito do dia" });
    } else {
      a.extras.forEach(pagar);
      r.debitoADescontarMin += a.debitoMin;
    }
  }

  r.extrasAPagar = [...extrasAPagar.entries()]
    .sort(([a], [b]) => a - b)
    .map(([percentualBp, minutos]) => ({ percentualBp, minutos }));
  return r;
}
