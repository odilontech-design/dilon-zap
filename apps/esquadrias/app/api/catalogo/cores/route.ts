import { prisma } from "@dilon-zap/erp-db";
import { schemaCor } from "@/lib/schemas";
import { corpo, exigirPapel, ok, rota, usuarioDaApi } from "@/lib/api";

export const GET = rota(async () => {
  const usuario = await usuarioDaApi();
  return ok(await prisma.cor.findMany({ where: { empresaId: usuario.empresaId, ativa: true }, orderBy: { ordem: "asc" } }));
});


export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaCor);

  return ok(await prisma.cor.create({ data: { ...dados, empresaId: usuario.empresaId } }), 201);
});
