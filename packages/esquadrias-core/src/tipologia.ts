import { avaliarFormula, ErroDeFormula } from "./formula";

/**
 * Expansão de tipologia: transforma "JANELA 2 FOLHAS, 1200x1000, 2 unidades"
 * na lista concreta de barras cortadas, chapas de vidro e ferragens.
 *
 * É o passo que o concorrente esconde atrás de um catálogo fechado de +3400
 * tipologias. Aqui a tipologia é DADO do tenant: a serralheria cadastra a
 * linha de perfil que ela compra e as fórmulas de corte que ela usa. Quem
 * trabalha com a linha Suprema e quem trabalha com a linha 25 não precisam
 * do mesmo sistema — precisam do mesmo motor.
 */

export type TipoCorte = "RETO" | "ANGULO_45" | "ANGULO_45_DUPLO";

export type ParametroTipologia = {
  chave: string;
  rotulo: string;
  valorPadrao: number;
};

export type PecaTemplate = {
  id: string;
  descricao: string;
  perfilId: string;
  perfilCodigo: string;
  perfilNome: string;
  /** kg por metro linear — é o que a indústria informa e o que define o custo. */
  pesoPorMetro: number;
  precoPorKgCentavos: number;
  comprimentoBarraMm: number;
  corte: TipoCorte;
  formulaQuantidade: string;
  formulaComprimento: string;
};

export type VidroTemplate = {
  id: string;
  descricao: string;
  vidroId: string;
  vidroNome: string;
  precoM2Centavos: number;
  /** Metragem mínima cobrada pela vidraçaria. Chapa de 0,2 m² é cobrada como 1 m². */
  m2Minimo: number;
  formulaQuantidade: string;
  formulaLargura: string;
  formulaAltura: string;
};

export type FerragemTemplate = {
  id: string;
  descricao: string;
  ferragemId: string;
  ferragemNome: string;
  unidade: string;
  precoUnitarioCentavos: number;
  /**
   * Insumo vendido a granel — kg de eletrodo, metro de trilho, m² de tinta.
   * Nesses a quantidade fracionária é o resultado real: arredondar 3,3 m de
   * trilho pra 4 m encarece o orçamento sem que ninguém veja de onde veio.
   * Peça continua sendo arredondada pra cima: meia dobradiça não existe.
   */
  fracionavel?: boolean;
  formulaQuantidade: string;
};

export type Tipologia = {
  id: string;
  nome: string;
  categoria: string;
  parametros: ParametroTipologia[];
  pecas: PecaTemplate[];
  vidros: VidroTemplate[];
  ferragens: FerragemTemplate[];
  /** Fórmula opcional de mão de obra em centavos. Vazia = usa a regra da empresa. */
  formulaMaoDeObra?: string | null;
};

export type Medidas = {
  larguraMm: number;
  alturaMm: number;
  quantidade: number;
  /** Sobrescreve `parametros[].valorPadrao` item a item (a folga que essa obra pede). */
  parametros?: Record<string, number>;
};

export type PecaExpandida = {
  templateId: string;
  descricao: string;
  perfilId: string;
  perfilCodigo: string;
  perfilNome: string;
  corte: TipoCorte;
  /** Quantidade JÁ multiplicada pela quantidade de esquadrias do item. */
  quantidade: number;
  comprimentoMm: number;
  comprimentoBarraMm: number;
  pesoTotalKg: number;
  custoCentavos: number;
  // Peso e preço do perfil viajam junto com a peça de propósito: a expansão é
  // gravada como memória de cálculo do item, e o plano de corte é gerado a
  // partir DELA meses depois. Sem esses dois campos, gerar o corte de um
  // orçamento antigo precisaria reler o catálogo de hoje — e o custo da barra
  // sairia diferente do que o cliente aprovou.
  pesoPorMetro: number;
  precoPorKgCentavos: number;
};

export type VidroExpandido = {
  templateId: string;
  descricao: string;
  vidroId: string;
  vidroNome: string;
  quantidade: number;
  larguraMm: number;
  alturaMm: number;
  m2Unitario: number;
  m2CobradoUnitario: number;
  custoCentavos: number;
};

export type FerragemExpandida = {
  templateId: string;
  descricao: string;
  ferragemId: string;
  ferragemNome: string;
  unidade: string;
  quantidade: number;
  fracionavel: boolean;
  custoCentavos: number;
};

export type Expansao = {
  pecas: PecaExpandida[];
  vidros: VidroExpandido[];
  ferragens: FerragemExpandida[];
  custoAluminioCentavos: number;
  custoVidroCentavos: number;
  custoFerragemCentavos: number;
  /** Área da esquadria (uma unidade) em m² — base de mão de obra e de relatório. */
  areaM2: number;
  areaTotalM2: number;
  pesoTotalKg: number;
};

/** Multiplicador de preço por cor: anodizado/pintado custa mais que o natural. */
export type FatorCor = {
  aluminio: number;
  ferragem: number;
};

export const FATOR_COR_NEUTRO: FatorCor = { aluminio: 1, ferragem: 1 };

function escopoDe(tipologia: Tipologia, medidas: Medidas): Record<string, number> {
  const L = medidas.larguraMm;
  const H = medidas.alturaMm;

  const escopo: Record<string, number> = {
    L,
    H,
    // Aliases por extenso: numa fórmula longa `largura - 2 * folga` se lê
    // melhor do que `L - 2 * folga`, e quem cadastra tipologia não é
    // obrigado a decorar a letra.
    largura: L,
    altura: H,
    Q: medidas.quantidade,
    quantidade: medidas.quantidade,
    AREA: (L / 1000) * (H / 1000),
    PERIMETRO: (2 * (L + H)) / 1000,
  };

  for (const p of tipologia.parametros) {
    escopo[p.chave] = medidas.parametros?.[p.chave] ?? p.valorPadrao;
  }

  return escopo;
}

/**
 * Área em m² sai de milímetro dividido por mil, e 1,2 * 3 em ponto flutuante
 * dá 3,5999999999999996. Isso vaza pro relatório e pro preço de mão de obra
 * por m², então corta em 4 casas — precisão de sobra pra medida de obra.
 */
function arredondar4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function arredondar3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function exigirNaoNegativo(valor: number, campo: string, expr: string): number {
  if (valor < 0) throw new ErroDeFormula(`${campo} resultou em valor negativo (${valor})`, expr);
  return valor;
}

/**
 * Expande a tipologia nas peças reais.
 *
 * Quantidades saem arredondadas pra cima: meia dobradiça não existe, e é
 * melhor sobrar um parafuso do que faltar na hora da instalação. Comprimentos
 * ficam em milímetro inteiro porque é a unidade da serra.
 */
export function expandirTipologia(tipologia: Tipologia, medidas: Medidas, fatorCor: FatorCor = FATOR_COR_NEUTRO): Expansao {
  const escopo = escopoDe(tipologia, medidas);
  const qtdItem = Math.max(1, Math.round(medidas.quantidade));

  const pecas: PecaExpandida[] = [];
  for (const t of tipologia.pecas) {
    const qtdUnit = Math.ceil(exigirNaoNegativo(avaliarFormula(t.formulaQuantidade, escopo), `quantidade de "${t.descricao}"`, t.formulaQuantidade));
    if (qtdUnit === 0) continue;

    const comprimento = Math.round(exigirNaoNegativo(avaliarFormula(t.formulaComprimento, escopo), `comprimento de "${t.descricao}"`, t.formulaComprimento));
    if (comprimento === 0) continue;
    if (comprimento > t.comprimentoBarraMm) {
      throw new ErroDeFormula(
        `"${t.descricao}" precisa de ${comprimento}mm, mas a barra do perfil ${t.perfilCodigo} tem ${t.comprimentoBarraMm}mm`,
        t.formulaComprimento,
      );
    }

    const quantidade = qtdUnit * qtdItem;
    const pesoTotalKg = (comprimento / 1000) * t.pesoPorMetro * quantidade;
    const custoCentavos = Math.round(pesoTotalKg * t.precoPorKgCentavos * fatorCor.aluminio);

    pecas.push({
      templateId: t.id,
      descricao: t.descricao,
      perfilId: t.perfilId,
      perfilCodigo: t.perfilCodigo,
      perfilNome: t.perfilNome,
      corte: t.corte,
      quantidade,
      comprimentoMm: comprimento,
      comprimentoBarraMm: t.comprimentoBarraMm,
      pesoTotalKg,
      custoCentavos,
      pesoPorMetro: t.pesoPorMetro,
      precoPorKgCentavos: t.precoPorKgCentavos,
    });
  }

  const vidros: VidroExpandido[] = [];
  for (const t of tipologia.vidros) {
    const qtdUnit = Math.ceil(exigirNaoNegativo(avaliarFormula(t.formulaQuantidade, escopo), `quantidade de "${t.descricao}"`, t.formulaQuantidade));
    if (qtdUnit === 0) continue;

    const larguraMm = Math.round(exigirNaoNegativo(avaliarFormula(t.formulaLargura, escopo), `largura de "${t.descricao}"`, t.formulaLargura));
    const alturaMm = Math.round(exigirNaoNegativo(avaliarFormula(t.formulaAltura, escopo), `altura de "${t.descricao}"`, t.formulaAltura));
    if (larguraMm === 0 || alturaMm === 0) continue;

    const quantidade = qtdUnit * qtdItem;
    const m2Unitario = arredondar4((larguraMm / 1000) * (alturaMm / 1000));
    const m2CobradoUnitario = Math.max(m2Unitario, t.m2Minimo);
    const custoCentavos = Math.round(m2CobradoUnitario * quantidade * t.precoM2Centavos);

    vidros.push({
      templateId: t.id,
      descricao: t.descricao,
      vidroId: t.vidroId,
      vidroNome: t.vidroNome,
      quantidade,
      larguraMm,
      alturaMm,
      m2Unitario,
      m2CobradoUnitario,
      custoCentavos,
    });
  }

  const ferragens: FerragemExpandida[] = [];
  for (const t of tipologia.ferragens) {
    const bruto = exigirNaoNegativo(avaliarFormula(t.formulaQuantidade, escopo), `quantidade de "${t.descricao}"`, t.formulaQuantidade);
    // Granel mantém a fração (3 casas basta: grama de eletrodo, milímetro de
    // trilho); peça arredonda pra cima porque não se compra meia roldana.
    const qtdUnit = t.fracionavel ? arredondar3(bruto) : Math.ceil(bruto);
    if (qtdUnit === 0) continue;

    const quantidade = t.fracionavel ? arredondar3(qtdUnit * qtdItem) : qtdUnit * qtdItem;
    ferragens.push({
      templateId: t.id,
      descricao: t.descricao,
      ferragemId: t.ferragemId,
      ferragemNome: t.ferragemNome,
      unidade: t.unidade,
      quantidade,
      fracionavel: t.fracionavel ?? false,
      custoCentavos: Math.round(quantidade * t.precoUnitarioCentavos * fatorCor.ferragem),
    });
  }

  const somar = (n: number[]) => n.reduce((a, b) => a + b, 0);
  const areaM2 = escopo.AREA;

  return {
    pecas,
    vidros,
    ferragens,
    custoAluminioCentavos: somar(pecas.map((p) => p.custoCentavos)),
    custoVidroCentavos: somar(vidros.map((v) => v.custoCentavos)),
    custoFerragemCentavos: somar(ferragens.map((f) => f.custoCentavos)),
    areaM2: arredondar4(areaM2),
    areaTotalM2: arredondar4(areaM2 * qtdItem),
    pesoTotalKg: arredondar4(somar(pecas.map((p) => p.pesoTotalKg))),
  };
}
