import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirRecurso, ok, rota, usuarioDaApi } from "@/lib/api";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "AGENDA");

  const params = new URL(req.url).searchParams;
  const de = params.get("de");
  const ate = params.get("ate");

  return ok(
    await prisma.compromisso.findMany({
      where: {
        empresaId: usuario.empresaId,
        ...(de || ate ? { inicio: { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate) } : {}) } } : {}),
      },
      include: {
        cliente: { select: { nome: true, telefone: true } },
        obra: { select: { titulo: true } },
        responsavel: { select: { nome: true } },
      },
      orderBy: { inicio: "asc" },
      take: 300,
    }),
  );
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "AGENDA");

  const dados = await corpo(
    req,
    z.object({
      tipo: z.enum(["MEDICAO", "VISITA", "INSTALACAO", "ENTREGA", "MANUTENCAO", "OUTRO"]).default("VISITA"),
      titulo: z.string().trim().min(2).max(160),
      descricao: z.string().trim().max(2000).nullish(),
      inicio: z.string().datetime(),
      fim: z.string().datetime().nullish(),
      clienteId: z.string().trim().nullish(),
      obraId: z.string().trim().nullish(),
      responsavelId: z.string().trim().nullish(),
    }),
  );

  return ok(
    await prisma.compromisso.create({
      data: {
        ...dados,
        empresaId: usuario.empresaId,
        inicio: new Date(dados.inicio),
        fim: dados.fim ? new Date(dados.fim) : null,
        responsavelId: dados.responsavelId || usuario.id,
      },
    }),
    201,
  );
});
