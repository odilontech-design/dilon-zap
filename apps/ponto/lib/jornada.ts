import { z } from "zod";
import { hhmm, MINUTOS_DIA, type Periodo } from "@dilon-zap/ponto-core";

/**
 * Jornada semanal guardada como JSON:
 *   { "0": [], "1": [["08:00","12:00"],["13:00","17:00"]], ... }   (0 = domingo)
 * Fim menor ou igual ao início = termina no dia seguinte (turno noturno).
 */

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
export const semanaSchema = z.record(
  z.enum(["0", "1", "2", "3", "4", "5", "6"]),
  z.array(z.tuple([horario, horario])).max(4, "no máximo 4 períodos por dia"),
);
export type Semana = Record<string, Array<[string, string]>>;

/** Turnos de um dia da semana na linha do tempo do próprio dia (ver ponto-core). */
export function previstoDoDia(semana: Semana, diaSemana: number): Periodo[] {
  const periodos = semana[String(diaSemana)] ?? [];
  const resultado: Periodo[] = [];
  let virou = false;
  let ultimo = -1;
  for (const [ini, fim] of periodos) {
    let inicio = hhmm(ini) + (virou ? MINUTOS_DIA : 0);
    if (inicio < ultimo) {
      virou = true;
      inicio += MINUTOS_DIA;
    }
    let termino = hhmm(fim) + (virou ? MINUTOS_DIA : 0);
    if (termino <= inicio) {
      virou = true;
      termino += MINUTOS_DIA;
    }
    resultado.push({ inicio, fim: termino });
    ultimo = termino;
  }
  return resultado;
}

/** Confere a semana inteira; devolve a primeira mensagem de erro ou null. */
export function validarSemana(semana: Semana): string | null {
  for (let d = 0; d < 7; d++) {
    const turnos = previstoDoDia(semana, d);
    for (const t of turnos) {
      if (t.fim - t.inicio > 16 * 60) return `${DIAS_SEMANA[d]}: período com mais de 16 horas`;
    }
    const total = turnos.reduce((s, t) => s + t.fim - t.inicio, 0);
    if (total > 16 * 60) return `${DIAS_SEMANA[d]}: mais de 16 horas previstas no dia`;
  }
  return null;
}

export function cargaSemanalMin(semana: Semana): number {
  let total = 0;
  for (let d = 0; d < 7; d++) for (const t of previstoDoDia(semana, d)) total += t.fim - t.inicio;
  return total;
}

export function resumoDia(semana: Semana, d: number): string {
  const p = semana[String(d)] ?? [];
  return p.length ? p.map(([a, b]) => `${a}–${b}`).join(", ") : "folga";
}
