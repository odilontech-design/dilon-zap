/**
 * Tempo no motor de ponto.
 *
 * O motor não trabalha com Date. Tudo é **minuto inteiro numa linha do tempo
 * local**: o minuto 0 é a meia-noite do dia de referência, no fuso da unidade.
 * Um turno noturno que entra às 22:00 e sai às 06:00 vira [1320, 1800]. O
 * 1800 passa de 1440 porque é o dia seguinte. A saída do dia anterior, para
 * conferir a interjornada, é negativa.
 *
 * Por que minuto inteiro: a Portaria 671 registra a marcação em hora e minuto,
 * e conta de ponto flutuante com 52min30s acumula erro de arredondamento
 * dentro de um mês. A conversão do instante real (UTC) para essa linha do tempo
 * fica num lugar só: `minutoLocal`.
 *
 * Limitação conhecida: a linha do tempo é a do relógio de parede. Se o Brasil
 * voltar a ter horário de verão, o turno que atravessar a virada terá 60
 * minutos a mais ou a menos. Hoje (sem horário de verão desde 2019) isso não
 * acontece.
 */

/** Minutos desde 00:00 do dia de referência, no fuso da unidade. */
export type Minuto = number;

/** Intervalo fechado-aberto [inicio, fim), em minutos. */
export interface Periodo {
  inicio: Minuto;
  fim: Minuto;
}

export const MINUTOS_DIA = 1440;

/**
 * "08:30" → 510. `dia` desloca para o dia seguinte (1) ou o anterior (-1):
 * `hhmm("06:00", 1)` → 1800.
 */
export function hhmm(texto: string, dia = 0): Minuto {
  const m = /^(\d{1,2}):(\d{2})$/.exec(texto.trim());
  if (!m) throw new Error(`Horário inválido: "${texto}" (use HH:MM)`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Horário inválido: "${texto}"`);
  return dia * MINUTOS_DIA + h * 60 + min;
}

/** 125 → "2:05"; -30 → "-0:30". Para relatório e mensagem de teste. */
export function formatarMinutos(minutos: number): string {
  const sinal = minutos < 0 ? "-" : "";
  const abs = Math.abs(minutos);
  return `${sinal}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

export function duracao(p: Periodo): number {
  return Math.max(0, p.fim - p.inicio);
}

export function sobreposicao(a: Periodo, b: Periodo): number {
  return Math.max(0, Math.min(a.fim, b.fim) - Math.max(a.inicio, b.inicio));
}

/**
 * Converte um instante real para a linha do tempo local de `dataReferencia`
 * ("AAAA-MM-DD"), no fuso IANA da unidade. Os segundos são descartados, como
 * no registro de ponto.
 *
 *   minutoLocal("2026-11-11T01:15:00Z", "2026-11-10", "America/Sao_Paulo")
 *   → 1335  (22:15 do dia 10)
 */
export function minutoLocal(instante: Date | string, dataReferencia: string, fuso: string): Minuto {
  const data = typeof instante === "string" ? new Date(instante) : instante;
  if (Number.isNaN(data.getTime())) throw new Error(`Instante inválido: ${String(instante)}`);

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);

  const diaLocal = Date.UTC(valor("year"), valor("month") - 1, valor("day"));
  const dias = Math.round((diaLocal - diaUtc(dataReferencia)) / 86_400_000);
  return dias * MINUTOS_DIA + valor("hour") * 60 + valor("minute");
}

/** "AAAA-MM-DD" → milissegundos UTC da meia-noite daquele dia. */
export function diaUtc(data: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) throw new Error(`Data inválida: "${data}" (use AAAA-MM-DD)`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function somarDias(data: string, dias: number): string {
  return new Date(diaUtc(data) + dias * 86_400_000).toISOString().slice(0, 10);
}
