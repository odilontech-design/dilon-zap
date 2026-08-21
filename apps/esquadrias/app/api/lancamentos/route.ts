import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirRecurso, ok, rota, usuarioDaApi } from "@/lib/api";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "FINANCEIRO");

  const params = new URL(req.url).searchParams;
  const de = params.get("de");
  const ate = params.get("ate");
  const tipo = params.get("tipo");
  const status = params.get("status");

  return ok(
    await prisma.lancamento.findMany({
      where: {
        empresaId: usuario.empresaId,
        ...(tipo ? { tipo: tipo as never } : {}),
        ...(status ? { status: status as never } : {}),
        ...(de || ate ? { vencimento: { ...(de ? { gte: new Date(de) } : {}), ...(ate ? { lte: new Date(ate) } : {}) } } : {}),
      },
      include: { cliente: { select: { nome: true } }, fornecedor: { select: { nome: true } }, obra: { select: { titulo: true } } },
      orderBy: { vencimento: "asc" },
      take: 500,
    }),
  );
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirRecurso(usuario, "FINANCEIRO");

  const dados = await corpo(
    req,
    z.object({
      tipo: z.enum(["RECEITA", "DESPESA"]),
      descricao: z.string().trim().min(2).max(160),
      categoria: z.string().trim().max(60).nullish(),
      valorCentavos: z.number().int().min(1),
      vencimento: z.string().datetime(),
      clienteId: z.string().trim().nullish(),
      fornecedorId: z.string().trim().nullish(),
      obraId: z.string().trim().nullish(),
    }),
  );

  return ok(
    await prisma.lancamento.create({
      data: { ...dados, empresaId: usuario.empresaId, vencimento: new Date(dados.vencimento) },
    }),
    201,
  );
});
