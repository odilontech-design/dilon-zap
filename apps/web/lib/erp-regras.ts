/**
 * Regras do produto ERP Dilon Contabilidade dentro do Zap. Puro, sem banco e sem
 * rede: é o que os testes cobrem.
 */

export type ErpPlano = "ESSENCIAL" | "PROFISSIONAL" | "ESCRITORIO_PLUS" | "SOB_MEDIDA";

export const ERP_PLANOS: Record<ErpPlano, { nome: string; limiteEmpresas: number | null; limiteUsuarios: number | null; sugestaoMensalCents: number; resumo: string }> = {
  ESSENCIAL: { nome: "Essencial", limiteEmpresas: 30, limiteUsuarios: 3, sugestaoMensalCents: 29_700, resumo: "até 30 empresas-cliente · 3 usuários" },
  PROFISSIONAL: { nome: "Profissional", limiteEmpresas: 100, limiteUsuarios: 8, sugestaoMensalCents: 59_700, resumo: "até 100 empresas-cliente · 8 usuários" },
  ESCRITORIO_PLUS: { nome: "Escritório+", limiteEmpresas: 250, limiteUsuarios: 20, sugestaoMensalCents: 119_700, resumo: "até 250 empresas-cliente · 20 usuários" },
  SOB_MEDIDA: { nome: "Sob medida", limiteEmpresas: null, limiteUsuarios: null, sugestaoMensalCents: 0, resumo: "limites combinados caso a caso" },
};

export const PLANOS_ERP = Object.keys(ERP_PLANOS) as ErpPlano[];

/** Dias de atraso da fatura mais antiga em aberto que o ERP tolera antes de ser suspenso. */
export const TOLERANCIA_PADRAO_DIAS = 10;

export type AssinaturaParaErp = { status: "TRIAL" | "ACTIVE" | "PAUSED" | "CANCELED" } | null;
export type FaturaParaErp = { status: string; dueDate: Date | string };

export type DecisaoDeSuspensao = { suspender: false } | { suspender: true; motivo: string };

const DIA_MS = 86_400_000;

/**
 * Quando a cobrança manda suspender o ERP.
 *
 *  - Sem assinatura: nunca (empresa legada, sem cobrança cadastrada).
 *  - Cancelada ou pausada: sim.
 *  - Em teste: não — o teste do ERP segue o acordo com o cliente, e quem decide é uma pessoa.
 *  - Ativa: só se a fatura em aberto mais antiga passou da tolerância.
 *
 * Suspender nunca apaga nada no ERP: bloqueia o acesso, e reativar devolve tudo como estava.
 */
export function decidirSuspensao(assinatura: AssinaturaParaErp, faturas: FaturaParaErp[], agora: Date, toleranciaDias = TOLERANCIA_PADRAO_DIAS): DecisaoDeSuspensao {
  if (!assinatura) return { suspender: false };
  if (assinatura.status === "CANCELED") return { suspender: true, motivo: "Assinatura cancelada" };
  if (assinatura.status === "PAUSED") return { suspender: true, motivo: "Assinatura pausada" };
  if (assinatura.status !== "ACTIVE") return { suspender: false };

  const vencimentos = faturas.filter((f) => f.status === "PENDING" || f.status === "OVERDUE").map((f) => new Date(f.dueDate).getTime());
  if (vencimentos.length === 0) return { suspender: false };
  const atraso = Math.floor((agora.getTime() - Math.min(...vencimentos)) / DIA_MS);
  return atraso > toleranciaDias ? { suspender: true, motivo: `Fatura vencida há ${atraso} dias` } : { suspender: false };
}

export type SituacaoLocal = { status: "ATIVO" | "SUSPENSO"; suspensoPor: "AUTO" | "MANUAL" | null };

/**
 * O que fazer para a situação do ERP bater com a cobrança.
 *  - Deve estar suspenso e está ativo → suspender (auto).
 *  - Pode estar ativo e foi suspenso AUTOMATICAMENTE → reativar. Suspensão manual não se desfaz sozinha.
 */
export function acaoDeSincronizacao(local: SituacaoLocal, decisao: DecisaoDeSuspensao): "SUSPENDER" | "REATIVAR" | "NADA" {
  if (decisao.suspender) return local.status === "ATIVO" ? "SUSPENDER" : "NADA";
  return local.status === "SUSPENSO" && local.suspensoPor === "AUTO" ? "REATIVAR" : "NADA";
}

/** Novo total da assinatura quando a parte do ERP muda: troca só o que era do ERP, preservando o resto. */
export function novoTotalDaAssinatura(totalAtualCents: number, erpAntesCents: number, erpDepoisCents: number): number {
  return Math.max(0, totalAtualCents - erpAntesCents + erpDepoisCents);
}

/** "1.234,56" ou "1234.56" ou "1234" → centavos; null se inválido ou negativo. */
export function reaisParaCentavos(texto: string): number | null {
  const t = texto.trim().replace(/[R$\s]/g, "");
  if (!t) return null;
  const normal = /,/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t;
  if (!/^\d+(\.\d{1,2})?$/.test(normal)) return null;
  const c = Math.round(parseFloat(normal) * 100);
  return Number.isFinite(c) && c >= 0 && c <= 2_000_000_000 ? c : null;
}
