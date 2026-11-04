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
  /**
   * Orçamento: o pedido ainda não fechou (a consultora manda para a cliente
   * conferir antes — Believe, 16/10). Muda título, selo e pagamento; sem PIX
   * nem cobrança. `plano` é a condição combinada, se houver.
   */
  orcamento?: {
    plano?: { entradaCents: number | null; numParcelas: number | null; periodicidade: string | null; primeiroVencimento: Date | null } | null;
  };
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
    /**
     * Parcelas da conta a receber do pedido (Recorrente: entrada + parcelas).
     * Saem detalhadas no recibo — pedido da Believe, 14/10. Ausente ou com
     * uma parcela só, o recibo segue com o vencimento simples.
     */
    parcelas?: {
      tipo: "ENTRADA" | "UNICA" | "SEMANAL" | "QUINZENAL" | "MENSAL";
      numero: number;
      totalParcelas: number;
      vencimento: Date | null;
      valorCents: number;
      pagoCents: number;
    }[];
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
  situacao: "PAGO" | "PENDENTE" | "ORCAMENTO";
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
  FIADO: "Recorrente",
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

function luminancia(hex: string): number {
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16) / 255;
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * canal(n(1)) + 0.7152 * canal(n(3)) + 0.0722 * canal(n(5));
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * A cor da marca usada como TEXTO sobre fundo claro (o TOTAL, o desconto do
 * item). Cor clara — o lilás da Believe — deixava o valor do pedido quase
 * apagado (14/10). Escurece a mesma cor, mantendo o tom, até ter contraste de
 * leitura (4,5:1, o mínimo da WCAG para texto); cor que já é escura passa igual.
 */
export function corLegivelSobre(cor: string, fundo = "#ffffff", minimo = 4.5): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(cor)) return "#1e293b";
  if (contraste(cor, fundo) >= minimo) return cor;
  // Escurece pela luminosidade (HSL), mantendo matiz e saturação: o lilás
  // vira roxo, não cinza.
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let sat = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  const paraHex = (hh: number, ss: number, ll: number) => {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const pp = 2 * ll - q;
    const canal = (t: number) => {
      const tt = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
      if (tt < 1 / 6) return pp + (q - pp) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return pp + (q - pp) * (2 / 3 - tt) * 6;
      return pp;
    };
    return "#" + [canal(hh + 1 / 3), canal(hh), canal(hh - 1 / 3)].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
  };
  let saida = cor;
  while (l > 0 && contraste(saida, fundo) < minimo) {
    l = Math.max(0, l - 0.03);
    saida = paraHex(h, sat, l);
  }
  return saida;
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

/** Parcelas da conta, já com o quanto foi pago em cada uma. */
export function parcelasDoRecibo(
  conta:
    | {
        canceladaEm: Date | null;
        parcelas: { tipo: "ENTRADA" | "UNICA" | "SEMANAL" | "QUINZENAL" | "MENSAL"; numero: number; totalParcelas: number; vencimento: Date | null; valorCents: number; pagamentos: { valorCents: number }[] }[];
      }
    | null
    | undefined
) {
  if (!conta || conta.canceladaEm) return undefined;
  return conta.parcelas.map(({ pagamentos, ...p }) => ({ ...p, pagoCents: pagamentos.reduce((s, x) => s + x.valorCents, 0) }));
}

export function montarRecibo(entrada: ReciboEntrada): Recibo {
  const recibo = montarReciboBase(entrada);
  if (!entrada.orcamento) return recibo;

  // Orçamento: mesmo papel, mas é proposta — nada de "pendente", PIX ou saldo.
  const { pedido, empresa } = entrada;
  const tz = empresa.timezone;
  const pagamento: Linha[] = [];
  if (pedido.paymentMethod) pagamento.push({ rotulo: "Forma de pagamento", valor: ROTULO_MEIO[pedido.paymentMethod] });
  const plano = entrada.orcamento.plano;
  if (plano?.numParcelas) {
    const intervalo =
      plano.periodicidade === "SEMANAL" ? "semanais" : plano.periodicidade === "QUINZENAL" ? "quinzenais" : plano.periodicidade === "MENSAL" ? "mensais" : "";
    const restante = pedido.totalCents - (plano.entradaCents ?? 0);
    const parcela = Math.floor(restante / plano.numParcelas);
    const condicao = [
      plano.entradaCents ? `Entrada ${centsToBRL(plano.entradaCents)}` : null,
      `${plano.numParcelas}x de ${centsToBRL(parcela)}${intervalo ? ` ${intervalo}` : ""}`,
    ]
      .filter(Boolean)
      .join(" + ");
    pagamento.push({ rotulo: "Condição", valor: condicao });
    if (plano.primeiroVencimento) pagamento.push({ rotulo: "1ª parcela", valor: formatar(plano.primeiroVencimento, tz, false) });
  }
  return {
    ...recibo,
    titulo: `Orçamento nº ${pedido.numero}`,
    situacao: "ORCAMENTO",
    pagamento,
    pixCopiaECola: null,
    mensagem: "Este é um orçamento: os valores e as condições valem até a confirmação do pedido.",
  };
}

function montarReciboBase({ empresa, pedido, cliente }: ReciboEntrada): Recibo {
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
  // Total de descontos somado, quando vem de mais de um lugar (dois itens com
  // desconto, ou item e pedido): a cliente vê de uma vez quanto economizou —
  // pedido da Believe, 14/10 (R$ 81 + R$ 31 = R$ 112 no pedido da Daniele).
  const itensComDesconto = detalhado
    ? itensBase.filter((i) => mostraDesconto && i.tabela - i.precoUnitCents > 0).length
    : 0;
  const fontesDeDesconto = itensComDesconto + (pedido.descontoCents > 0 ? 1 : 0);
  const descontoTotal = (detalhado ? descontoItens : 0) + pedido.descontoCents;
  if (fontesDeDesconto >= 2 && descontoTotal > 0) {
    totais.push({ rotulo: "Total de descontos", valor: `- ${centsToBRL(descontoTotal)}` });
  }
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
    const parcelas = pedido.parcelas ?? [];
    if (parcelas.length > 1) {
      // Recorrente: entrada e cada parcela com data e valor; as já pagas
      // marcadas. É o que a cliente usa para se organizar.
      const regulares = parcelas.filter((p) => p.tipo !== "ENTRADA");
      const tipo = regulares[0]?.tipo;
      const intervalo = tipo === "SEMANAL" ? "semanais" : tipo === "QUINZENAL" ? "quinzenais" : tipo === "MENSAL" ? "mensais" : "";
      // Entrada dividida (29/10) numera as partes; a entrada única fica só "Entrada".
      const qtdEntradas = parcelas.filter((p) => p.tipo === "ENTRADA").length;
      let entradaN = 0;
      for (const p of parcelas) {
        const quando = p.vencimento ? formatar(p.vencimento, tz, false) : "sem data";
        const paga = p.pagoCents >= p.valorCents;
        pagamento.push({
          rotulo: p.tipo === "ENTRADA" ? `Entrada${qtdEntradas > 1 ? ` ${++entradaN}/${qtdEntradas}` : ""} · ${quando}` : `Parcela ${p.numero}/${p.totalParcelas} · ${quando}`,
          valor: `${centsToBRL(p.valorCents)}${paga ? " (pago)" : ""}`,
        });
      }
      if (regulares.length > 0 && intervalo) {
        pagamento.splice(pagamento.length - parcelas.length, 0, {
          rotulo: "Parcelamento",
          valor: `${regulares.length} parcela(s) ${intervalo}`,
        });
      }
    } else if (pedido.vencimento) {
      pagamento.push({ rotulo: "Vencimento", valor: formatar(pedido.vencimento, tz, false) });
    }
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
