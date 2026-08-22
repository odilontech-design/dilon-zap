import { prisma } from "@dilon-zap/erp-db";
import { corpo, exigirPapel, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { schemaCor } from "@/lib/schemas";

type Ctx = { params: { id: string } };

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);
  const dados = await corpo(req, schemaCor.partial());

  const { count } = await prisma.cor.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: dados });
  if (count === 0) throw new RespostaDeErro(404, "cor não encontrada");

  return ok(await prisma.cor.findUnique({ where: { id: params.id } }));
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  exigirPapel(usuario, ["OWNER", "GERENTE"]);

  // Cor sempre desativa em vez de apagar: itens de orçamento antigos apontam
  // pra ela, e a proposta impressa precisa continuar dizendo "preto".
  const { count } = await prisma.cor.updateMany({ where: { id: params.id, empresaId: usuario.empresaId }, data: { ativa: false } });
  if (count === 0) throw new RespostaDeErro(404, "cor não encontrada");

  return ok({ ok: true, desativado: true });
});
