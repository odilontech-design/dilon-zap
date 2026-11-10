/**
 * Selo "sem resposta" do Inbox. Espelha a regra do alerta do worker
 * (apps/worker/src/alerta-sem-resposta-regra.ts): só conversa ABERTA cuja
 * última mensagem é do cliente, parada há pelo menos o limite da empresa e há
 * no máximo um dia. Puro, para teste.
 */

export const JANELA_MAXIMA_MIN = 24 * 60;

export type UltimaMensagem = { direction: "INBOUND" | "OUTBOUND"; createdAt: string | Date };

/** Minutos de espera, ou null se a conversa não está esperando resposta nossa. */
export function esperaSemResposta(
  status: string,
  ultima: UltimaMensagem | undefined,
  limiteMin: number | null | undefined,
  agora: Date = new Date()
): number | null {
  if (!limiteMin || limiteMin <= 0) return null;
  if (status !== "OPEN" || !ultima || ultima.direction !== "INBOUND") return null;
  const min = Math.floor((agora.getTime() - new Date(ultima.createdAt).getTime()) / 60_000);
  if (min < limiteMin || min > JANELA_MAXIMA_MIN) return null;
  return min;
}

export function textoDaEspera(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, "0")}`;
}
