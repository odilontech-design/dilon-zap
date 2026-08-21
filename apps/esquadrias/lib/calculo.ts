import {
  expandirTipologia,
  precificarItem,
  totalizarOrcamento,
  type Expansao,
  type FatorCor,
  type PrecoItem,
  type RegrasPreco,
  type Tipologia as TipologiaMotor,
} from "@dilon-zap/esquadrias-core";
import { prisma, type Empresa } from "@dilon-zap/erp-db";

/**
 * Ponte entre o banco e o motor de cálculo.
 *
 * O motor (`@dilon-zap/esquadrias-core`) não conhece Prisma de propósito: ele
 * é testável sem banco e reaproveitável fora do Next (worker de PDF, API
 * pública, app de campo). Este arquivo é o único lugar que sabe traduzir uma
 * tipologia gravada em linhas de tabela para o formato que o motor consome.
 */

/** Tipologia com tudo que o motor precisa — o include é sempre este. */
const INCLUDE_TIPOLOGIA = {
  parametros: { orderBy: { ordem: "asc" } },
  pecas: { include: { perfil: true }, orderBy: { ordem: "asc" } },
  vidros: { include: { vidro: true }, orderBy: { ordem: "asc" } },
  ferragens: { include: { ferragem: true }, orderBy: { ordem: "asc" } },
} as const;

type TipologiaComInsumos = Awaited<ReturnType<typeof carregarTipologia>>;

export async function carregarTipologia(tipologiaId: string, empresaId: string) {
  return prisma.tipologia.findFirst({
    where: { id: tipologiaId, empresaId },
    include: INCLUDE_TIPOLOGIA,
  });
}

export function paraMotor(tipologia: NonNullable<TipologiaComInsumos>): TipologiaMotor {
  return {
    id: tipologia.id,
    nome: tipologia.nome,
    categoria: tipologia.categoria,
    formulaMaoDeObra: tipologia.formulaMaoDeObra,
    parametros: tipologia.parametros.map((p) => ({ chave: p.chave, rotulo: p.rotulo, valorPadrao: p.valorPadrao })),
    pecas: tipologia.pecas.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      perfilId: p.perfil.id,
      perfilCodigo: p.perfil.codigo,
      perfilNome: p.perfil.nome,
      pesoPorMetro: p.perfil.pesoPorMetro,
      precoPorKgCentavos: p.perfil.precoPorKgCentavos,
      comprimentoBarraMm: p.perfil.comprimentoBarraMm,
      corte: p.corte,
      formulaQuantidade: p.formulaQuantidade,
      formulaComprimento: p.formulaComprimento,
    })),
    vidros: tipologia.vidros.map((v) => ({
      id: v.id,
      descricao: v.descricao,
      vidroId: v.vidro.id,
      vidroNome: v.vidro.nome,
      precoM2Centavos: v.vidro.precoM2Centavos,
      m2Minimo: v.vidro.m2Minimo,
      formulaQuantidade: v.formulaQuantidade,
      formulaLargura: v.formulaLargura,
      formulaAltura: v.formulaAltura,
    })),
    ferragens: tipologia.ferragens.map((f) => ({
      id: f.id,
      descricao: f.descricao,
      ferragemId: f.ferragem.id,
      ferragemNome: f.ferragem.nome,
      unidade: f.ferragem.unidade,
      precoUnitarioCentavos: f.ferragem.precoUnitarioCentavos,
      formulaQuantidade: f.formulaQuantidade,
    })),
  };
}

export function regrasDaEmpresa(empresa: Empresa): RegrasPreco {
  return {
    margemLucroPercent: empresa.margemLucroPercent,
    maoDeObraPorM2Centavos: empresa.maoDeObraPorM2Centavos,
    maoDeObraPercentSobreCusto: empresa.maoDeObraPercentSobreCusto,
    perdaAluminioPercent: empresa.perdaAluminioPercent,
    impostoPercent: empresa.impostoPercent,
  };
}

export type MemoriaCalculo = {
  tipologiaNome: string;
  expansao: Expansao;
  preco: PrecoItem;
  calculadoEm: string;
};

/**
 * Recalcula todos os itens do orçamento e regrava os totais.
 *
 * Orçamento APROVADO não é recalculado: a partir da aprovação ele é
 * documento, não consulta. O preço do alumínio muda toda semana, e reabrir um
 * orçamento assinado mostrando outro valor é a diferença entre um sistema de
 * gestão e uma calculadora com histórico.
 */
export async function recalcularOrcamento(orcamentoId: string, empresaId: string) {
  const orcamento = await prisma.orcamento.findFirst({
    where: { id: orcamentoId, empresaId },
    include: {
      itens: { include: { corAluminio: true, corFerragem: true }, orderBy: { ordem: "asc" } },
      empresa: true,
    },
  });
  if (!orcamento) return null;
  if (orcamento.status === "APROVADO") return orcamento;

  const regras = regrasDaEmpresa(orcamento.empresa);
  const tipologias = new Map<string, NonNullable<TipologiaComInsumos>>();

  const erros: Array<{ itemId: string; erro: string }> = [];

  for (const item of orcamento.itens) {
    if (!item.tipologiaId) continue;

    let tipologia = tipologias.get(item.tipologiaId);
    if (!tipologia) {
      const carregada = await carregarTipologia(item.tipologiaId, empresaId);
      if (!carregada) continue;
      tipologia = carregada;
      tipologias.set(item.tipologiaId, carregada);
    }

    const fatorCor: FatorCor = {
      aluminio: item.corAluminio?.fatorAluminio ?? 1,
      ferragem: item.corFerragem?.fatorFerragem ?? 1,
    };

    try {
      const expansao = expandirTipologia(
        paraMotor(tipologia),
        {
          larguraMm: item.larguraMm,
          alturaMm: item.alturaMm,
          quantidade: item.quantidade,
          parametros: (item.parametros as Record<string, number> | null) ?? undefined,
        },
        fatorCor,
      );

      const preco = precificarItem(expansao, regras, {
        margemLucroPercent: item.margemLucroPercent,
        acrescimoCentavos: item.acrescimoCentavos,
        descontoCentavos: item.descontoCentavos,
        adicionaisCentavos: item.adicionaisCentavos,
      });

      const memoria: MemoriaCalculo = {
        tipologiaNome: tipologia.nome,
        expansao,
        preco,
        calculadoEm: new Date().toISOString(),
      };

      await prisma.orcamentoItem.update({
        where: { id: item.id },
        data: {
          custoCentavos: preco.custoTotalCentavos,
          subtotalCentavos: preco.subtotalCentavos,
          totalCentavos: preco.totalCentavos,
          memoriaCalculo: memoria as never,
        },
      });
    } catch (err) {
      // Fórmula quebrada em UM item não pode derrubar o orçamento inteiro: o
      // vendedor precisa ver os outros itens e saber exatamente qual falhou.
      erros.push({ itemId: item.id, erro: err instanceof Error ? err.message : "erro no cálculo" });
      await prisma.orcamentoItem.update({
        where: { id: item.id },
        data: {
          custoCentavos: 0,
          subtotalCentavos: 0,
          totalCentavos: 0,
          memoriaCalculo: { erro: err instanceof Error ? err.message : "erro no cálculo" } as never,
        },
      });
    }
  }

  const itensAtualizados = await prisma.orcamentoItem.findMany({
    where: { orcamentoId },
    select: { totalCentavos: true, custoCentavos: true },
  });

  const totais = totalizarOrcamento(
    itensAtualizados.map((i) => ({ totalCentavos: i.totalCentavos, custoTotalCentavos: i.custoCentavos })),
    {
      descontoPercent: orcamento.descontoPercent,
      descontoCentavos: orcamento.descontoCentavos,
      freteCentavos: orcamento.freteCentavos,
    },
  );

  const atualizado = await prisma.orcamento.update({
    where: { id: orcamentoId },
    data: {
      subtotalCentavos: totais.subtotalCentavos,
      descontoAplicadoCentavos: totais.descontoCentavos,
      totalCentavos: totais.totalCentavos,
      custoCentavos: totais.custoCentavos,
      lucroCentavos: totais.lucroCentavos,
    },
  });

  return { ...atualizado, erros };
}

/** Lê a memória de cálculo já gravada — sem reexpandir tipologia. */
export function lerMemoria(valor: unknown): MemoriaCalculo | null {
  if (!valor || typeof valor !== "object") return null;
  const m = valor as Partial<MemoriaCalculo>;
  return m.expansao && m.preco ? (m as MemoriaCalculo) : null;
}

/**
 * Expansões já gravadas nos itens do orçamento.
 *
 * Lê o snapshot em vez de reexpandir: além de ser mais rápido, é o único jeito
 * de a relação de materiais de um orçamento aprovado bater com o preço que o
 * cliente assinou, mesmo depois de o alumínio subir.
 */
export async function expansoesDoOrcamento(orcamentoId: string, empresaId: string) {
  const orcamento = await prisma.orcamento.findFirst({
    where: { id: orcamentoId, empresaId },
    include: {
      cliente: true,
      empresa: true,
      vendedor: { select: { nome: true } },
      itens: {
        include: { tipologia: { select: { nome: true, desenhoSvg: true } }, corAluminio: true, corFerragem: true },
        orderBy: { ordem: "asc" },
      },
    },
  });
  if (!orcamento) return null;

  const itens = orcamento.itens.map((item) => ({ item, memoria: lerMemoria(item.memoriaCalculo) }));

  return { orcamento, itens };
}
