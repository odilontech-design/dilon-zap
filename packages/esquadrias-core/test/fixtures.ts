import type { Tipologia } from "../src/tipologia";

/**
 * Janela 2 folhas de correr, linha 25 — a tipologia mais vendida do setor.
 * Serve de fixture porque exerce tudo: peça que depende só de L, peça que
 * depende de H, peça com folga, vidro derivado da folha e ferragem por folha.
 */
export const JANELA_2_FOLHAS: Tipologia = {
  id: "tip_janela2",
  nome: "Janela 2 folhas de correr",
  categoria: "JANELA",
  parametros: [
    { chave: "folga", rotulo: "Folga de montagem (mm)", valorPadrao: 10 },
    { chave: "folgaVidro", rotulo: "Folga do vidro (mm)", valorPadrao: 6 },
  ],
  pecas: [
    {
      id: "p1", descricao: "Trilho superior e inferior", perfilId: "perf_trilho", perfilCodigo: "25.01", perfilNome: "Trilho 2 vias",
      pesoPorMetro: 0.5, precoPorKgCentavos: 4500, comprimentoBarraMm: 6000, corte: "RETO",
      formulaQuantidade: "2", formulaComprimento: "L",
    },
    {
      id: "p2", descricao: "Marco lateral", perfilId: "perf_marco", perfilCodigo: "25.02", perfilNome: "Marco lateral",
      pesoPorMetro: 0.4, precoPorKgCentavos: 4500, comprimentoBarraMm: 6000, corte: "RETO",
      formulaQuantidade: "2", formulaComprimento: "H",
    },
    {
      id: "p3", descricao: "Folha vertical", perfilId: "perf_folha", perfilCodigo: "25.03", perfilNome: "Perfil folha",
      pesoPorMetro: 0.3, precoPorKgCentavos: 4500, comprimentoBarraMm: 6000, corte: "ANGULO_45",
      formulaQuantidade: "4", formulaComprimento: "H - 2 * folga",
    },
    {
      id: "p4", descricao: "Folha horizontal", perfilId: "perf_folha", perfilCodigo: "25.03", perfilNome: "Perfil folha",
      pesoPorMetro: 0.3, precoPorKgCentavos: 4500, comprimentoBarraMm: 6000, corte: "ANGULO_45",
      formulaQuantidade: "4", formulaComprimento: "L / 2 - folga",
    },
  ],
  vidros: [
    {
      id: "v1", descricao: "Vidro da folha", vidroId: "vid_4mm", vidroNome: "Vidro incolor 4mm",
      precoM2Centavos: 9000, m2Minimo: 0.5,
      formulaQuantidade: "2", formulaLargura: "L / 2 - 2 * folgaVidro", formulaAltura: "H - 2 * folgaVidro",
    },
  ],
  ferragens: [
    {
      id: "f1", descricao: "Roldana dupla", ferragemId: "fer_roldana", ferragemNome: "Roldana dupla",
      unidade: "pç", precoUnitarioCentavos: 850, formulaQuantidade: "4",
    },
    {
      id: "f2", descricao: "Fecho concha", ferragemId: "fer_fecho", ferragemNome: "Fecho concha",
      unidade: "pç", precoUnitarioCentavos: 1200, formulaQuantidade: "1",
    },
  ],
};

/**
 * Grade de proteção em metalon — a tipologia de FERRO da serralheria.
 *
 * Está aqui porque ferro não é um caso especial do motor: o perfil continua
 * sendo kg/m × R$/kg × barra, o que muda é o insumo. O que ela exerce e a
 * janela não é: quantidade de peça que sai do VÃO (`teto(L / espaçamento)`,
 * a variedade que o serralheiro calcula na mão hoje) e consumível a granel
 * (eletrodo em kg, tinta em m²) medido em fração de unidade.
 */
export const GRADE_FERRO: Tipologia = {
  id: "tip_grade",
  nome: "Grade de proteção - metalon",
  categoria: "JANELA",
  parametros: [
    { chave: "espacamento", rotulo: "Espaçamento máx. entre barras (mm)", valorPadrao: 110 },
    { chave: "folga", rotulo: "Folga total no vão (mm)", valorPadrao: 10 },
  ],
  pecas: [
    {
      id: "g1", descricao: "Moldura horizontal", perfilId: "perf_met30", perfilCodigo: "MET-30x30", perfilNome: "Metalon 30x30",
      pesoPorMetro: 1.08, precoPorKgCentavos: 1050, comprimentoBarraMm: 6000, corte: "RETO",
      formulaQuantidade: "2", formulaComprimento: "L - folga",
    },
    {
      id: "g2", descricao: "Moldura vertical", perfilId: "perf_met30", perfilCodigo: "MET-30x30", perfilNome: "Metalon 30x30",
      pesoPorMetro: 1.08, precoPorKgCentavos: 1050, comprimentoBarraMm: 6000, corte: "RETO",
      formulaQuantidade: "2", formulaComprimento: "H - folga - 60",
    },
    {
      id: "g3", descricao: "Barra vertical", perfilId: "perf_met20", perfilCodigo: "MET-20x20", perfilNome: "Metalon 20x20",
      pesoPorMetro: 0.71, precoPorKgCentavos: 1050, comprimentoBarraMm: 6000, corte: "RETO",
      formulaQuantidade: "teto((L - folga) / espacamento) - 1", formulaComprimento: "H - folga - 60",
    },
  ],
  vidros: [],
  ferragens: [
    {
      id: "gf1", descricao: "Fixação no vão", ferragemId: "fer_chumbador", ferragemNome: "Chumbador parabolt 3/8\"",
      unidade: "pç", precoUnitarioCentavos: 480, formulaQuantidade: "8",
    },
    {
      id: "gf2", descricao: "Solda", ferragemId: "fer_eletrodo", ferragemNome: "Eletrodo 6013 2,50mm",
      unidade: "kg", precoUnitarioCentavos: 3200, fracionavel: true,
      formulaQuantidade: "0,04 * (teto((L - folga) / espacamento) + 3)",
    },
    {
      id: "gf3", descricao: "Fundo + esmalte (2 faces)", ferragemId: "fer_tinta", ferragemNome: "Tinta esmalte sintético",
      unidade: "m²", precoUnitarioCentavos: 1100, fracionavel: true, formulaQuantidade: "AREA * 2",
    },
  ],
};
