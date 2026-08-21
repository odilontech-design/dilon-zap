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
