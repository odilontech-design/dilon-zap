/**
 * Situação da assinatura, calculada das faturas. Puro (sem banco), testado em
 * cobranca-regras.test.ts.
 *
 * Regras (plano comercial, seção 5.1):
 * - o acesso é liberado na contratação, antes de o primeiro boleto ser pago;
 * - boleto em aberto até o vencimento: tudo normal, só um aviso;
 * - vencido: mais `toleranciaDias` (padrão 5) de prazo, com aviso de quantos
 *   dias faltam para o bloqueio;
 * - passou do prazo: o PAINEL DO ADMINISTRADOR fica bloqueado (só a tela da
 *   assinatura abre). Os colaboradores continuam batendo ponto: um buraco no
 *   registro de jornada prejudicaria o trabalhador e a própria empresa numa
 *   fiscalização, e não é ele quem deixou de pagar;
 * - cancelada: ninguém entra (os dados ficam guardados).
 */

export type EstadoAssinatura =
  | "ISENTA"
  | "EM_DIA"
  | "AGUARDANDO_PAGAMENTO"
  | "VENCIDA"
  | "BLOQUEADA"
  | "SEM_BOLETO"
  | "CANCELADA";

export interface FaturaResumo {
  id: string;
  /** "AAAA-MM-DD" */
  vencimento: string;
  status: "PENDENTE" | "PAGA" | "VENCIDA" | "CANCELADA";
  valorCentavos: number;
  urlFatura: string | null;
}

export interface SituacaoAssinatura {
  estado: EstadoAssinatura;
  /** A fatura em aberto mais antiga (é ela que decide o bloqueio). */
  emAberto: FaturaResumo | null;
  /** Data a partir da qual o painel bloqueia, se nada for pago. */
  bloqueiaEm: string | null;
  /** Dias até o bloqueio (0 = bloqueia amanhã). */
  diasParaBloqueio: number | null;
  painelBloqueado: boolean;
  /** Colaborador ainda pode bater ponto? Só não pode com a conta cancelada. */
  registroLiberado: boolean;
}

const DIA = 86_400_000;
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA);
const somar = (data: string, n: number) => new Date(Date.parse(`${data}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);

export function situacaoAssinatura(entrada: {
  forma: "BOLETO_ASAAS" | "ISENTA";
  cancelada: boolean;
  faturas: FaturaResumo[];
  /** "AAAA-MM-DD" no fuso da empresa */
  hoje: string;
  toleranciaDias: number;
}): SituacaoAssinatura {
  const base = { emAberto: null, bloqueiaEm: null, diasParaBloqueio: null };
  if (entrada.cancelada) return { ...base, estado: "CANCELADA", painelBloqueado: true, registroLiberado: false };
  if (entrada.forma === "ISENTA") return { ...base, estado: "ISENTA", painelBloqueado: false, registroLiberado: true };

  const validas = entrada.faturas.filter((f) => f.status !== "CANCELADA");
  if (validas.length === 0) {
    // O boleto não saiu (Asaas fora do ar, chave não configurada). Falha nossa:
    // não bloqueia; o painel mostra o aviso e o botão de gerar de novo.
    return { ...base, estado: "SEM_BOLETO", painelBloqueado: false, registroLiberado: true };
  }

  const emAberto = validas
    .filter((f) => f.status === "PENDENTE" || f.status === "VENCIDA")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  if (!emAberto) return { ...base, estado: "EM_DIA", painelBloqueado: false, registroLiberado: true };

  const bloqueiaEm = somar(emAberto.vencimento, entrada.toleranciaDias + 1);
  const diasParaBloqueio = diasEntre(entrada.hoje, bloqueiaEm) - 1;
  const comum = { emAberto, bloqueiaEm, registroLiberado: true };

  if (entrada.hoje <= emAberto.vencimento) {
    return { ...comum, estado: "AGUARDANDO_PAGAMENTO", diasParaBloqueio, painelBloqueado: false };
  }
  if (entrada.hoje < bloqueiaEm) {
    return { ...comum, estado: "VENCIDA", diasParaBloqueio, painelBloqueado: false };
  }
  return { ...comum, estado: "BLOQUEADA", diasParaBloqueio: 0, painelBloqueado: true };
}

/** Status do pagamento no Asaas → status da fatura aqui. */
export function statusDaFatura(statusAsaas: string, apagada = false): FaturaResumo["status"] {
  if (apagada) return "CANCELADA";
  switch (statusAsaas) {
    case "RECEIVED":
    case "CONFIRMED":
    case "RECEIVED_IN_CASH":
      return "PAGA";
    case "OVERDUE":
      return "VENCIDA";
    case "REFUNDED":
    case "REFUND_REQUESTED":
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "DUNNING_REQUESTED":
      // Estorno e chargeback: o dinheiro não ficou. Trata como cancelada para
      // não contar como paga; quem decide o que fazer é o financeiro.
      return "CANCELADA";
    default:
      return "PENDENTE";
  }
}
