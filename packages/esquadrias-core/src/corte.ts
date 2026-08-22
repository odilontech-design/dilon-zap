import type { PecaExpandida } from "./tipologia";

/**
 * Plano de corte (otimização de barras).
 *
 * Alumínio é comprado em barra inteira (6m, quase sempre) e cortado em peças.
 * Encaixar bem as peças na barra é dinheiro direto: numa obra de 40 janelas,
 * a diferença entre um encaixe ingênuo e um bom é uma dezena de barras.
 *
 * O problema é o cutting stock 1D, NP-difícil. Não vale resolver no ótimo:
 * rodamos duas heurísticas gulosas clássicas (First-Fit e Best-Fit, ambas
 * com as peças em ordem decrescente) e ficamos com o melhor resultado. FFD
 * tem garantia de no máximo 11/9 do ótimo + 1 barra, o que na prática é
 * indistinguível do ótimo pra quem está comprando material — e roda em
 * milissegundos dentro de uma requisição HTTP.
 */

export type OpcoesCorte = {
  /**
   * Espessura do disco da serra. Cada corte VIRA PÓ nessa medida — ignorar
   * faz o plano prometer 4 peças de 1500mm numa barra de 6000mm que só
   * comporta 3 na bancada.
   */
  espessuraSerraMm: number;
  /**
   * Abaixo disso a sobra é sucata; acima, volta pro estoque de retalho. É
   * escolha da empresa (quem tem espaço guarda mais), por isso é parâmetro.
   */
  sobraMinimaAproveitavelMm: number;
};

export const OPCOES_CORTE_PADRAO: OpcoesCorte = {
  espessuraSerraMm: 3,
  sobraMinimaAproveitavelMm: 300,
};

export type PecaNaBarra = {
  descricao: string;
  comprimentoMm: number;
  corte: PecaExpandida["corte"];
  origem: string;
};

export type BarraCortada = {
  numero: number;
  comprimentoBarraMm: number;
  pecas: PecaNaBarra[];
  usadoMm: number;
  perdaSerraMm: number;
  sobraMm: number;
  sobraAproveitavel: boolean;
};

export type PlanoCortePerfil = {
  perfilId: string;
  perfilCodigo: string;
  perfilNome: string;
  comprimentoBarraMm: number;
  barras: BarraCortada[];
  totalBarras: number;
  totalPecas: number;
  aproveitamentoPercent: number;
  sobraAproveitavelMm: number;
  refugoMm: number;
  pesoBarrasKg: number;
  custoBarrasCentavos: number;
};

export type PlanoCorte = {
  perfis: PlanoCortePerfil[];
  totalBarras: number;
  aproveitamentoPercent: number;
  custoBarrasCentavos: number;
};

type PecaParaCortar = PecaNaBarra & { perfilId: string };

/** Peça de entrada do plano: a expansão dá quantidade agregada, aqui vira uma linha por corte. */
export type EntradaCorte = {
  perfilId: string;
  perfilCodigo: string;
  perfilNome: string;
  comprimentoBarraMm: number;
  pesoPorMetro: number;
  precoPorKgCentavos: number;
  pecas: PecaParaCortar[];
};

function empacotar(pecas: PecaParaCortar[], barraMm: number, opcoes: OpcoesCorte, estrategia: "first" | "best"): BarraCortada[] {
  const ordenadas = [...pecas].sort((a, b) => b.comprimentoMm - a.comprimentoMm);
  const barras: BarraCortada[] = [];

  for (const peca of ordenadas) {
    // Todo corte consome o disco, inclusive o que separa a última peça da
    // sobra — por isso o custo é uma serrada POR PEÇA, não por peça-1.
    const custoNaBarra = peca.comprimentoMm + opcoes.espessuraSerraMm;

    let alvo: BarraCortada | undefined;
    if (estrategia === "first") {
      alvo = barras.find((b) => b.sobraMm >= custoNaBarra);
    } else {
      // Best-Fit: a barra que fica com MENOS sobra. Junta os retalhos
      // pequenos em poucas barras em vez de espalhar sobra inútil por todas.
      for (const b of barras) {
        if (b.sobraMm >= custoNaBarra && (!alvo || b.sobraMm < alvo.sobraMm)) alvo = b;
      }
    }

    if (!alvo) {
      alvo = {
        numero: barras.length + 1,
        comprimentoBarraMm: barraMm,
        pecas: [],
        usadoMm: 0,
        perdaSerraMm: 0,
        sobraMm: barraMm,
        sobraAproveitavel: false,
      };
      barras.push(alvo);
    }

    alvo.pecas.push({ descricao: peca.descricao, comprimentoMm: peca.comprimentoMm, corte: peca.corte, origem: peca.origem });
    alvo.usadoMm += peca.comprimentoMm;
    alvo.perdaSerraMm += opcoes.espessuraSerraMm;
    alvo.sobraMm -= custoNaBarra;
  }

  for (const b of barras) b.sobraAproveitavel = b.sobraMm >= opcoes.sobraMinimaAproveitavelMm;
  return barras;
}

function sobraTotalAproveitavel(barras: BarraCortada[]): number {
  return barras.reduce((a, b) => a + (b.sobraAproveitavel ? b.sobraMm : 0), 0);
}

export function planejarCorte(entradas: EntradaCorte[], opcoes: OpcoesCorte = OPCOES_CORTE_PADRAO): PlanoCorte {
  const perfis: PlanoCortePerfil[] = [];

  for (const entrada of entradas) {
    const cabem = entrada.pecas.filter((p) => p.comprimentoMm > 0 && p.comprimentoMm <= entrada.comprimentoBarraMm);
    if (cabem.length === 0) continue;

    const ff = empacotar(cabem, entrada.comprimentoBarraMm, opcoes, "first");
    const bf = empacotar(cabem, entrada.comprimentoBarraMm, opcoes, "best");

    // Menos barras ganha sempre (é o que se paga). Empatou, fica com quem
    // deixou mais retalho reaproveitável — sobra de 800mm vira peça amanhã,
    // dez sobras de 80mm viram lixo.
    const barras =
      bf.length < ff.length ? bf : ff.length < bf.length ? ff : sobraTotalAproveitavel(bf) > sobraTotalAproveitavel(ff) ? bf : ff;

    const totalMm = barras.length * entrada.comprimentoBarraMm;
    const usadoMm = barras.reduce((a, b) => a + b.usadoMm, 0);
    const aproveitavel = sobraTotalAproveitavel(barras);
    const pesoBarrasKg = (totalMm / 1000) * entrada.pesoPorMetro;

    perfis.push({
      perfilId: entrada.perfilId,
      perfilCodigo: entrada.perfilCodigo,
      perfilNome: entrada.perfilNome,
      comprimentoBarraMm: entrada.comprimentoBarraMm,
      barras,
      totalBarras: barras.length,
      totalPecas: cabem.length,
      aproveitamentoPercent: totalMm > 0 ? Number(((usadoMm / totalMm) * 100).toFixed(2)) : 0,
      sobraAproveitavelMm: aproveitavel,
      refugoMm: totalMm - usadoMm - aproveitavel - barras.reduce((a, b) => a + b.perdaSerraMm, 0),
      pesoBarrasKg,
      custoBarrasCentavos: Math.round(pesoBarrasKg * entrada.precoPorKgCentavos),
    });
  }

  perfis.sort((a, b) => b.totalBarras - a.totalBarras || a.perfilCodigo.localeCompare(b.perfilCodigo));

  const totalMm = perfis.reduce((a, p) => a + p.totalBarras * p.comprimentoBarraMm, 0);
  const usadoMm = perfis.reduce((a, p) => a + p.barras.reduce((s, b) => s + b.usadoMm, 0), 0);

  return {
    perfis,
    totalBarras: perfis.reduce((a, p) => a + p.totalBarras, 0),
    aproveitamentoPercent: totalMm > 0 ? Number(((usadoMm / totalMm) * 100).toFixed(2)) : 0,
    custoBarrasCentavos: perfis.reduce((a, p) => a + p.custoBarrasCentavos, 0),
  };
}

/**
 * Converte as peças agregadas da expansão nas linhas individuais que o
 * empacotamento consome (12 peças de 1180mm viram 12 entradas).
 */
export function entradasDeCorte(pecas: PecaExpandida[], rotuloOrigem: (peca: PecaExpandida) => string = () => ""): EntradaCorte[] {
  const porPerfil = new Map<string, EntradaCorte>();

  for (const peca of pecas) {
    // A chave inclui o comprimento da barra: a mesma empresa pode comprar o
    // mesmo perfil em 6m e em 3m, e são estoques diferentes na hora de cortar.
    const chave = `${peca.perfilId}::${peca.comprimentoBarraMm}`;
    let entrada = porPerfil.get(chave);
    if (!entrada) {
      entrada = {
        perfilId: peca.perfilId,
        perfilCodigo: peca.perfilCodigo,
        perfilNome: peca.perfilNome,
        comprimentoBarraMm: peca.comprimentoBarraMm,
        pesoPorMetro: peca.pesoPorMetro,
        precoPorKgCentavos: peca.precoPorKgCentavos,
        pecas: [],
      };
      porPerfil.set(chave, entrada);
    }

    for (let i = 0; i < peca.quantidade; i++) {
      entrada.pecas.push({
        perfilId: peca.perfilId,
        descricao: peca.descricao,
        comprimentoMm: peca.comprimentoMm,
        corte: peca.corte,
        origem: rotuloOrigem(peca),
      });
    }
  }

  return [...porPerfil.values()];
}
