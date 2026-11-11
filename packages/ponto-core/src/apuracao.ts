import { duracao, type Minuto, type Periodo } from "./tempo";
import { intervaloExigido, type FaixaExtra, type RegrasCalculo, type TipoDia } from "./regras";
import { minutosNoturnos, noturnoReduzido } from "./noturno";

export interface EntradaDia {
  tipoDia: TipoDia;
  /** Turnos previstos pela jornada nesse dia. Vazio = sem horário previsto. */
  previsto: Periodo[];
  /**
   * Marcações JÁ TRATADAS (inclusões aplicadas, desconsideradas removidas),
   * na linha do tempo do dia. A ordem não importa.
   */
  marcacoes: Minuto[];
  /** Minutos abonados (atestado, consulta). Só cobrem débito, nunca geram extra. */
  abonoMin?: number;
  /** Última saída da jornada anterior, para a interjornada. Normalmente negativa. */
  ultimaSaidaAnterior?: Minuto | null;
}

export type CodigoOcorrencia =
  | "MARCACAO_IMPAR"
  | "FALTA"
  | "ATRASO"
  | "SAIDA_ANTECIPADA"
  | "HORA_EXTRA"
  | "LIMITE_EXTRA_EXCEDIDO"
  | "TRABALHO_EM_DESCANSO"
  | "INTERVALO_INSUFICIENTE"
  | "INTERJORNADA_INSUFICIENTE";

export interface ExtraPorPercentual {
  percentualBp: number;
  minutos: number;
}

export interface ApuracaoDia {
  /** Períodos trabalhados montados a partir das marcações (pares entrada/saída). */
  periodos: Periodo[];
  /** Ficou marcação sem par: o dia precisa de tratamento antes do fechamento. */
  incompleto: boolean;
  /** Folga, repouso ou feriado pago como extra: nada previsto, tudo é extra. */
  descanso: boolean;

  previstoMin: number;
  /** Tempo de relógio trabalhado. */
  trabalhadoMin: number;
  /** Com a hora noturna reduzida aplicada; é o que entra no saldo. */
  trabalhadoComputadoMin: number;
  previstoComputadoMin: number;

  /** Minutos noturnos reais e já reduzidos (base do adicional noturno). */
  noturnoMin: number;
  noturnoReduzidoMin: number;

  toleranciaAplicada: boolean;
  /** Positivo = crédito (extra); negativo = débito. Já com tolerância e abono. */
  saldoMin: number;
  extraMin: number;
  extras: ExtraPorPercentual[];
  debitoMin: number;
  abonoUsadoMin: number;

  falta: boolean;
  atrasoMin: number;
  saidaAntecipadaMin: number;

  intervalo: { exigidoMin: number; gozadoMin: number; suprimidoMin: number };
  interjornada: { descansoMin: number; faltanteMin: number } | null;

  ocorrencias: CodigoOcorrencia[];
}

/**
 * Apura um dia de trabalho: compara o que foi trabalhado com o previsto e
 * devolve saldo, extras por percentual, noturno, faltas, atrasos, intervalo e
 * interjornada.
 *
 * Decisões que valem a pena saber:
 *
 * - **Marcação ímpar não é "completada".** A marcação sem par é ignorada no
 *   cálculo e o dia sai como `incompleto`, para alguém tratar. Inventar a saída
 *   seria marcação automática, proibida pela Portaria 671.
 * - **Tolerância (art. 58, §1º, e Súmula 366 do TST):** se cada marcação
 *   variou até 5 min e a soma das variações ficou em até 10, o dia vale como
 *   cumprido certinho. Se passou de qualquer um dos dois limites, conta a
 *   diferença inteira, não só o que passou da tolerância.
 * - **O saldo é do dia inteiro:** chegar 20 min atrasado e sair 20 min depois
 *   zera. Atraso e saída antecipada são informados à parte, para o gestor.
 * - **Intervalo gozado é a soma dos intervalos** entre os pares do dia. O
 *   fracionamento do intervalo depende de convenção coletiva; validar por
 *   cliente.
 */
export function apurarDia(entrada: EntradaDia, r: RegrasCalculo): ApuracaoDia {
  for (const m of entrada.marcacoes) {
    if (!Number.isInteger(m)) throw new Error(`Marcação inválida: ${m} (minuto inteiro esperado)`);
  }

  const marcacoes = [...entrada.marcacoes].sort((a, b) => a - b);
  const incompleto = marcacoes.length % 2 === 1;
  const periodos: Periodo[] = [];
  for (let i = 0; i + 1 < marcacoes.length; i += 2) {
    periodos.push({ inicio: marcacoes[i], fim: marcacoes[i + 1] });
  }

  const ehDescanso =
    entrada.tipoDia === "DESCANSO" || (entrada.tipoDia === "FERIADO" && r.feriadoTrabalhadoComoExtra);
  const previsto = ehDescanso ? [] : [...entrada.previsto].sort((a, b) => a.inicio - b.inicio);

  const trabalhadoMin = soma(periodos.map(duracao));
  const noturnoMin = minutosNoturnos(periodos, r);
  const noturnoReduzidoMin = noturnoReduzido(noturnoMin, r);
  const trabalhadoComputadoMin = trabalhadoMin + noturnoReduzidoMin - noturnoMin;

  const previstoMin = soma(previsto.map(duracao));
  const previstoNoturno = minutosNoturnos(previsto, r);
  const previstoComputadoMin = previstoMin + noturnoReduzido(previstoNoturno, r) - previstoNoturno;

  // Tolerância: só quando cada par casa com um turno previsto.
  const casaComPrevisto = !incompleto && previsto.length > 0 && periodos.length === previsto.length;
  let toleranciaAplicada = false;
  if (casaComPrevisto) {
    const variacoes = previsto.flatMap((t, i) => [
      Math.abs(periodos[i].inicio - t.inicio),
      Math.abs(periodos[i].fim - t.fim),
    ]);
    toleranciaAplicada =
      variacoes.every((v) => v <= r.toleranciaPorMarcacaoMin) && soma(variacoes) <= r.toleranciaDiariaMin;
  }

  let saldoMin = toleranciaAplicada ? 0 : trabalhadoComputadoMin - previstoComputadoMin;

  const abono = Math.max(0, entrada.abonoMin ?? 0);
  const abonoUsadoMin = saldoMin < 0 ? Math.min(abono, -saldoMin) : 0;
  saldoMin += abonoUsadoMin;

  const extraMin = Math.max(0, saldoMin);
  const debitoMin = Math.max(0, -saldoMin);
  const extras = ehDescanso
    ? extraMin > 0
      ? [{ percentualBp: r.percentualDescansoBp, minutos: extraMin }]
      : []
    : distribuirExtras(extraMin, r.extrasDiaUtil);

  // Atraso e saída antecipada: informativos, só fora da tolerância.
  let atrasoMin = 0;
  let saidaAntecipadaMin = 0;
  if (!toleranciaAplicada && previsto.length > 0 && periodos.length > 0) {
    if (casaComPrevisto) {
      previsto.forEach((t, i) => {
        atrasoMin += Math.max(0, periodos[i].inicio - t.inicio);
        saidaAntecipadaMin += Math.max(0, t.fim - periodos[i].fim);
      });
    } else {
      atrasoMin = Math.max(0, periodos[0].inicio - previsto[0].inicio);
      saidaAntecipadaMin = Math.max(0, previsto[previsto.length - 1].fim - periodos[periodos.length - 1].fim);
    }
  }

  const falta = previsto.length > 0 && marcacoes.length === 0;

  const exigidoMin = periodos.length > 0 ? intervaloExigido(trabalhadoMin, r) : 0;
  let gozadoMin = 0;
  for (let i = 1; i < periodos.length; i++) gozadoMin += periodos[i].inicio - periodos[i - 1].fim;
  const suprimidoMin = Math.max(0, exigidoMin - gozadoMin);

  let interjornada: ApuracaoDia["interjornada"] = null;
  if (entrada.ultimaSaidaAnterior != null && marcacoes.length > 0) {
    const descansoMin = marcacoes[0] - entrada.ultimaSaidaAnterior;
    interjornada = { descansoMin, faltanteMin: Math.max(0, r.interjornadaMinimaMin - descansoMin) };
  }

  const ocorrencias: CodigoOcorrencia[] = [];
  if (incompleto) ocorrencias.push("MARCACAO_IMPAR");
  if (falta && debitoMin > 0) ocorrencias.push("FALTA");
  if (atrasoMin > 0) ocorrencias.push("ATRASO");
  if (saidaAntecipadaMin > 0) ocorrencias.push("SAIDA_ANTECIPADA");
  if (extraMin > 0) ocorrencias.push(ehDescanso ? "TRABALHO_EM_DESCANSO" : "HORA_EXTRA");
  if (!ehDescanso && extraMin > r.limiteExtraDiarioMin) ocorrencias.push("LIMITE_EXTRA_EXCEDIDO");
  if (suprimidoMin > 0) ocorrencias.push("INTERVALO_INSUFICIENTE");
  if (interjornada && interjornada.faltanteMin > 0) ocorrencias.push("INTERJORNADA_INSUFICIENTE");

  return {
    periodos,
    incompleto,
    descanso: ehDescanso,
    previstoMin,
    trabalhadoMin,
    trabalhadoComputadoMin,
    previstoComputadoMin,
    noturnoMin,
    noturnoReduzidoMin,
    toleranciaAplicada,
    saldoMin,
    extraMin,
    extras,
    debitoMin,
    abonoUsadoMin,
    falta,
    atrasoMin,
    saidaAntecipadaMin,
    intervalo: { exigidoMin, gozadoMin, suprimidoMin },
    interjornada,
    ocorrencias,
  };
}

/** Reparte os minutos extras do dia pelas faixas acumulativas. */
export function distribuirExtras(minutos: number, faixas: FaixaExtra[]): ExtraPorPercentual[] {
  const resultado: ExtraPorPercentual[] = [];
  let restante = minutos;
  let consumido = 0;
  for (const faixa of faixas) {
    if (restante <= 0) break;
    const capacidade = faixa.ateMin == null ? restante : Math.max(0, faixa.ateMin - consumido);
    const usado = Math.min(restante, capacidade);
    if (usado > 0) resultado.push({ percentualBp: faixa.percentualBp, minutos: usado });
    restante -= usado;
    consumido += usado;
  }
  if (restante > 0) {
    throw new Error("Faixas de hora extra não cobrem todo o tempo: a última faixa precisa ter ateMin = null");
  }
  return resultado;
}

function soma(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0);
}
