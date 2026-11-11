/**
 * Regras puras da revenda de veículos: dias em estoque, faixa de carro parado,
 * margem e a conta da venda (preço − troca − sinal − entrada − financiado).
 * Sem banco, para ter teste próprio (veiculos-regras.test-manual.ts).
 */

export type StatusVeiculo = "PREPARACAO" | "DISPONIVEL" | "RESERVADO" | "VENDIDO" | "DEVOLVIDO";
export type OrigemVeiculo = "COMPRA" | "TROCA" | "CONSIGNACAO";
export type TipoCusto =
  | "COMPRA"
  | "DESPACHANTE"
  | "MECANICA"
  | "FUNILARIA"
  | "ESTETICA"
  | "PNEUS"
  | "DOCUMENTACAO"
  | "IPVA"
  | "OUTRO";

export const ROTULO_STATUS: Record<StatusVeiculo, string> = {
  PREPARACAO: "Em preparação",
  DISPONIVEL: "Disponível",
  RESERVADO: "Reservado",
  VENDIDO: "Vendido",
  DEVOLVIDO: "Devolvido ao dono",
};

export const ROTULO_ORIGEM: Record<OrigemVeiculo, string> = {
  COMPRA: "Compra",
  TROCA: "Troca",
  CONSIGNACAO: "Consignação",
};

export const ROTULO_CUSTO: Record<TipoCusto, string> = {
  COMPRA: "Compra do veículo",
  DESPACHANTE: "Despachante",
  MECANICA: "Mecânica",
  FUNILARIA: "Funilaria e pintura",
  ESTETICA: "Estética / polimento",
  PNEUS: "Pneus",
  DOCUMENTACAO: "Documentação / transferência",
  IPVA: "IPVA / licenciamento",
  OUTRO: "Outro",
};

/** Estoque "vivo": o que está no pátio, à venda ou se preparando para isso. */
export const STATUS_NO_PATIO: StatusVeiculo[] = ["PREPARACAO", "DISPONIVEL", "RESERVADO"];

/**
 * Para que lado o status pode andar pela ficha. Vender e reservar têm rota
 * própria (mexem em dinheiro); aqui só o que é troca de etiqueta.
 */
export function podeMudarStatus(de: StatusVeiculo, para: StatusVeiculo, origem: OrigemVeiculo): boolean {
  if (de === para) return false;
  if (de === "PREPARACAO") return para === "DISPONIVEL" || (para === "DEVOLVIDO" && origem === "CONSIGNACAO");
  if (de === "DISPONIVEL") return para === "PREPARACAO" || (para === "DEVOLVIDO" && origem === "CONSIGNACAO");
  return false;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros desde a entrada. Vendido conta até a saída: é o giro daquele carro. */
export function diasEmEstoque(entradaEm: Date, saidaEm: Date | null, agora = new Date()): number {
  const fim = saidaEm ?? agora;
  return Math.max(0, Math.floor((fim.getTime() - entradaEm.getTime()) / DIA_MS));
}

export type FaixaEstoque = "novo" | "atencao" | "parado" | "critico";

/**
 * O alerta de carro parado. 30 dias é o que o mercado usa como sinal amarelo;
 * 60 já é capital empatado que pede reprecificação; 90 é prejuízo certo.
 */
export function faixaDeEstoque(dias: number): FaixaEstoque {
  if (dias >= 90) return "critico";
  if (dias >= 60) return "parado";
  if (dias >= 30) return "atencao";
  return "novo";
}

/**
 * O custo que a margem considera. No consignado, o "custo" do carro é o que
 * vai para o dono (o repasse), mais o que a loja gastou para deixá-lo pronto.
 */
export function custoTotal(custosCents: number[], consignacaoValorCents: number | null | undefined): number {
  const gastos = custosCents.reduce((s, c) => s + c, 0);
  return gastos + (consignacaoValorCents ?? 0);
}

export type Margem = { valorCents: number; percentual: number | null };

/** Margem bruta sobre o preço de venda: preço − custo − comissão. */
export function margem(precoCents: number, custoCents: number, comissaoCents = 0): Margem {
  const valor = precoCents - custoCents - comissaoCents;
  return { valorCents: valor, percentual: precoCents > 0 ? Math.round((valor / precoCents) * 1000) / 10 : null };
}

/** Preço contra a FIPE em %, positivo = acima da tabela. */
export function diferencaFipe(precoCents: number, fipeCents: number | null | undefined): number | null {
  if (!fipeCents || fipeCents <= 0) return null;
  return Math.round(((precoCents - fipeCents) / fipeCents) * 1000) / 10;
}

export type ComposicaoVenda = {
  precoCents: number;
  trocaCents: number;
  /** Sinal já recebido na reserva. */
  sinalCents: number;
  /** O que o cliente paga agora, na assinatura. */
  entradaCents: number;
  financiadoCents: number;
};

/**
 * O que sobra para o crediário da loja depois de troca, sinal, entrada e
 * financiamento. Lança erro com a mensagem da tela quando a conta não fecha.
 */
export function restanteDaVenda(c: ComposicaoVenda): number {
  for (const [nome, v] of Object.entries(c)) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${nome}: valor inválido`);
  }
  if (c.precoCents <= 0) throw new Error("informe o preço de venda");
  if (c.trocaCents > c.precoCents) throw new Error("a troca vale mais que o carro vendido: lance a diferença como compra");
  const restante = c.precoCents - c.trocaCents - c.sinalCents - c.entradaCents - c.financiadoCents;
  if (restante < 0) throw new Error("troca, sinal, entrada e financiamento passam do preço de venda");
  return restante;
}

/** Placa no formato que se guarda: maiúscula, sem traço nem espaço. Aceita a antiga e a Mercosul. */
export function normalizarPlaca(placa: string | null | undefined): string | null {
  if (!placa) return null;
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return p || null;
}

export function placaValida(placa: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placa);
}

/** "ABC1D23" → "ABC-1D23" para exibir. */
export function placaParaTela(placa: string | null | undefined): string {
  if (!placa) return "";
  return placa.length === 7 ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
}

/** "Onix LT 1.0 2021/2022" — como o carro aparece em lista e mensagem. */
export function nomeDoVeiculo(v: { marca: string; modelo: string; versao?: string | null; anoFabricacao: number; anoModelo: number }): string {
  const nome = [v.marca, v.modelo, v.versao].filter(Boolean).join(" ");
  return `${nome} ${v.anoFabricacao}/${v.anoModelo}`;
}

function brl(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * A ficha que vai para o cliente no WhatsApp. Sem custo, sem piso, sem placa
 * inteira (o final basta para o cliente achar o carro no pátio, e a placa
 * completa num print circula por aí).
 */
export function fichaParaCliente(v: {
  marca: string;
  modelo: string;
  versao?: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  cor?: string | null;
  combustivel?: string | null;
  cambio?: string | null;
  opcionais?: string[];
  precoCents: number;
  descricao?: string | null;
  placa?: string | null;
}): string {
  const linhas = [
    `*${nomeDoVeiculo(v)}*`,
    `💰 ${brl(v.precoCents)}`,
    `📍 ${v.km.toLocaleString("pt-BR")} km`,
    [v.cambio, v.combustivel, v.cor].filter(Boolean).join(" · "),
    v.opcionais?.length ? `✅ ${v.opcionais.join(", ")}` : "",
    v.placa ? `Final de placa ${v.placa.slice(-1)}` : "",
    v.descricao?.trim() ?? "",
  ];
  return linhas.filter(Boolean).join("\n");
}

/** "R$ 85.900,00" → 8590000. Aceita "85900", "85.900", "85.900,50". */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.]/g, "");
  if (!limpo) return null;
  const temVirgula = limpo.includes(",");
  const normal = temVirgula ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
