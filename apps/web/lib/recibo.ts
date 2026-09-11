/**
 * Recibo do pedido para impressora térmica — a montagem, sem tela e sem banco.
 *
 * Separado do componente pelo mesmo motivo de receivables.ts: a conta é o que
 * pode sair errada, e conta errada em papel entregue ao cliente não tem
 * desfazer. Aqui ela é testável sem subir navegador nem banco.
 *
 * O layout segue o comprovante do SmartPOS, que é o que a Believe já entrega
 * no balcão: itens a preço de tabela, desconto dos itens somado à parte e o
 * desconto do pedido separado. A cliente que confere a sacola continua lendo
 * o papel do jeito que está acostumada.
 */
import { centsToBRL } from "./billing";

export type MeioDePagamento = "PIX" | "CARTAO" | "BOLETO" | "FIADO";

export type ReciboEntrada = {
  empresa: {
    nome: string;
    reciboNome: string | null;
    reciboDocumento: string | null;
    reciboEndereco: string | null;
    reciboTelefone: string | null;
    reciboRodape: string | null;
    reciboLarguraMm: number;
    timezone: string;
  };
  pedido: {
    numero: number;
    createdAt: Date;
    fechadoEm: Date | null;
    paymentMethod: MeioDePagamento | null;
    pago: boolean;
    pagoEm: Date | null;
    vencimento: Date | null;
    subtotalCents: number;
    descontoCents: number;
    totalCents: number;
    observacao: string | null;
    vendedor: string | null;
    itens: { nomeProduto: string; precoTabelaCents: number; precoUnitCents: number; quantidade: number }[];
    pagamentos: { valorCents: number }[];
  };
  cliente: {
    nome: string | null;
    // Já formatado por quem chama: o telefone sai do JID, e essa regra mora
    // em lib/contact.ts, não aqui.
    telefone: string | null;
    documento: string | null;
    endereco: string | null;
  };
};

export type Linha = { rotulo: string; valor: string };

export type ItemRecibo = {
  nome: string;
  // "2 x R$ 39,90"
  detalhe: string;
  total: string;
  // "Desconto - R$ 9,80" quando o item saiu por outro preço que o de tabela.
  ajuste: string | null;
};

export type Recibo = {
  larguraMm: 58 | 80;
  empresa: { nome: string; linhas: string[] };
  titulo: string;
  dataHora: string;
  cliente: Linha[];
  itens: ItemRecibo[];
  quantidadeDeItens: number;
  totais: (Linha & { destaque?: boolean })[];
  situacao: "PAGO" | "PENDENTE";
  pagamento: Linha[];
  vendedor: string | null;
  observacao: string | null;
  rodape: string | null;
};

const ROTULO_MEIO: Record<MeioDePagamento, string> = {
  PIX: "PIX",
  CARTAO: "Cartão",
  BOLETO: "Boleto",
  FIADO: "Fiado",
};

/**
 * Regra @page do tamanho exato do recibo.
 *
 * Papel de bobina não tem altura: se a página for A4, a impressora solta 30 cm
 * de papel em branco depois de cada venda; se for curta demais, o recibo
 * quebra em duas folhas e a guilhotina corta no meio do total. Medir o
 * conteúdo e pedir uma página exatamente desse tamanho é o que faz sair um
 * papel só, do comprimento certo, em qualquer driver.
 *
 * A folga de 4 mm absorve arredondamento entre tela e impressão — sem ela,
 * meio milímetro a mais vira uma segunda página quase vazia.
 */
export function tamanhoDaPagina(larguraMm: number, alturaPx: number) {
  const alturaMm = Math.ceil((alturaPx * 25.4) / 96) + 4;
  return `@page { size: ${larguraMm}mm ${alturaMm}mm; margin: 0; }`;
}

function texto(v: string | null | undefined) {
  const t = v?.trim();
  return t ? t : null;
}

/**
 * CPF e CNPJ digitados só com números saem pontuados e com o nome do
 * documento na frente. Qualquer outra coisa sai como foi escrita: quem digitou
 * "MEI 12.345..." ou "CNPJ: ..." já disse como quer ver impresso.
 */
export function formatarDocumento(valor: string | null | undefined): string | null {
  const t = texto(valor);
  if (!t) return null;
  if (!/^[\d.\-/\s]+$/.test(t)) return t;

  const d = t.replace(/\D/g, "");
  if (d.length === 11) return `CPF ${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) {
    return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return t;
}

// No fuso da empresa, e não no do servidor: o container roda em UTC, e sem
// isso a venda das 22h sairia no papel com a data do dia seguinte.
function formatar(d: Date, tz: string, comHora: boolean) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
    .format(d)
    .replace(", ", " ");
}

function mesmoDia(a: Date, b: Date, tz: string) {
  return formatar(a, tz, false) === formatar(b, tz, false);
}

export function montarRecibo({ empresa, pedido, cliente }: ReciboEntrada): Recibo {
  const tz = empresa.timezone;

  // Item sem preço de tabela (lançado à mão, fora do catálogo) não tem
  // referência pra dizer que houve desconto: o preço dele É o de tabela.
  // Sem essa regra, todo item avulso apareceria como "acréscimo".
  const itensBase = pedido.itens.map((i) => ({
    ...i,
    tabela: i.precoTabelaCents > 0 ? i.precoTabelaCents : i.precoUnitCents,
  }));

  const subtotalTabela = itensBase.reduce((s, i) => s + i.tabela * i.quantidade, 0);
  const descontoItens = itensBase.reduce((s, i) => s + Math.max(i.tabela - i.precoUnitCents, 0) * i.quantidade, 0);
  const acrescimoItens = itensBase.reduce((s, i) => s + Math.max(i.precoUnitCents - i.tabela, 0) * i.quantidade, 0);

  // O subtotal gravado no fechamento é a soma dos preços praticados. Se a
  // conta a partir dos itens não bate com ele (pedido antigo, item mexido por
  // fora), o recibo detalhado mentiria em algum lugar. Nesse caso sai o
  // formato simples, com os itens pelo preço cobrado — o TOTAL impresso é
  // sempre o congelado no pedido, em qualquer um dos dois formatos.
  const detalhado = subtotalTabela - descontoItens + acrescimoItens === pedido.subtotalCents;

  const itens: ItemRecibo[] = itensBase.map((i) => {
    const preco = detalhado ? i.tabela : i.precoUnitCents;
    const diferenca = (i.tabela - i.precoUnitCents) * i.quantidade;
    return {
      nome: i.nomeProduto,
      detalhe: `${i.quantidade} x ${centsToBRL(preco)}`,
      total: centsToBRL(preco * i.quantidade),
      ajuste:
        !detalhado || diferenca === 0
          ? null
          : diferenca > 0
            ? `Desconto - ${centsToBRL(diferenca)}`
            : `Acréscimo + ${centsToBRL(-diferenca)}`,
    };
  });

  const totais: Recibo["totais"] = [];
  if (detalhado) {
    totais.push({ rotulo: "Subtotal", valor: centsToBRL(subtotalTabela) });
    if (descontoItens > 0) totais.push({ rotulo: "Desconto nos itens", valor: `- ${centsToBRL(descontoItens)}` });
    if (acrescimoItens > 0) totais.push({ rotulo: "Acréscimo nos itens", valor: `+ ${centsToBRL(acrescimoItens)}` });
  } else {
    totais.push({ rotulo: "Subtotal", valor: centsToBRL(pedido.subtotalCents) });
  }
  if (pedido.descontoCents > 0) totais.push({ rotulo: "Desconto", valor: `- ${centsToBRL(pedido.descontoCents)}` });
  totais.push({ rotulo: "TOTAL", valor: centsToBRL(pedido.totalCents), destaque: true });

  const quando = pedido.fechadoEm ?? pedido.createdAt;

  const pagamento: Linha[] = [];
  if (pedido.paymentMethod) pagamento.push({ rotulo: "Forma de pagamento", valor: ROTULO_MEIO[pedido.paymentMethod] });

  if (pedido.pago) {
    // Pago no balcão, na hora, a data já está no topo do papel. Só vale
    // repetir quando o pagamento veio depois — o boleto quitado dias depois.
    if (pedido.pagoEm && !mesmoDia(pedido.pagoEm, quando, tz)) {
      pagamento.push({ rotulo: "Pago em", valor: formatar(pedido.pagoEm, tz, false) });
    }
  } else {
    if (pedido.vencimento) pagamento.push({ rotulo: "Vencimento", valor: formatar(pedido.vencimento, tz, false) });
    // Mesma conta de saldoDoPedido(): a verdade é o histórico de pagamentos.
    const recebido = pedido.pagamentos.reduce((s, p) => s + p.valorCents, 0);
    if (recebido > 0) {
      pagamento.push({ rotulo: "Já pago", valor: centsToBRL(recebido) });
      pagamento.push({ rotulo: "Saldo a pagar", valor: centsToBRL(pedido.totalCents - recebido) });
    }
  }

  const clienteLinhas: Linha[] = [];
  const nome = texto(cliente.nome);
  const documento = formatarDocumento(cliente.documento);
  const endereco = texto(cliente.endereco);
  if (nome) clienteLinhas.push({ rotulo: "Cliente", valor: nome });
  if (cliente.telefone) clienteLinhas.push({ rotulo: "Telefone", valor: cliente.telefone });
  if (documento) clienteLinhas.push({ rotulo: "CPF/CNPJ", valor: documento.replace(/^(CPF|CNPJ) /, "") });
  if (endereco) clienteLinhas.push({ rotulo: "Endereço", valor: endereco });

  return {
    larguraMm: empresa.reciboLarguraMm === 58 ? 58 : 80,
    empresa: {
      nome: texto(empresa.reciboNome) ?? empresa.nome,
      linhas: [formatarDocumento(empresa.reciboDocumento), texto(empresa.reciboEndereco), texto(empresa.reciboTelefone)].filter(
        (l): l is string => !!l
      ),
    },
    titulo: `Pedido nº ${pedido.numero}`,
    dataHora: formatar(quando, tz, true),
    cliente: clienteLinhas,
    itens,
    quantidadeDeItens: pedido.itens.reduce((s, i) => s + i.quantidade, 0),
    totais,
    situacao: pedido.pago ? "PAGO" : "PENDENTE",
    pagamento,
    vendedor: texto(pedido.vendedor),
    observacao: texto(pedido.observacao),
    rodape: texto(empresa.reciboRodape),
  };
}
