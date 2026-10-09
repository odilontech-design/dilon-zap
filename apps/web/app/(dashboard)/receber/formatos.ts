/**
 * Formatação e tipos do A receber. Num lugar só: a lista, a gaveta de detalhes e
 * o caixa precisam dizer "10/10/2026" e "Pendente" do mesmo jeito.
 */

export type StatusParcela = "PENDENTE" | "PAGA" | "CANCELADA" | "REEMBOLSADA";
export type TipoParcela = "ENTRADA" | "UNICA" | "SEMANAL" | "QUINZENAL" | "MENSAL";
export type MeioPagamento = "PIX" | "PIX_PENDENTE" | "CARTAO" | "DINHEIRO" | "BOLETO" | "FIADO";
export type Faixa = "vencido" | "vence_hoje" | "a_vencer" | "sem_prazo";

export type LinhaParcela = {
  id: string;
  contaId: string;
  orderId: string | null;
  pedidoNumero: number | null;
  conversationId: string | null;
  origem: "MANUAL" | "PEDIDO";
  descricao: string | null;
  contato: { id: string; name: string | null; waJid: string; phoneNumber: string | null };
  vencimento: string | null;
  pagaEm: string | null;
  tipo: TipoParcela;
  numero: number;
  totalParcelas: number;
  status: StatusParcela;
  valorCents: number;
  pagoCents: number;
  saldoCents: number;
  meio: string | null;
  faixa: Faixa | null;
  diasAtraso: number;
  precisaAtencaoHoje: boolean;
};

export const ROTULO_TIPO: Record<TipoParcela, string> = {
  ENTRADA: "Entrada",
  UNICA: "Única",
  SEMANAL: "Semanal",
  QUINZENAL: "Quinzenal",
  MENSAL: "Mensal",
};

export const ROTULO_STATUS: Record<StatusParcela, string> = {
  PENDENTE: "Pendente",
  PAGA: "Pago",
  CANCELADA: "Cancelado",
  REEMBOLSADA: "Reembolso",
};

export const ROTULO_MEIO: Record<string, string> = {
  PIX: "PIX",
  PIX_PENDENTE: "PIX",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  FIADO: "Outro",
};

/** Vencimento é uma data (ao meio-dia UTC): mostra o dia gravado, sem fuso. */
export function dataVencimento(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/** Pagamento é um instante: mostra o dia em Brasília. */
export function dataPagamento(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Hoje, em Brasília, no formato do <input type="date">. */
export function hojeISO(): string {
  return new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "erro ao carregar");
  return body;
};

export async function chamar(url: string, metodo: string, corpo?: unknown): Promise<{ ok: boolean; erro?: string; dados?: unknown }> {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = typeof dados.error === "string" ? dados.error : "não deu pra concluir";
    return { ok: false, erro };
  }
  return { ok: true, dados };
}

export function nomeDoContato(c: { name: string | null; phoneNumber: string | null; waJid: string }): string {
  return c.name?.trim() || c.phoneNumber || c.waJid.split("@")[0];
}
