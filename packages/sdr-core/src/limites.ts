/** Limites do SDR num lugar só, para o site, o worker e os testes concordarem. */
export const LIMITES = {
  /** Tamanho máximo do arquivo CSV, em bytes. */
  arquivoBytes: 5 * 1024 * 1024,
  linhasMaximas: 20_000,
  colunasMaximas: 60,
  /** Linhas processadas por lote (e, entre lotes, a reserva do trabalho é renovada). */
  loteDeLinhas: 100,
  /** Linhas por execução do worker. Passando disso, o trabalho volta à fila e o worker atende outros. */
  linhasPorExecucao: 5_000,
  /** Quanto tempo vale a reserva de um trabalho sem ser renovada. */
  reservaMs: 120_000,
  tentativasDoTrabalho: 3,
  tentativasDaLinha: 3,
  supressoesPorEmpresa: 5_000,
  tamanhoDaPagina: 25,
  /** Pontuação mínima para qualificar quando os critérios obrigatórios estão atendidos. */
  limiarDeQualificacao: 60,
  /** Empresas por associação em massa a uma campanha. */
  empresasPorAssociacao: 2_000,
} as const;

/** Espera antes de tentar de novo um trabalho que falhou: 30 s, 1 min, 2 min... */
export function esperaEntreTentativasMs(tentativas: number): number {
  return 30_000 * 2 ** Math.max(0, tentativas - 1);
}
