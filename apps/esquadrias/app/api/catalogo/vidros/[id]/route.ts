import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { schemaVidro } from "@/lib/schemas";

type Ctx = { params: { id: string } };

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaVidro.partial());

  const { count } = await prisma.vidro.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: dados });
  if (count === 0) throw new RespostaDeErro(404, "vidro não encontrado");

  return ok(await prisma.vidro.findUnique({ where: { id: params.id } }));
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  const emUso = await prisma.tipologiaVidro.count({ where: { vidroId: params.id } });
  if (emUso > 0) {
    await prisma.vidro.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: { ativo: false } });
    return ok({ ok: true, desativado: true, tipologias: emUso });
  }

  const { count } = await prisma.vidro.deleteMany({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (count === 0) throw new RespostaDeErro(404, "vidro não encontrado");

  return ok({ ok: true });
});
