import { formatarMinutos } from "@dilon-zap/ponto-core";

/** Horas para tela: 0 vira "—" para a tabela não virar um mar de zeros. */
export function horas(min: number, zeroComoTraco = true): string {
  if (zeroComoTraco && min === 0) return "—";
  return formatarMinutos(min);
}

export function saldo(min: number): string {
  if (min === 0) return "0:00";
  return `${min > 0 ? "+" : ""}${formatarMinutos(min)}`;
}

export function percentual(bp: number): string {
  return `${(bp / 100).toLocaleString("pt-BR")}%`;
}

export const NOME_OCORRENCIA: Record<string, string> = {
  MARCACAO_IMPAR: "Marcação ímpar",
  FALTA: "Falta",
  ATRASO: "Atraso",
  SAIDA_ANTECIPADA: "Saída antecipada",
  HORA_EXTRA: "Hora extra",
  LIMITE_EXTRA_EXCEDIDO: "Mais de 2h extras",
  TRABALHO_EM_DESCANSO: "Trabalho em folga/feriado",
  INTERVALO_INSUFICIENTE: "Intervalo curto",
  INTERJORNADA_INSUFICIENTE: "Interjornada < 11h",
};
