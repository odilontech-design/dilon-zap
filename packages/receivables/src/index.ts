/**
 * Contas a receber: a matemática de data e dinheiro, sem banco.
 *
 * Fica num pacote à parte porque tanto o web (mostra a tela e o selo "⏰
 * Hoje") quanto o worker (dispara o aviso pro financeiro) precisam decidir
 * exatamente o mesmo dia pra exatamente o mesmo pedido — se cada app tivesse
 * sua própria cópia, um bug de sincronização faria a tela dizer "hoje" num
 * dia em que o push já não avisa mais, ou vice-versa.
 */

/** Quanto ainda falta receber deste pedido, em centavos. */
export function saldoDoPedido(totalCents: number, pagamentos: { valorCents: number }[]) {
  const recebido = pagamentos.reduce((s, p) => s + p.valorCents, 0);
  return totalCents - recebido;
}

/** Faixas de atraso. O que interessa numa lista de recebíveis é há quanto tempo. */
export type Faixa = "vencido" | "vence_hoje" | "a_vencer" | "sem_prazo";

function diaUTC(d: Date) {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

export function faixaDeVencimento(vencimento: Date | null, agora = new Date()): Faixa {
  if (!vencimento) return "sem_prazo";

  // Compara DIA, não instante: um pedido que vence hoje às 9h não está
  // vencido às 10h. Quem combinou "dia 15" quis dizer o dia inteiro.
  const diff = diaUTC(vencimento) - diaUTC(agora);

  if (diff < 0) return "vencido";
  if (diff === 0) return "vence_hoje";
  return "a_vencer";
}

export function diasDeAtraso(vencimento: Date, agora = new Date()) {
  return Math.max(0, Math.round((diaUTC(agora) - diaUTC(vencimento)) / 86_400_000));
}

/**
 * A régua do acompanhamento interno: em quais dias, contados a partir do
 * vencimento, o financeiro é avisado que precisa dar atenção a este pedido.
 *
 * 2 dias antes (lembrete gentil), no dia (vence hoje) e daí em diante a cada
 * 7 dias enquanto continuar sem pagar — sem teto, porque isto é um empurrão
 * pra GENTE DA CASA agir, não uma mensagem pro cliente: não existe risco de
 * incomodar demais ou de parecer cobrança agressiva.
 */
export function precisaLembrarHoje(vencimento: Date, agora = new Date()): boolean {
  const diffDias = Math.round((diaUTC(agora) - diaUTC(vencimento)) / 86_400_000);

  if (diffDias === -2) return true; // 2 dias antes de vencer
  if (diffDias === 0) return true; // no dia
  if (diffDias > 0 && diffDias % 7 === 0) return true; // a cada 7 dias vencido
  return false;
}

/** Mesma data-calendário (ignora hora) — usado pra não avisar duas vezes no mesmo dia. */
export function mesmoDiaCalendario(a: Date, b: Date): boolean {
  return diaUTC(a) === diaUTC(b);
}

/* ======================================================================
 * Parcelas e caixa
 *
 * Moram neste arquivo, e não num módulo reexportado com `export *`, de
 * propósito: o worker é ESM e carrega este pacote como CJS via tsx, e o Node
 * não enxerga os nomes de um `export *` nesse caminho ("does not provide an
 * export named ...") — o worker entrou em loop de reinício por isso.
 * ====================================================================== */

/**
 * Parcelas e caixa: a matemática pura, sem banco.
 *
 * Mora aqui, junto com saldo e faixa de atraso, porque web e worker precisam
 * concordar. E porque dinheiro errado parece certo: uma parcela de 113,15 em
 * vez de 113,16 não dá erro, só deixa o total da conta um centavo fora.
 */

export type Periodicidade = "SEMANAL" | "QUINZENAL" | "MENSAL";
export type TipoParcela = "ENTRADA" | "UNICA" | Periodicidade;

export type PlanoDeParcelas = {
  totalCents: number;
  /** Valor pago de entrada, em centavos. 0 ou ausente = sem entrada. */
  entradaCents?: number;
  /** Quando vence a entrada. Padrão: o mesmo dia da primeira parcela. */
  vencimentoEntrada?: Date;
  numParcelas: number;
  periodicidade: Periodicidade;
  primeiroVencimento: Date;
};

export type ParcelaPlanejada = {
  numero: number;
  totalParcelas: number;
  tipo: TipoParcela;
  vencimento: Date;
  valorCents: number;
};

export const MAX_PARCELAS = 60;

/** O mesmo dia, ao meio-dia UTC: o fuso não pode empurrar o vencimento para o dia vizinho. */
export function diaAoMeioDia(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
}

function somarDias(d: Date, dias: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + dias);
  return r;
}

/** + k meses, no mesmo dia; se o mês de destino é mais curto, vai para o último dia dele (31/01 → 28/02). */
function somarMeses(d: Date, meses: number): Date {
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + meses;
  const dia = d.getUTCDate();
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia), 12, 0, 0));
}

export function vencimentoDaParcela(primeiro: Date, periodicidade: Periodicidade, indice: number): Date {
  const base = diaAoMeioDia(primeiro);
  if (periodicidade === "SEMANAL") return somarDias(base, 7 * indice);
  if (periodicidade === "QUINZENAL") return somarDias(base, 14 * indice);
  // Sempre a partir da data do PRIMEIRO vencimento, e não encadeando mês a mês:
  // 31/01 → 28/02 → 28/03 empurraria o dia para sempre; assim volta a 31/03.
  return somarMeses(base, indice);
}

/**
 * Divide uma conta em entrada + parcelas.
 *
 * Os centavos que sobram da divisão vão um a um para as primeiras parcelas
 * (6 parcelas de 100,00 e 3 centavos de resto: as três primeiras saem 100,01).
 * A soma de tudo é SEMPRE o total — é a única garantia que importa.
 */
export function gerarParcelas(plano: PlanoDeParcelas): ParcelaPlanejada[] {
  const { totalCents, numParcelas } = plano;
  const entrada = plano.entradaCents ?? 0;

  if (!Number.isInteger(totalCents) || totalCents <= 0) throw new Error("o valor total precisa ser maior que zero");
  if (!Number.isInteger(entrada) || entrada < 0) throw new Error("entrada inválida");
  if (entrada >= totalCents) throw new Error("a entrada precisa ser menor que o total");
  if (!Number.isInteger(numParcelas) || numParcelas < 1 || numParcelas > MAX_PARCELAS) {
    throw new Error(`o número de parcelas vai de 1 a ${MAX_PARCELAS}`);
  }

  const resto = totalCents - entrada;
  const base = Math.floor(resto / numParcelas);
  const sobra = resto - base * numParcelas;

  const lista: ParcelaPlanejada[] = [];

  if (entrada > 0) {
    lista.push({
      numero: 1,
      totalParcelas: 1,
      tipo: "ENTRADA",
      vencimento: diaAoMeioDia(plano.vencimentoEntrada ?? plano.primeiroVencimento),
      valorCents: entrada,
    });
  }

  for (let i = 0; i < numParcelas; i++) {
    lista.push({
      numero: i + 1,
      totalParcelas: numParcelas,
      tipo: numParcelas === 1 ? "UNICA" : plano.periodicidade,
      vencimento: vencimentoDaParcela(plano.primeiroVencimento, plano.periodicidade, i),
      valorCents: base + (i < sobra ? 1 : 0),
    });
  }
  return lista;
}

/* ------------------------------------------------------------------ situação */

export type StatusParcela = "PENDENTE" | "PAGA" | "CANCELADA" | "REEMBOLSADA";

export type ParcelaEntrada = {
  id: string;
  numero: number;
  tipo: TipoParcela;
  vencimento: Date | null;
  valorCents: number;
  canceladaEm: Date | null;
  reembolsadaEm: Date | null;
};

export type RecebimentoDaParcela = { valorCents: number; recebidoEm: Date; meio: string | null };

export type SituacaoDaParcela = {
  status: StatusParcela;
  pagoCents: number;
  /** O que ainda falta. Zero em parcela paga, cancelada ou reembolsada. */
  saldoCents: number;
  /** Quando foi quitada (último recebimento). Só em PAGA. */
  pagaEm: Date | null;
  meio: string | null;
};

/**
 * A situação de UMA parcela, calculada dos recebimentos que apontam para ela.
 * Nada disto é guardado: o que se guarda é o dinheiro que entrou.
 */
export function situacaoDaParcela(parcela: ParcelaEntrada, recebimentos: RecebimentoDaParcela[]): SituacaoDaParcela {
  const pagoCents = recebimentos.reduce((s, r) => s + r.valorCents, 0);
  const ultimo = [...recebimentos].filter((r) => r.valorCents > 0).sort((a, b) => b.recebidoEm.getTime() - a.recebidoEm.getTime())[0];

  if (parcela.canceladaEm) return { status: "CANCELADA", pagoCents, saldoCents: 0, pagaEm: null, meio: null };
  if (parcela.reembolsadaEm) return { status: "REEMBOLSADA", pagoCents, saldoCents: 0, pagaEm: null, meio: ultimo?.meio ?? null };

  const saldoCents = Math.max(0, parcela.valorCents - pagoCents);
  if (saldoCents === 0) {
    return { status: "PAGA", pagoCents, saldoCents: 0, pagaEm: ultimo?.recebidoEm ?? null, meio: ultimo?.meio ?? null };
  }
  return { status: "PENDENTE", pagoCents, saldoCents, pagaEm: null, meio: null };
}

/** Ordem de quitação: a entrada primeiro, depois por vencimento (sem prazo no fim), depois pelo número. */
export function ordenarParaQuitar<T extends Pick<ParcelaEntrada, "tipo" | "vencimento" | "numero">>(parcelas: T[]): T[] {
  return [...parcelas].sort((a, b) => {
    if ((a.tipo === "ENTRADA") !== (b.tipo === "ENTRADA")) return a.tipo === "ENTRADA" ? -1 : 1;
    const va = a.vencimento ? a.vencimento.getTime() : Number.POSITIVE_INFINITY;
    const vb = b.vencimento ? b.vencimento.getTime() : Number.POSITIVE_INFINITY;
    if (va !== vb) return va - vb;
    return a.numero - b.numero;
  });
}

export type Alocacao = { parcelaId: string; valorCents: number };

/**
 * Reparte um recebimento entre as parcelas em aberto.
 *
 * Com `parcelaPreferida`, ela é quitada primeiro e o que sobrar segue a ordem
 * normal; sem ela, a ordem normal desde o começo. Cada alocação vira uma linha
 * de Pagamento, de modo que "qual parcela foi paga" é sempre um fato gravado.
 * Recusa receber mais do que a conta deve: quase sempre é dígito trocado.
 */
export function alocarRecebimento(
  abertas: { id: string; tipo: TipoParcela; vencimento: Date | null; numero: number; saldoCents: number }[],
  valorCents: number,
  parcelaPreferida?: string | null
): Alocacao[] {
  if (!Number.isInteger(valorCents) || valorCents <= 0) throw new Error("o valor precisa ser maior que zero");

  const pendentes = ordenarParaQuitar(abertas.filter((p) => p.saldoCents > 0));
  const saldoTotal = pendentes.reduce((s, p) => s + p.saldoCents, 0);
  if (valorCents > saldoTotal) {
    throw new Error(`valor maior que o saldo devedor (faltam ${(saldoTotal / 100).toFixed(2)})`);
  }

  const fila = parcelaPreferida
    ? [...pendentes.filter((p) => p.id === parcelaPreferida), ...pendentes.filter((p) => p.id !== parcelaPreferida)]
    : pendentes;

  const resultado: Alocacao[] = [];
  let falta = valorCents;
  for (const p of fila) {
    if (falta <= 0) break;
    const parte = Math.min(falta, p.saldoCents);
    resultado.push({ parcelaId: p.id, valorCents: parte });
    falta -= parte;
  }
  return resultado;
}

/* --------------------------------------------------------------------- caixa */

export type MeioDoCaixa = "DINHEIRO" | "PIX" | "PIX_PENDENTE" | "CARTAO" | "BOLETO" | "FIADO" | "OUTRO";

export type ResumoDoCaixa = {
  /** Líquido por forma de pagamento (estorno já abatido). */
  porMeio: Partial<Record<MeioDoCaixa, number>>;
  totalRecebidoCents: number;
  recebidoDinheiroCents: number;
  suprimentosCents: number;
  sangriasCents: number;
  despesasCents: number;
  /** Pagamentos a fornecedores feitos em dinheiro (líquidos de estorno): saem da gaveta. */
  pagamentosAFornecedoresCents: number;
  /** O que deve haver em dinheiro na gaveta: inicial + dinheiro recebido + suprimentos − sangrias − despesas − pagamentos a fornecedores em dinheiro. */
  esperadoDinheiroCents: number;
};

/**
 * O que o caixa deveria conter. Só o DINHEIRO é conferido na gaveta: PIX,
 * cartão e boleto não passam por ela, aparecem para o total mas não entram na
 * conta da diferença.
 */
export function resumoDoCaixa(args: {
  valorInicialCents: number;
  recebimentos: { valorCents: number; meio: string | null }[];
  movimentos: { tipo: "SUPRIMENTO" | "SANGRIA" | "DESPESA"; valorCents: number }[];
  /** Pagamentos a fornecedores feitos em DINHEIRO na sessão (estorno entra negativo). */
  saidasDinheiroCents?: number;
}): ResumoDoCaixa {
  const porMeio: Partial<Record<MeioDoCaixa, number>> = {};
  for (const r of args.recebimentos) {
    const meio = (r.meio as MeioDoCaixa | null) ?? "OUTRO";
    porMeio[meio] = (porMeio[meio] ?? 0) + r.valorCents;
  }
  const soma = (tipo: string) => args.movimentos.filter((m) => m.tipo === tipo).reduce((s, m) => s + m.valorCents, 0);
  const recebidoDinheiroCents = porMeio.DINHEIRO ?? 0;
  const suprimentosCents = soma("SUPRIMENTO");
  const sangriasCents = soma("SANGRIA");
  const despesasCents = soma("DESPESA");

  return {
    porMeio,
    totalRecebidoCents: args.recebimentos.reduce((s, r) => s + r.valorCents, 0),
    recebidoDinheiroCents,
    suprimentosCents,
    sangriasCents,
    despesasCents,
    pagamentosAFornecedoresCents: args.saidasDinheiroCents ?? 0,
    esperadoDinheiroCents:
      args.valorInicialCents + recebidoDinheiroCents + suprimentosCents - sangriasCents - despesasCents - (args.saidasDinheiroCents ?? 0),
  };
}
