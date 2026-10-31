import { prisma } from "@dilon-zap/db";
import { ErroSdrCore } from "./erros";
import type { PerfilParaQualificar } from "./qualificacao";

/** Campanha e perfil (ICP) contra os quais as empresas são qualificadas. */
export type AlvoDeQualificacao = {
  campanhaId: string;
  campanhaNome: string;
  icpId: string;
  perfil: PerfilParaQualificar;
};

type CriterioBruto = { nome?: unknown; descricao?: unknown; peso?: unknown; obrigatorio?: unknown };

/** O JSON do perfil foi validado ao gravar, mas é lido com cautela: o que não bate com o formato é ignorado. */
export function criteriosDoPerfil(json: unknown): PerfilParaQualificar["criterios"] {
  if (!Array.isArray(json)) return [];
  return (json as CriterioBruto[])
    .filter((c) => typeof c?.nome === "string" && c.nome.trim() !== "")
    .map((c) => ({
      nome: String(c.nome),
      ...(typeof c.descricao === "string" ? { descricao: c.descricao } : {}),
      peso: Number.isInteger(c.peso) ? Math.min(10, Math.max(1, c.peso as number)) : 1,
      obrigatorio: c.obrigatorio === true,
    }));
}

/** Sempre com o tenant: campanha de outra empresa não existe para quem chama. */
export async function carregarAlvo(tenantId: string, campanhaId: string): Promise<AlvoDeQualificacao> {
  const campanha = await prisma.sdrCampanha.findFirst({
    where: { id: campanhaId, tenantId },
    select: {
      id: true,
      nome: true,
      icp: { select: { id: true, segmentos: true, cnaes: true, ufs: true, cidades: true, portes: true, criterios: true } },
    },
  });
  if (!campanha) throw new ErroSdrCore("campanha não encontrada", 404);
  const { icp } = campanha;
  return {
    campanhaId: campanha.id,
    campanhaNome: campanha.nome,
    icpId: icp.id,
    perfil: {
      segmentos: icp.segmentos,
      cnaes: icp.cnaes,
      ufs: icp.ufs,
      cidades: icp.cidades,
      portes: icp.portes,
      criterios: criteriosDoPerfil(icp.criterios),
    },
  };
}
