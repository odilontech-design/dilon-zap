import { prisma } from "@dilon-zap/erp-db";
import { schemaFerragem } from "@/lib/schemas";
import { corpo, exigirPapel, ok, rota, usuarioDaApi } from "@/lib/api";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const incluirInativos = new URL(req.url).searchParams.get("inativos") === "1";

  return ok(
    await prisma.ferragem.findMany({
      where: { empresaId: usuario.empresaId, ...(incluirInativos ? {} : { ativo: true }) },
      orderBy: { nome: "asc" },
    }),
  );
});


export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaFerragem);

  return ok(await prisma.ferragem.create({ data: { ...dados, empresaId: usuario.empresaId } }), 201);
});
