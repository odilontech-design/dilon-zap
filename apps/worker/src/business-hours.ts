/**
 * Decide se um instante cai dentro do horário de atendimento da empresa.
 *
 * O worker roda em UTC dentro do container, e o horário é do relógio da
 * empresa — "fechamos às 18h" quer dizer 18h em São Paulo, não 18h UTC. Todo
 * o cálculo aqui é feito no fuso do tenant por isso.
 */

export type DiaDeAtendimento = {
  weekday: number; // 0 = domingo … 6 = sábado
  isOpen: boolean;
  opensAt: string; // "HH:MM"
  closesAt: string;
};

/**
 * Dia da semana e minutos desde a meia-noite, no fuso pedido.
 *
 * Sai de formatToParts e não do nome do dia formatado: o rótulo ("ter.",
 * "Tue") muda com o locale do container, e comparar string de dia da semana
 * quebraria em silêncio se o locale mudasse. Aqui só saem números.
 */
export function agoraNoFuso(fuso: string, quando = new Date()): { weekday: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(quando);

  const pega = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? "0");
  // hour12:false devolve "24" na meia-noite em algumas versões do ICU — sem
  // esse %24 o horário viraria 1440 minutos e nunca casaria com faixa nenhuma.
  const hora = pega("hour") % 24;

  // Date.UTC só pra extrair o dia da semana DA DATA LOCAL já convertida —
  // não é o instante em UTC, é a data que o relógio da empresa está marcando.
  const weekday = new Date(Date.UTC(pega("year"), pega("month") - 1, pega("day"))).getUTCDay();

  return { weekday, minutos: hora * 60 + pega("minute") };
}

function paraMinutos(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * `true` só quando dá pra afirmar que está DENTRO do horário. Dia sem
 * configuração, dia marcado como fechado ou horário malformado contam como
 * fora — o efeito de errar pra esse lado é mandar uma mensagem de ausência a
 * mais, contra deixar o cliente sem resposta nenhuma achando que foi ignorado.
 */
export function dentroDoHorario(
  dias: DiaDeAtendimento[],
  fuso: string,
  quando = new Date()
): boolean {
  const { weekday, minutos } = agoraNoFuso(fuso, quando);
  const hoje = dias.find((d) => d.weekday === weekday);
  if (!hoje || !hoje.isOpen) return false;

  const abre = paraMinutos(hoje.opensAt);
  const fecha = paraMinutos(hoje.closesAt);
  if (abre === null || fecha === null || fecha <= abre) return false;

  return minutos >= abre && minutos < fecha;
}
