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
 *
 * O caminho inverso não existe: item cobrado acima da tabela sai pelo próprio
 * preço, sem "acréscimo" nenhum. Ver precoImpresso() em montarRecibo.
 */
import { centsToBRL } from "./billing";
import { montarBrCode } from "./pix";

export type MeioDePagamento = "PIX" | "PIX_PENDENTE" | "CARTAO" | "DINHEIRO" | "BOLETO" | "FIADO";

export type ReciboEntrada = {
  empresa: {
    nome: string;
    reciboNome: string | null;
    reciboDocumento: string | null;
    reciboEndereco: string | null;
    reciboTelefone: string | null;
    reciboRodape: string | null;
    reciboChavePix: string | null;
    reciboTextoPendente: string | null;
    reciboTextoPago: string | null;
    reciboCorDestaque: string | null;
    reciboOcultarTelefone: boolean;
    reciboMostrarDesconto: boolean;
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
    mesReferencia?: string | null;
    vendedor: string | null;
    itens: { nomeProduto: string; precoTabelaCents: number; precoUnitCents: number; quantidade: number }[];
    pagamentos: { valorCents: number }[];
  };
  cliente: {
    nome: string | null;
    // Razão social digitada pra este cliente. Vence o `nome` quando existe —
    // ver Contact.nomeNoRecibo.
    nomeNoRecibo?: string | null;
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
  /**
   * "Copia e cola" do PIX, já com o saldo devedor. Só existe quando o pedido
   * fechou como PIX a pagar, ainda não foi quitado e a empresa cadastrou a
   * chave. Quem renderiza transforma em QR Code.
   */
  pixCopiaECola: string | null;
  /** Cor da faixa e do TOTAL, já validada. */
  cor: string;
  /**
   * Corpo do recibo, já escolhido pela situação (cobrança quando em aberto,
   * quitação quando pago) e com as variáveis substituídas.
   */
  mensagem: string | null;
  vendedor: string | null;
  observacao: string | null;
  rodape: string | null;
};

const ROTULO_MEIO: Record<MeioDePagamento, string> = {
  PIX: "PIX",
  // Pro cliente é só "PIX" — a distinção entre pago e a pagar já aparece no
  // selo PAGO/PENDENTE, e "PIX pendente" no papel soaria como cobrança dobrada.
  PIX_PENDENTE: "PIX",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
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

/**
 * Troca as variáveis do texto configurado pelos valores do pedido.
 *
 * Chave desconhecida fica como está, em vez de virar vazio: se alguém escreveu
 * "{valorr}" por engano, ver "{valorr}" no papel mostra o erro; ver um buraco
 * no meio da frase não mostra nada, e o recibo sai pro cliente sem o valor.
 */
/** Verde do sistema. Vale pra quem nunca escolheu cor — ninguém muda sozinho. */
export const COR_PADRAO = "#0d9488";

/**
 * Cor de destaque válida, ou o padrão.
 *
 * Texto livre que vai direto pro `style` de um SVG não pode passar sem conferir
 * o formato: qualquer coisa fora de #rrggbb entra como valor inválido e o
 * recibo sai sem cor nenhuma na faixa.
 */
export function corDeDestaque(valor: string | null | undefined): string {
  const t = valor?.trim();
  return t && /^#[0-9a-fA-F]{6}$/.test(t) ? t : COR_PADRAO;
}

/**
 * Preto ou branco por cima da cor escolhida, pelo que dá pra ler.
 *
 * Sem isso, quem escolhesse um cinza claro ou um amarelo teria o nome da
 * própria empresa em branco sobre fundo claro — ilegível no comprovante que
 * vai pro cliente, e sem nada no sistema acusando.
 */
export function corDoTextoSobre(fundo: string): string {
  const n = (i: number) => parseInt(fundo.slice(i, i + 2), 16) / 255;
  // Luminância relativa (WCAG): o olho pesa verde mais que vermelho, e azul
  // quase nada — média simples dos canais erraria no azul e no amarelo.
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luz = 0.2126 * canal(n(1)) + 0.7152 * canal(n(3)) + 0.0722 * canal(n(5));
  return luz > 0.45 ? "#1e293b" : "#ffffff";
}

export function aplicarVariaveis(texto: string, valores: Record<string, string>): string {
  return texto.replace(/\{(\w+)\}/g, (original, chave: string) => valores[chave] ?? original);
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
  const itensBase = pedido.itens.map((i) => ({
    ...i,
    tabela: i.precoTabelaCents > 0 ? i.precoTabelaCents : i.precoUnitCents,
  }));

  // Preço que vai IMPRESSO em cada item.
  //
  // Cobrado abaixo da tabela: imprime o de tabela e mostra o desconto embaixo
  // — é o que a cliente da Believe confere na sacola, e ver o abatimento é
  // metade da graça.
  //
  // Cobrado ACIMA da tabela: imprime o próprio preço cobrado, sem linha de
  // ajuste. Antes saía "Acréscimo + R$ 150,00", o que num produto de prateleira
  // faria sentido, mas em serviço não: o honorário da Guttierres é negociado
  // por cliente, e o valor do catálogo é só um ponto de partida. Chamar a
  // diferença de acréscimo faz o comprovante parecer que cobraram a mais.
  // Empresa que não mostra desconto imprime sempre o preço cobrado, nos dois
  // sentidos — é o caso de quem negocia o valor por cliente.
  const mostraDesconto = empresa.reciboMostrarDesconto;
  const precoImpresso = (i: { tabela: number; precoUnitCents: number }) =>
    mostraDesconto ? Math.max(i.tabela, i.precoUnitCents) : i.precoUnitCents;

  const subtotalImpresso = itensBase.reduce((s, i) => s + precoImpresso(i) * i.quantidade, 0);
  const descontoItens = mostraDesconto
    ? itensBase.reduce((s, i) => s + Math.max(i.tabela - i.precoUnitCents, 0) * i.quantidade, 0)
    : 0;

  // O subtotal gravado no fechamento é a soma dos preços praticados. Se a
  // conta a partir dos itens não bate com ele (pedido antigo, item mexido por
  // fora), o recibo detalhado mentiria em algum lugar. Nesse caso sai o
  // formato simples, com os itens pelo preço cobrado — o TOTAL impresso é
  // sempre o congelado no pedido, em qualquer um dos dois formatos.
  const detalhado = subtotalImpresso - descontoItens === pedido.subtotalCents;

  const itens: ItemRecibo[] = itensBase.map((i) => {
    const preco = detalhado ? precoImpresso(i) : i.precoUnitCents;
    const desconto = (i.tabela - i.precoUnitCents) * i.quantidade;
    return {
      nome: i.nomeProduto,
      detalhe: `${i.quantidade} x ${centsToBRL(preco)}`,
      total: centsToBRL(preco * i.quantidade),
      ajuste:
        detalhado && mostraDesconto && desconto > 0 ? `Desconto - ${centsToBRL(desconto)}` : null,
    };
  });

  const totais: Recibo["totais"] = [];
  if (detalhado) {
    totais.push({ rotulo: "Subtotal", valor: centsToBRL(subtotalImpresso) });
    if (descontoItens > 0) totais.push({ rotulo: "Desconto nos itens", valor: `- ${centsToBRL(descontoItens)}` });
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
    // Chave PIX só no pedido que fecha como PIX a pagar: é o único em que o
    // cliente precisa saber pra onde mandar. No boleto e no fiado a chave
    // seria ruído, e no já pago seria um convite a pagar de novo.
    if (pedido.paymentMethod === "PIX_PENDENTE") {
      const chave = texto(empresa.reciboChavePix);
      if (chave) pagamento.push({ rotulo: "Chave PIX", valor: chave });
    }
    if (pedido.vencimento) pagamento.push({ rotulo: "Vencimento", valor: formatar(pedido.vencimento, tz, false) });
    // Mesma conta de saldoDoPedido(): a verdade é o histórico de pagamentos.
    const recebido = pedido.pagamentos.reduce((s, p) => s + p.valorCents, 0);
    if (recebido > 0) {
      pagamento.push({ rotulo: "Já pago", valor: centsToBRL(recebido) });
      pagamento.push({ rotulo: "Saldo a pagar", valor: centsToBRL(pedido.totalCents - recebido) });
    }
  }

  // QR do PIX: pelo SALDO, não pelo total. Num pedido com pagamento parcial o
  // cliente deve a diferença, e um QR com o valor cheio faria ele pagar duas
  // vezes a parte já quitada.
  const chavePix = texto(empresa.reciboChavePix);
  const saldoAPagar =
    pedido.totalCents - pedido.pagamentos.reduce((s, p) => s + p.valorCents, 0);
  const pixCopiaECola =
    !pedido.pago && pedido.paymentMethod === "PIX_PENDENTE" && chavePix && saldoAPagar > 0
      ? montarBrCode({
          chave: chavePix,
          valorCents: saldoAPagar,
          nomeRecebedor: texto(empresa.reciboNome) ?? empresa.nome,
          // Não temos cidade cadastrada. O campo é obrigatório no padrão mas
          // os bancos não o validam contra nada — ver sanitizar() em pix.ts.
          cidade: "BRASIL",
          identificador: `PEDIDO${pedido.numero}`,
        })
      : null;

  // Corpo do recibo: cobrança enquanto está em aberto, quitação depois de
  // pago. O valor acompanha a situação — em aberto é o que FALTA pagar, pago é
  // o que entrou. Mandar o total nos dois casos faria a cobrança de um pedido
  // parcialmente pago pedir o valor cheio de novo.
  const modelo = pedido.pago ? empresa.reciboTextoPago : empresa.reciboTextoPendente;
  const mensagem = texto(modelo)
    ? aplicarVariaveis(texto(modelo)!, {
        cliente: texto(cliente.nomeNoRecibo) ?? texto(cliente.nome) ?? "cliente",
        valor: centsToBRL(pedido.pago ? pedido.totalCents : saldoAPagar),
        mes: texto(pedido.mesReferencia) ?? "",
        numero: String(pedido.numero),
        data: formatar(quando, tz, false),
      })
    : null;

  const clienteLinhas: Linha[] = [];
  // Razão social digitada pro recibo ganha do nome que veio do WhatsApp — que
  // é apelido de agenda ("Paulo | PDUARTE"), não como a empresa se chama.
  const nome = texto(cliente.nomeNoRecibo) ?? texto(cliente.nome);
  const documento = formatarDocumento(cliente.documento);
  const endereco = texto(cliente.endereco);
  if (nome) clienteLinhas.push({ rotulo: "Cliente", valor: nome });
  if (cliente.telefone && !empresa.reciboOcultarTelefone) {
    clienteLinhas.push({ rotulo: "Telefone", valor: cliente.telefone });
  }
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
    pixCopiaECola,
    cor: corDeDestaque(empresa.reciboCorDestaque),
    mensagem,
    vendedor: texto(pedido.vendedor),
    observacao: texto(pedido.observacao),
    rodape: texto(empresa.reciboRodape),
  };
}
