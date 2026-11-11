import type { Plano } from "@dilon-zap/ponto-db";

/**
 * Limites e recursos de cada plano. É o ÚNICO lugar com essas regras: as
 * telas leem daqui para mostrar o limite, e as ações do servidor leem daqui
 * para barrar. Esconder um botão não é controle de acesso.
 *
 * Preços: docs/ponto-rh/plano-comercial.md, seção 5.
 */

export type Recurso =
  | "REGISTRO_APP_WEB"
  | "REGISTRO_COM_FOTO"
  | "GEOLOCALIZACAO"
  | "ESPELHO"
  | "AJUSTES_MANUAIS"
  | "RELATORIOS"
  | "RECONHECIMENTO_FACIAL"
  | "CERCA_VIRTUAL"
  | "QUIOSQUE"
  | "WHATSAPP"
  | "SOLICITACOES"
  | "ASSINATURA_ESPELHO"
  | "EXPORTACAO_FOLHA";

export interface DefinicaoPlano {
  nome: string;
  /** null = sem limite */
  maxColaboradores: number | null;
  maxJornadas: number | null;
  maxCnpjs: number;
  precoDescricao: string;
  /** Mensalidade fixa cobrada por boleto. null = preço por colaborador, cobrado à parte. */
  precoMensalCentavos: number | null;
  recursos: Recurso[];
}

const ESSENCIAL: Recurso[] = [
  "REGISTRO_APP_WEB",
  "REGISTRO_COM_FOTO",
  "GEOLOCALIZACAO",
  "ESPELHO",
  "AJUSTES_MANUAIS",
  "RELATORIOS",
];
const PONTO: Recurso[] = [
  ...ESSENCIAL,
  "RECONHECIMENTO_FACIAL",
  "CERCA_VIRTUAL",
  "QUIOSQUE",
  "WHATSAPP",
  "SOLICITACOES",
  "ASSINATURA_ESPELHO",
  "EXPORTACAO_FOLHA",
];

export const PLANOS: Record<Plano, DefinicaoPlano> = {
  ESSENCIAL: {
    nome: "Essencial",
    maxColaboradores: 10,
    maxJornadas: 2,
    maxCnpjs: 1,
    precoDescricao: "R$ 59,90/mês, de 1 a 10 colaboradores",
    precoMensalCentavos: 5990,
    recursos: ESSENCIAL,
  },
  PONTO: {
    nome: "Ponto",
    maxColaboradores: null,
    maxJornadas: null,
    maxCnpjs: 1,
    precoDescricao: "R$ 9 por colaborador/mês (mínimo R$ 99)",
    precoMensalCentavos: null,
    recursos: PONTO,
  },
  PONTO_DP: {
    nome: "Ponto + DP",
    maxColaboradores: null,
    maxJornadas: null,
    maxCnpjs: 3,
    precoDescricao: "R$ 14 por colaborador/mês (mínimo R$ 249)",
    precoMensalCentavos: null,
    recursos: PONTO,
  },
  RH_COMPLETO: {
    nome: "RH Completo",
    maxColaboradores: null,
    maxJornadas: null,
    maxCnpjs: 10,
    precoDescricao: "R$ 19 por colaborador/mês (mínimo R$ 399)",
    precoMensalCentavos: null,
    recursos: PONTO,
  },
};

export function temRecurso(plano: Plano, recurso: Recurso): boolean {
  return PLANOS[plano].recursos.includes(recurso);
}

export function cabeMais(limite: number | null, emUso: number): boolean {
  return limite == null || emUso < limite;
}
