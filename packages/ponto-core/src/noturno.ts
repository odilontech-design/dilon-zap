import { MINUTOS_DIA, sobreposicao, type Periodo } from "./tempo";
import type { RegrasCalculo } from "./regras";

/** Janelas noturnas (22h–5h, por padrão) que tocam o intervalo [de, ate]. */
export function janelasNoturnas(r: RegrasCalculo, de: number, ate: number): Periodo[] {
  const { inicioMin, fimMin } = r.noturno;
  const atravessaMeiaNoite = fimMin <= inicioMin;
  const janelas: Periodo[] = [];
  for (let dia = Math.floor(de / MINUTOS_DIA) - 1; dia <= Math.floor(ate / MINUTOS_DIA) + 1; dia++) {
    const base = dia * MINUTOS_DIA;
    const janela = {
      inicio: base + inicioMin,
      fim: base + fimMin + (atravessaMeiaNoite ? MINUTOS_DIA : 0),
    };
    if (janela.fim > de && janela.inicio < ate) janelas.push(janela);
  }
  return janelas;
}

/**
 * Minutos **reais** trabalhados em horário noturno, incluindo a prorrogação
 * (Súmula 60, II, do TST) quando ela está ligada.
 *
 * Prorrogação: se a jornada começou antes ou no início da janela noturna e
 * terminou depois ou no fim dela (com ou sem intervalo no meio), o que foi
 * trabalhado depois do fim da janela também é noturno. É o caso clássico da
 * escala 19h–7h (OJ 388 da SDI-1): 5h–7h entram no adicional.
 *
 * Recebe os períodos de UMA jornada (um dia de trabalho).
 */
export function minutosNoturnos(periodos: Periodo[], r: RegrasCalculo): number {
  if (periodos.length === 0) return 0;
  const inicioJornada = Math.min(...periodos.map((p) => p.inicio));
  const fimJornada = Math.max(...periodos.map((p) => p.fim));

  let total = 0;
  for (const janela of janelasNoturnas(r, inicioJornada, fimJornada)) {
    for (const p of periodos) total += sobreposicao(p, janela);

    const cumpriuJanelaInteira = inicioJornada <= janela.inicio && fimJornada >= janela.fim;
    if (r.noturno.prorrogacao && cumpriuJanelaInteira) {
      const depois = { inicio: janela.fim, fim: fimJornada };
      for (const p of periodos) total += sobreposicao(p, depois);
    }
  }
  return total;
}

/**
 * Converte minutos noturnos reais em minutos "de relógio de folha": com a hora
 * reduzida, 52min30s valem 60. 7 horas reais (420 min) → 480 min (8 horas).
 */
export function noturnoReduzido(minutosReais: number, r: RegrasCalculo): number {
  return r.noturno.horaReduzida ? Math.round((minutosReais * 8) / 7) : minutosReais;
}
