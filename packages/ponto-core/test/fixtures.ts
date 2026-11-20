import { hhmm, type Minuto, type Periodo } from "../src/tempo";

/** Comercial padrão: 08:00–12:00 e 13:00–17:00 (8 horas, 1 hora de almoço). */
export const COMERCIAL: Periodo[] = [
  { inicio: hhmm("08:00"), fim: hhmm("12:00") },
  { inicio: hhmm("13:00"), fim: hhmm("17:00") },
];

/** Noturno: 22:00–02:00 e 03:00–06:00, atravessando a meia-noite. */
export const NOTURNO: Periodo[] = [
  { inicio: hhmm("22:00"), fim: hhmm("02:00", 1) },
  { inicio: hhmm("03:00", 1), fim: hhmm("06:00", 1) },
];

/** 12x36 diurno: 07:00–13:00 e 14:00–19:00. */
export const DOZE_TRINTA_SEIS: Periodo[] = [
  { inicio: hhmm("07:00"), fim: hhmm("13:00") },
  { inicio: hhmm("14:00"), fim: hhmm("19:00") },
];

/** "08:00 12:00 13:00 17:00" → minutos. "+1" no fim = dia seguinte ("02:00+1"). */
export function bat(texto: string): Minuto[] {
  return texto
    .trim()
    .split(/\s+/)
    .map((t) => (t.endsWith("+1") ? hhmm(t.slice(0, -2), 1) : hhmm(t)));
}
