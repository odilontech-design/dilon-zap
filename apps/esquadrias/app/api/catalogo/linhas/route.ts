import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi } from "@/lib/api";

export const GET = rota(async () => {
  const usuario = await usuarioDaApi();
  return ok(
    await prisma.linhaPerfil.findMany({
      where: { empresaId: usuario.empresaId, ativa: true },
      include: { _count: { select: { perfis: true, tipologias: true } } },
      orderBy: { nome: "asc" },
    }),
  );
});

export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, z.object({ nome: z.string().trim().min(2).max(80), descricao: z.string().trim().max(200).nullish() }));

  return ok(await prisma.linhaPerfil.create({ data: { ...dados, empresaId: usuario.empresaId } }), 201);
});
