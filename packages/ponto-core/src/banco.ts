import { diaUtc, somarDias } from "./tempo";

/**
 * Banco de horas.
 *
 * Cada crédito é um **lote** com data de vencimento (6 meses para acordo
 * individual, 12 para acordo coletivo; art. 59, §§2º e 5º). O débito consome
 * primeiro o lote que vence antes. Lote que vence sem ser compensado sai do
 * banco e vai para `vencidos`: é hora extra a pagar.
 *
 * Débito sem crédito para consumir vira saldo negativo, que os próximos
 * créditos quitam primeiro. Se e como descontar saldo negativo é regra do
 * acordo, não do motor.
 */

export interface LancamentoBanco {
  /** "AAAA-MM-DD" */
  data: string;
  /** Positivo = crédito; negativo = débito. */
  minutos: number;
  descricao?: string;
}

export interface LoteBanco {
  data: string;
  /** Último dia em que o crédito ainda pode ser compensado. */
  vence: string;
  restanteMin: number;
}

export interface CreditoVencido {
  data: string;
  venceu: string;
  minutos: number;
}

export interface ExtratoBanco {
  /** Créditos em aberto menos o saldo negativo. */
  saldoMin: number;
  lotes: LoteBanco[];
  saldoNegativoMin: number;
  vencidos: CreditoVencido[];
}

export interface OpcoesBanco {
  /** Dias de validade de cada crédito. 6 meses ≈ 180; prefira o que o acordo disser. */
  validadeDias: number;
}

/**
 * Processa os lançamentos em ordem de data e devolve a situação do banco no
 * fim do dia `dataReferencia`. Lançamentos do mesmo dia são processados na
 * ordem em que vieram.
 */
export function extratoBanco(
  lancamentos: LancamentoBanco[],
  dataReferencia: string,
  opcoes: OpcoesBanco,
): ExtratoBanco {
  const ordenados = lancamentos
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => diaUtc(l.data) <= diaUtc(dataReferencia))
    .sort((a, b) => diaUtc(a.l.data) - diaUtc(b.l.data) || a.i - b.i)
    .map(({ l }) => l);

  let lotes: LoteBanco[] = [];
  let saldoNegativoMin = 0;
  const vencidos: CreditoVencido[] = [];

  const vencerAntesDe = (data: string) => {
    const limite = diaUtc(data);
    const ficam: LoteBanco[] = [];
    for (const lote of lotes) {
      if (diaUtc(lote.vence) < limite) {
        vencidos.push({ data: lote.data, venceu: lote.vence, minutos: lote.restanteMin });
      } else {
        ficam.push(lote);
      }
    }
    lotes = ficam;
  };

  for (const l of ordenados) {
    if (!Number.isInteger(l.minutos)) throw new Error(`Lançamento inválido em ${l.data}: ${l.minutos}`);
    vencerAntesDe(l.data);

    if (l.minutos > 0) {
      const quita = Math.min(l.minutos, saldoNegativoMin);
      saldoNegativoMin -= quita;
      const sobra = l.minutos - quita;
      if (sobra > 0) lotes.push({ data: l.data, vence: somarDias(l.data, opcoes.validadeDias), restanteMin: sobra });
    } else if (l.minutos < 0) {
      let falta = -l.minutos;
      lotes.sort((a, b) => diaUtc(a.vence) - diaUtc(b.vence));
      for (const lote of lotes) {
        if (falta === 0) break;
        const usa = Math.min(falta, lote.restanteMin);
        lote.restanteMin -= usa;
        falta -= usa;
      }
      lotes = lotes.filter((lote) => lote.restanteMin > 0);
      saldoNegativoMin += falta;
    }
  }

  // O lote vale até o fim do dia do vencimento.
  vencerAntesDe(dataReferencia);

  const creditos = lotes.reduce((s, lote) => s + lote.restanteMin, 0);
  return { saldoMin: creditos - saldoNegativoMin, lotes, saldoNegativoMin, vencidos };
}
