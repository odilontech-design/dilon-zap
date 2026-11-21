import { previstoDoDia, type Semana } from "@/lib/jornada";

/** Regras puras das solicitações (sem banco), para testar sem servidor. */

export const TIPOS_SOLICITACAO = {
  INCLUSAO: "Incluir marcação",
  DESCONSIDERACAO: "Desconsiderar marcação",
  ABONO: "Abono de horas",
  ATESTADO: "Atestado médico",
} as const;
export type TipoSolicitacao = keyof typeof TIPOS_SOLICITACAO;

export const STATUS_SOLICITACAO = {
  PENDENTE: "Aguardando",
  APROVADA: "Aprovada",
  RECUSADA: "Recusada",
  CANCELADA: "Cancelada",
} as const;

/** Atestado: no máximo 60 dias numa solicitação só. */
export const MAX_DIAS_ATESTADO = 60;
/** Anexo: PDF ou foto, até 4 MB. */
export const MAX_ANEXO_BYTES = 4 * 1024 * 1024;
export const MIMES_ANEXO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;

const diaUtc = (data: string) => new Date(`${data}T12:00:00Z`);
const somar = (data: string, n: number) => new Date(diaUtc(data).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Dias que um atestado abona e quantos minutos em cada um: o previsto na
 * jornada do colaborador. Folga, descanso e feriado ficam de fora (não há
 * débito para cobrir).
 */
export function diasDoAtestado(
  de: string,
  ate: string,
  semana: Semana,
  feriados: ReadonlySet<string>,
): Array<{ data: string; minutos: number }> {
  if (ate < de) throw new Error("O último dia do atestado vem antes do primeiro.");
  const dias: Array<{ data: string; minutos: number }> = [];
  for (let d = de, n = 0; d <= ate; d = somar(d, 1), n++) {
    if (n >= MAX_DIAS_ATESTADO) throw new Error(`Atestado de até ${MAX_DIAS_ATESTADO} dias por solicitação.`);
    if (feriados.has(d)) continue;
    const minutos = previstoDoDia(semana, diaUtc(d).getUTCDay()).reduce((s, p) => s + p.fim - p.inicio, 0);
    if (minutos > 0) dias.push({ data: d, minutos });
  }
  return dias;
}

/** "HH:MM" de duração → minutos (abono parcial). */
export function duracaoEmMinutos(texto: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(texto.trim());
  if (!m) return null;
  const total = Number(m[1]) * 60 + Number(m[2]);
  return total > 0 && total <= 24 * 60 ? total : null;
}

/** Resumo de uma linha para listas e para o motivo do ajuste gerado. */
export function resumoSolicitacao(s: {
  tipo: TipoSolicitacao;
  data: string;
  dataFim?: string | null;
  hora?: string | null;
  diaSeguinte?: boolean;
  minutos?: number | null;
  horaMarcacao?: string | null;
}): string {
  const br = (d: string) => d.split("-").reverse().join("/");
  switch (s.tipo) {
    case "INCLUSAO":
      return `Incluir ${s.hora ?? ""}${s.diaSeguinte ? " (dia seguinte)" : ""} em ${br(s.data)}`;
    case "DESCONSIDERACAO":
      return `Desconsiderar a marcação${s.horaMarcacao ? ` das ${s.horaMarcacao}` : ""} de ${br(s.data)}`;
    case "ABONO": {
      const m = s.minutos ?? 0;
      return `Abonar ${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")} em ${br(s.data)}`;
    }
    case "ATESTADO":
      return !s.dataFim || s.dataFim === s.data ? `Atestado de ${br(s.data)}` : `Atestado de ${br(s.data)} a ${br(s.dataFim)}`;
  }
}
