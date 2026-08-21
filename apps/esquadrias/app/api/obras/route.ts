import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi } from "@/lib/api";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const status = new URL(req.url).searchParams.get("status");

  return ok(
    await prisma.obra.findMany({
      where: { empresaId: usuario.empresaId, ...(status ? { status: status as never } : {}) },
      include: {
        cliente: { select: { id: true, nome: true, telefone: true } },
        responsavel: { select: { id: true, nome: true } },
        orcamento: { select: { id: true, numero: true } },
      },
      orderBy: [{ status: "asc" }, { criadoEm: "desc" }],
      take: 200,
    }),
  );
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(
    req,
    z.object({
      titulo: z.string().trim().min(2).max(160),
      clienteId: z.string().trim().nullish(),
      endereco: z.string().trim().max(200).nullish(),
      cidade: z.string().trim().max(80).nullish(),
      valorCentavos: z.number().int().min(0).default(0),
    }),
  );

  return ok(await prisma.obra.create({ data: { ...dados, empresaId: usuario.empresaId, responsavelId: usuario.id } }), 201);
});
