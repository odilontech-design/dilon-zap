import type { PlanoAssinatura } from "@dilon-zap/erp-db";

/**
 * Recursos por plano.
 *
 * O corte espelha o que o mercado já pratica (cadastro/orçamento no básico,
 * gestão no intermediário, produção no avançado) porque é o que a serralheria
 * reconhece na hora de comparar. A diferença é o que está no BÁSICO: aqui a
 * tipologia paramétrica e a relação de materiais entram desde o primeiro
 * plano — sem elas o orçamento vira digitação manual, e cobrar por isso é
 * cobrar pelo que o Excel já faz de graça.
 */
export type Recurso =
  | "ORCAMENTOS"
  | "CLIENTES"
  | "TIPOLOGIAS"
  | "MATERIAIS"
  | "OBRAS"
  | "CONTRATO"
  | "FINANCEIRO"
  | "AGENDA"
  | "RELATORIOS"
  | "METAS"
  | "USUARIOS_ILIMITADOS"
  | "PLANO_CORTE"
  | "ETIQUETAS"
  | "CHECKLIST_PRODUCAO"
  | "ORDEM_SERVICO"
  | "API_PUBLICA";

const BASICO: Recurso[] = ["ORCAMENTOS", "CLIENTES", "TIPOLOGIAS", "MATERIAIS", "OBRAS", "CONTRATO"];
const ESSENCIAL: Recurso[] = [...BASICO, "FINANCEIRO", "AGENDA", "RELATORIOS", "METAS", "USUARIOS_ILIMITADOS"];
const AVANCADO: Recurso[] = [...ESSENCIAL, "PLANO_CORTE", "ETIQUETAS", "CHECKLIST_PRODUCAO", "ORDEM_SERVICO", "API_PUBLICA"];

const RECURSOS: Record<PlanoAssinatura, Recurso[]> = {
  BASICO,
  ESSENCIAL,
  AVANCADO,
};

/** Teto de usuários por plano. `null` = sem limite. */
export const LIMITE_USUARIOS: Record<PlanoAssinatura, number | null> = {
  BASICO: 3,
  ESSENCIAL: null,
  AVANCADO: null,
};

export const NOME_PLANO: Record<PlanoAssinatura, string> = {
  BASICO: "Básico",
  ESSENCIAL: "Essencial",
  AVANCADO: "Avançado",
};

export function temRecurso(plano: PlanoAssinatura, recurso: Recurso): boolean {
  return RECURSOS[plano].includes(recurso);
}

/** Menor plano que libera o recurso — é o que a tela de bloqueio precisa dizer. */
export function planoMinimo(recurso: Recurso): PlanoAssinatura {
  if (temRecurso("BASICO", recurso)) return "BASICO";
  if (temRecurso("ESSENCIAL", recurso)) return "ESSENCIAL";
  return "AVANCADO";
}
