import { prisma } from "@dilon-zap/erp-db";
import { schemaPerfil } from "@/lib/schemas";
import { corpo, exigirPapel, ok, rota, usuarioDaApi } from "@/lib/api";
import { registrar } from "@/lib/auditoria";

export const GET = rota(async (req) => {
  const usuario = await usuarioDaApi();
  const incluirInativos = new URL(req.url).searchParams.get("inativos") === "1";

  return ok(
    await prisma.perfil.findMany({
      where: { empresaId: usuario.empresaId, ...(incluirInativos ? {} : { ativo: true }) },
      include: { linha: { select: { id: true, nome: true } } },
      orderBy: { codigo: "asc" },
    }),
  );
});


export const POST = rota(async (req) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaPerfil);

  const criado = await prisma.perfil.create({ data: { ...dados, empresaId: usuario.empresaId } });
  await registrar(usuario, "perfil.criado", { entidade: "Perfil", entidadeId: criado.id, detalhe: { codigo: criado.codigo } });

  return ok(criado, 201);
});
