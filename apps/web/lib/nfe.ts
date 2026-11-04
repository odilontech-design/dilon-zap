/**
 * Leitura do XML da NF-e de compra (reunião Believe, 29/10): o fornecedor
 * manda o XML e o estoque e o A pagar se preenchem sozinhos, em vez de
 * digitar a nota impressa item a item.
 *
 * Lê só o que a importação usa — emitente, número, itens e duplicatas — com
 * expressões simples sobre as tags do layout nacional (4.00). Não valida
 * assinatura nem schema: quem importa é a gestão da própria empresa, com a
 * nota que ela recebeu.
 */

export type ItemDaNota = {
  /** Ordem do item na nota (nItem). */
  n: number;
  codigo: string;
  ean: string | null;
  descricao: string;
  unidade: string;
  quantidade: number;
  /**
   * Custo total do item para o estoque: valor dos produtos mais IPI, ST,
   * frete, seguro e outras despesas, menos o desconto. É o que a empresa de
   * fato pagou por aquela linha.
   */
  custoTotalCents: number;
};

export type DuplicataDaNota = { numero: string; vencimento: string; valorCents: number };

export type NotaLida = {
  chave: string;
  numero: string;
  serie: string | null;
  emitidaEm: string | null;
  emitente: { nome: string; cnpj: string | null };
  valorCents: number;
  itens: ItemDaNota[];
  duplicatas: DuplicataDaNota[];
};

export class ErroDeNota extends Error {}

function tag(xml: string, nome: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`));
  return m ? decodificar(m[1].trim()) : null;
}

function blocos(xml: string, nome: string): string[] {
  return [...xml.matchAll(new RegExp(`<(?:\\w+:)?${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${nome}>`, "g"))].map((m) => m[0]);
}

function decodificar(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const centavos = (v: string | null) => (v ? Math.round(Number(v) * 100) : 0);

export function lerNfe(xml: string): NotaLida {
  const infNFe = xml.match(/<(?:\w+:)?infNFe[^>]*\bId="NFe(\d{44})"/);
  if (!infNFe) throw new ErroDeNota("este arquivo não parece ser o XML de uma NF-e");

  const ide = tag(xml, "ide") ?? "";
  const emit = tag(xml, "emit") ?? "";
  const total = tag(xml, "ICMSTot") ?? "";

  const itens: ItemDaNota[] = blocos(xml, "det").map((det, i) => {
    const prod = tag(det, "prod") ?? "";
    const imposto = tag(det, "imposto") ?? "";
    const ipi = tag(imposto, "IPITrib");
    const icms = tag(imposto, "ICMS") ?? "";
    const n = Number(det.match(/nItem="(\d+)"/)?.[1] ?? i + 1);
    const ean = tag(prod, "cEAN");
    const custo =
      centavos(tag(prod, "vProd")) +
      centavos(ipi ? tag(ipi, "vIPI") : null) +
      centavos(tag(icms, "vICMSST")) +
      centavos(tag(prod, "vFrete")) +
      centavos(tag(prod, "vSeg")) +
      centavos(tag(prod, "vOutro")) -
      centavos(tag(prod, "vDesc"));
    return {
      n,
      codigo: tag(prod, "cProd") ?? "",
      ean: ean && /^\d{8,14}$/.test(ean) ? ean : null,
      descricao: tag(prod, "xProd") ?? `Item ${n}`,
      unidade: tag(prod, "uCom") ?? "UN",
      quantidade: Number(tag(prod, "qCom") ?? "0"),
      custoTotalCents: Math.max(0, custo),
    };
  });
  if (itens.length === 0) throw new ErroDeNota("a nota não tem itens");

  const duplicatas: DuplicataDaNota[] = blocos(xml, "dup")
    .map((d) => ({ numero: tag(d, "nDup") ?? "", vencimento: (tag(d, "dVenc") ?? "").slice(0, 10), valorCents: centavos(tag(d, "vDup")) }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.vencimento) && d.valorCents > 0);

  return {
    chave: infNFe[1],
    numero: tag(ide, "nNF") ?? "",
    serie: tag(ide, "serie"),
    emitidaEm: tag(ide, "dhEmi") ?? tag(ide, "dEmi"),
    emitente: { nome: tag(emit, "xNome") || tag(emit, "xFant") || "Fornecedor", cnpj: tag(emit, "CNPJ") ?? tag(emit, "CPF") },
    valorCents: centavos(tag(total, "vNF")),
    itens,
    duplicatas,
  };
}
