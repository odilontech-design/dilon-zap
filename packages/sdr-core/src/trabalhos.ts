import { ErroSdrCore } from "./erros";
import { concluir, devolver, falhar, falharEsgotados, reivindicar, renovarReserva } from "./fila";
import { descreverErro, marcarImportacaoFalhou, processarImportacao, type ContextoDeProcessamento } from "./importacao";
import { esperaEntreTentativasMs, LIMITES } from "./limites";
import { processarQualificacao } from "./prospectos";

/**
 * Um ciclo do worker: reivindica um trabalho, executa e registra o desfecho.
 * Vive aqui, e não no apps/sdr-worker, para os testes exercitarem o mesmo código.
 */

export type OpcoesDoCiclo = {
  workerId: string;
  reservaMs?: number;
  lote?: number;
  linhasPorExecucao?: number;
  /** Espera até a próxima tentativa de um trabalho que falhou. */
  esperaMs?: (tentativas: number) => number;
};

export type ResultadoDoCiclo = {
  trabalhoId: string;
  tenantId: string;
  tipo: string;
  tentativas: number;
  resultado: "concluido" | "devolvido" | "reagendado" | "falhou" | "perdido";
  processadas: number;
  erro?: string;
};

const idDaImportacao = (payload: unknown) => {
  const id = (payload as { importacaoId?: unknown } | null)?.importacaoId;
  return typeof id === "string" ? id : null;
};

export async function processarProximoTrabalho(opcoes: OpcoesDoCiclo): Promise<ResultadoDoCiclo | null> {
  // Trabalhos interrompidos que já esgotaram as tentativas: a importação deles não fica "processando".
  for (const esgotado of await falharEsgotados()) {
    const importacaoId = idDaImportacao(esgotado.payload);
    if (esgotado.tipo === "IMPORTAR" && importacaoId) {
      await marcarImportacaoFalhou(esgotado.tenantId, importacaoId, "o processamento foi interrompido várias vezes e parou");
    }
  }

  const reservaMs = opcoes.reservaMs ?? LIMITES.reservaMs;
  const trabalho = await reivindicar(opcoes.workerId, reservaMs);
  if (!trabalho) return null;

  const base = { trabalhoId: trabalho.id, tenantId: trabalho.tenantId, tipo: trabalho.tipo, tentativas: trabalho.tentativas };
  const ctx: ContextoDeProcessamento = {
    renovar: () => renovarReserva(trabalho.id, opcoes.workerId, reservaMs),
    lote: opcoes.lote,
    linhasPorExecucao: opcoes.linhasPorExecucao,
  };

  try {
    let r: { concluido: boolean; processadas: number };
    if (trabalho.tipo === "IMPORTAR") {
      const importacaoId = idDaImportacao(trabalho.payload);
      if (!importacaoId) throw new ErroSdrCore("trabalho de importação sem importação", 400);
      // O tenant do trabalho é o único tenant que o processamento enxerga.
      r = await processarImportacao(trabalho.tenantId, importacaoId, ctx);
    } else if (trabalho.tipo === "QUALIFICAR") {
      r = await processarQualificacao(trabalho.tenantId, trabalho.payload, ctx);
    } else {
      throw new ErroSdrCore(`tipo de trabalho desconhecido: ${String(trabalho.tipo).slice(0, 30)}`, 400);
    }

    if (!r.concluido) {
      const ok = await devolver(trabalho.id, opcoes.workerId);
      return { ...base, resultado: ok ? "devolvido" : "perdido", processadas: r.processadas };
    }
    const ok = await concluir(trabalho.id, opcoes.workerId);
    return { ...base, resultado: ok ? "concluido" : "perdido", processadas: r.processadas };
  } catch (e) {
    const erro = descreverErro(e);
    const espera = (opcoes.esperaMs ?? esperaEntreTentativasMs)(trabalho.tentativas);
    const estado = await falhar(trabalho.id, opcoes.workerId, erro, espera);
    if (estado === "FALHOU" && trabalho.tipo === "IMPORTAR") {
      const importacaoId = idDaImportacao(trabalho.payload);
      if (importacaoId) await marcarImportacaoFalhou(trabalho.tenantId, importacaoId, erro);
    }
    return {
      ...base,
      resultado: estado === "FALHOU" ? "falhou" : estado === "REAGENDADO" ? "reagendado" : "perdido",
      processadas: 0,
      erro,
    };
  }
}
