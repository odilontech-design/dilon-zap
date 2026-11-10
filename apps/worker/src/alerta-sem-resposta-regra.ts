/**
 * Regra do alerta de conversa sem resposta, sem banco nem relógio: recebe os
 * minutos de espera e devolve em que estágio o alerta está. Fica separada do
 * laço do worker para poder ser testada.
 *
 * Estágios: 0 = nada; 1 = avisa o responsável (passou do limite); 2 = avisa
 * também a gestão (passou do dobro). Conversa parada há mais de um dia não
 * entra: é backlog antigo, e avisar de 300 conversas velhas de uma vez faria
 * o aviso virar ruído.
 *
 * A mesma regra existe em apps/web/lib/sem-resposta.ts, para o selo do Inbox.
 */

export const JANELA_MAXIMA_MIN = 24 * 60;

export function estagioDoAlerta(esperaMin: number, limiteMin: number): 0 | 1 | 2 {
  if (!Number.isFinite(esperaMin) || !Number.isFinite(limiteMin) || limiteMin <= 0) return 0;
  if (esperaMin > JANELA_MAXIMA_MIN) return 0;
  if (esperaMin >= limiteMin * 2) return 2;
  if (esperaMin >= limiteMin) return 1;
  return 0;
}

/** Minutos inteiros entre dois instantes (nunca negativo). */
export function minutosEntre(desde: Date, ate: Date): number {
  return Math.max(0, Math.floor((ate.getTime() - desde.getTime()) / 60_000));
}

/** "15 min", "1h20", "2h" — para o texto do aviso. */
export function textoDaEspera(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, "0")}`;
}
