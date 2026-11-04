import { prisma, Prisma } from "@dilon-zap/db";
import type { CriarCampanha, CriarPerfil, EditarCampanha, EditarPerfil } from "./esquemas";

/**
 * Único acesso às tabelas do SDR. Nasce preso a um tenant: nenhum método recebe
 * tenantId, então uma rota não tem como esquecer o filtro nem passar o errado.
 */

export class ErroSdr extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type Autor = { id: string; name: string };

const nomeRepetido = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export function repositorioSdr(tenantId: string) {
  if (!tenantId) throw new Error("repositório do SDR sem tenant");

  const obterPerfil = (id: string) => prisma.sdrIcp.findFirst({ where: { id, tenantId } });
  const obterCampanha = (id: string) =>
    prisma.sdrCampanha.findFirst({ where: { id, tenantId }, include: { icp: { select: { id: true, nome: true } } } });

  async function exigirPerfil(id: string) {
    if (!(await obterPerfil(id))) throw new ErroSdr("perfil de cliente não encontrado", 400);
  }

  return {
    listarPerfis: () =>
      prisma.sdrIcp.findMany({
        where: { tenantId },
        orderBy: { nome: "asc" },
        include: { _count: { select: { campanhas: true } } },
      }),

    obterPerfil,

    async criarPerfil(d: CriarPerfil, autor: Autor) {
      try {
        return await prisma.sdrIcp.create({
          data: { ...d, tenantId, criterios: d.criterios as Prisma.InputJsonValue, criadoPorId: autor.id, criadoPorNome: autor.name },
        });
      } catch (e) {
        if (nomeRepetido(e)) throw new ErroSdr("já existe um perfil com esse nome", 409);
        throw e;
      }
    },

    async editarPerfil(id: string, d: EditarPerfil) {
      try {
        const { count } = await prisma.sdrIcp.updateMany({
          where: { id, tenantId },
          data: { ...d, ...(d.criterios ? { criterios: d.criterios as Prisma.InputJsonValue } : {}) },
        });
        if (count === 0) throw new ErroSdr("perfil de cliente não encontrado", 404);
      } catch (e) {
        if (nomeRepetido(e)) throw new ErroSdr("já existe um perfil com esse nome", 409);
        throw e;
      }
      return obterPerfil(id);
    },

    async excluirPerfil(id: string) {
      if (await prisma.sdrCampanha.count({ where: { tenantId, icpId: id } })) {
        throw new ErroSdr("este perfil está em uso por uma campanha", 409);
      }
      const { count } = await prisma.sdrIcp.deleteMany({ where: { id, tenantId } });
      if (count === 0) throw new ErroSdr("perfil de cliente não encontrado", 404);
    },

    listarCampanhas: () =>
      prisma.sdrCampanha.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        include: { icp: { select: { id: true, nome: true } } },
      }),

    obterCampanha,

    async criarCampanha(d: CriarCampanha, autor: Autor) {
      await exigirPerfil(d.icpId);
      try {
        const criada = await prisma.sdrCampanha.create({
          data: { ...d, tenantId, criadoPorId: autor.id, criadoPorNome: autor.name },
        });
        return obterCampanha(criada.id);
      } catch (e) {
        if (nomeRepetido(e)) throw new ErroSdr("já existe uma campanha com esse nome", 409);
        throw e;
      }
    },

    async editarCampanha(id: string, d: EditarCampanha) {
      if (d.icpId) await exigirPerfil(d.icpId);
      try {
        const { count } = await prisma.sdrCampanha.updateMany({ where: { id, tenantId }, data: d });
        if (count === 0) throw new ErroSdr("campanha não encontrada", 404);
      } catch (e) {
        if (nomeRepetido(e)) throw new ErroSdr("já existe uma campanha com esse nome", 409);
        throw e;
      }
      return obterCampanha(id);
    },

    async excluirCampanha(id: string) {
      const { count } = await prisma.sdrCampanha.deleteMany({ where: { id, tenantId } });
      if (count === 0) throw new ErroSdr("campanha não encontrada", 404);
    },
  };
}
