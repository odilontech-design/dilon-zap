/**
 * Quanto custa a IA: o preço de uma chamada (a partir do `usage` que a API
 * devolve) e a estimativa de custo por lead (conversa atendida), para a loja
 * escolher o modelo e para a Dilon Tech precificar o recurso.
 *
 * Puro, sem banco e sem rede: teste em custo.test-manual.ts.
 *
 * Preços em dólar por milhão de tokens (tabela da Anthropic, novembro de
 * 2026). US$ X por milhão de tokens = X milionésimos de dólar por token, por
 * isso o custo sai direto em "micro-dólares" multiplicando tokens × preço.
 */

export type PrecoModelo = {
  nome: string;
  entrada: number;
  saida: number;
  /** Leitura de cache. */
  cacheLeitura: number;
  /** Escrita de cache com validade de 5 minutos (1,25× a entrada). */
  cacheEscrita: number;
  /** O preço de leitura de cache ainda não foi conferido na tabela oficial. */
  aproximado?: boolean;
};

export const PRECOS: Record<string, PrecoModelo> = {
  "claude-opus-5-5": { nome: "Claude Opus 5.5", entrada: 4, saida: 20, cacheLeitura: 0.2, cacheEscrita: 5 },
  "claude-sonnet-5-5": { nome: "Claude Sonnet 5.5", entrada: 2, saida: 10, cacheLeitura: 0.1, cacheEscrita: 2.5 },
  // Até 100 mil tokens de prompt (o caso aqui). Leitura de cache a 0,1× pela
  // regra geral da API; conferir na página de preços antes de cobrar por ela.
  "claude-haiku-5-5": { nome: "Claude Haiku 5.5", entrada: 0.1, saida: 0.5, cacheLeitura: 0.01, cacheEscrita: 0.125, aproximado: true },
};

export const MODELO_PADRAO = "claude-opus-5-5";

export type Uso = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Custo de uma chamada em milionésimos de dólar, a partir do `usage` da resposta. */
export function custoMicros(uso: Uso, modelo: string): number {
  const p = PRECOS[modelo];
  if (!p) throw new Error(`modelo sem preço cadastrado: ${modelo}`);
  return Math.round(
    uso.input_tokens * p.entrada +
      (uso.cache_creation_input_tokens ?? 0) * p.cacheEscrita +
      (uso.cache_read_input_tokens ?? 0) * p.cacheLeitura +
      uso.output_tokens * p.saida
  );
}

/**
 * As premissas da estimativa, todas à vista para serem trocadas pelo que for
 * medido. Os padrões descrevem um lead típico de revenda pelo WhatsApp:
 * "ainda tem?", preço, fotos, troca, financiamento, visita.
 */
export type Premissas = {
  /** Quantas vezes a IA responde por lead. */
  respostasPorLead: number;
  /** Fração das respostas em que a IA consulta o estoque ou manda carro (uma ida e volta de ferramenta a mais). */
  fracaoComFerramenta: number;
  /** Instruções + ferramentas: o pedaço fixo do prompt, que fica em cache. */
  tokensFixos: number;
  /** Histórico médio da conversa enviado em cada chamada. */
  tokensHistorico: number;
  /** Resultado médio de uma ferramenta (lista de carros, ficha). */
  tokensResultadoFerramenta: number;
  /** Saída média de uma chamada que termina em resposta (texto + raciocínio curto no esforço "low"). */
  tokensSaidaResposta: number;
  /** Saída média de uma chamada que termina pedindo ferramenta. */
  tokensSaidaFerramenta: number;
  /**
   * Fração das respostas que encontram o prefixo fixo ainda em cache (o
   * cliente respondeu em menos de 5 minutos, ou outro lead da loja passou
   * por ali). 0 = pior caso, todo turno reescreve o cache.
   */
  acertoDeCacheEntreRespostas: number;
};

export const PREMISSAS_PADRAO: Premissas = {
  respostasPorLead: 6,
  fracaoComFerramenta: 0.6,
  tokensFixos: 2_500,
  tokensHistorico: 700,
  tokensResultadoFerramenta: 900,
  tokensSaidaResposta: 350,
  tokensSaidaFerramenta: 150,
  acertoDeCacheEntreRespostas: 0.5,
};

export type EstimativaLead = {
  modelo: string;
  /** Tokens somados de um lead, por tipo. */
  tokens: { entrada: number; cacheEscrita: number; cacheLeitura: number; saida: number };
  /** Dólares por lead. */
  usdPorLead: number;
};

/**
 * Custo estimado de um lead. Por resposta da IA:
 *
 *  - 1ª chamada: o prefixo fixo vem do cache (com a probabilidade de acerto)
 *    ou é escrito nele; o histórico é escrito no cache (o cache automático
 *    marca o fim do prompt), para a chamada seguinte do mesmo turno ler.
 *  - Se usou ferramenta, 2ª chamada: lê do cache tudo o que a 1ª mandou e
 *    paga como entrada nova o pedido de ferramenta e o resultado dela.
 */
export function estimarCustoPorLead(modelo: string, premissas: Partial<Premissas> = {}): EstimativaLead {
  const p = { ...PREMISSAS_PADRAO, ...premissas };
  const preco = PRECOS[modelo];
  if (!preco) throw new Error(`modelo sem preço cadastrado: ${modelo}`);

  const acerto = Math.min(Math.max(p.acertoDeCacheEntreRespostas, 0), 1);
  const f = Math.min(Math.max(p.fracaoComFerramenta, 0), 1);

  // Por resposta (valor esperado).
  const fixoLido = p.tokensFixos * acerto;
  const fixoEscrito = p.tokensFixos * (1 - acerto);
  const historicoEscrito = p.tokensHistorico;
  const saida1 = f * p.tokensSaidaFerramenta + (1 - f) * p.tokensSaidaResposta;
  // Segunda chamada, só quando houve ferramenta.
  const lido2 = f * (p.tokensFixos + p.tokensHistorico);
  const novo2 = f * (p.tokensSaidaFerramenta + p.tokensResultadoFerramenta);
  const saida2 = f * p.tokensSaidaResposta;

  const porResposta = {
    entrada: novo2,
    cacheEscrita: fixoEscrito + historicoEscrito,
    cacheLeitura: fixoLido + lido2,
    saida: saida1 + saida2,
  };
  const n = p.respostasPorLead;
  const tokens = {
    entrada: Math.round(porResposta.entrada * n),
    cacheEscrita: Math.round(porResposta.cacheEscrita * n),
    cacheLeitura: Math.round(porResposta.cacheLeitura * n),
    saida: Math.round(porResposta.saida * n),
  };
  const micros = custoMicros(
    { input_tokens: tokens.entrada, cache_creation_input_tokens: tokens.cacheEscrita, cache_read_input_tokens: tokens.cacheLeitura, output_tokens: tokens.saida },
    modelo
  );
  return { modelo, tokens, usdPorLead: micros / 1_000_000 };
}

/** Reais por mês para um volume de leads, com o câmbio informado. */
export function custoMensalReais(usdPorLead: number, leadsPorMes: number, cambio: number): number {
  return Math.round(usdPorLead * leadsPorMes * cambio * 100) / 100;
}
