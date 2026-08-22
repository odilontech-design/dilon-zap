import { prisma } from "@dilon-zap/erp-db";
import type { Opcoes } from "./editor-tipologia";

/** Insumos disponíveis pro editor de tipologia — sempre os ATIVOS da empresa. */
export async function carregarOpcoes(empresaId: string): Promise<Opcoes> {
  const [perfis, vidros, ferragens, linhas] = await Promise.all([
    prisma.perfil.findMany({
      where: { empresaId, ativo: true },
      select: { id: true, codigo: true, nome: true, comprimentoBarraMm: true },
      orderBy: { codigo: "asc" },
    }),
    prisma.vidro.findMany({ where: { empresaId, ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
    prisma.ferragem.findMany({ where: { empresaId, ativo: true }, select: { id: true, nome: true, unidade: true }, orderBy: { nome: "asc" } }),
    prisma.linhaPerfil.findMany({ where: { empresaId, ativa: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  return { perfis, vidros, ferragens, linhas };
}
