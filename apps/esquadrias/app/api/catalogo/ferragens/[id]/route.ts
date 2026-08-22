import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { schemaFerragem } from "@/lib/schemas";

type Ctx = { params: { id: string } };

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaFerragem.partial());

  const { count } = await prisma.ferragem.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: dados });
  if (count === 0) throw new RespostaDeErro(404, "ferragem não encontrada");

  return ok(await prisma.ferragem.findUnique({ where: { id: params.id } }));
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const emUso = await prisma.tipologiaFerragem.count({ where: { ferragemId: params.id } });
  if (emUso > 0) {
    await prisma.ferragem.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: { ativo: false } });
    return ok({ ok: true, desativado: true, tipologias: emUso });
  }

  const { count } = await prisma.ferragem.deleteMany({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (count === 0) throw new RespostaDeErro(404, "ferragem não encontrada");

  return ok({ ok: true });
});
