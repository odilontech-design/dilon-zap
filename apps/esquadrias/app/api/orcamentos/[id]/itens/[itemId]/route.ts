import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { recalcularOrcamento } from "@/lib/calculo";
import { schemaItemOrcamento } from "@/lib/schemas";
import { validarMedidas } from "@/lib/tipologias";

type Ctx = { params: { id: string; itemId: string } };

async function orcamentoEditavel(id: string, empresaId: string) {
  const orcamento = await prisma.orcamento.findFirst({ where: { id, empresaId } });
  if (!orcamento) throw new RespostaDeErro(404, "orçamento não encontrado");
  if (orcamento.status === "APROVADO") throw new RespostaDeErro(409, "orçamento aprovado não pode ser alterado");
  return orcamento;
}

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  await orcamentoEditavel(params.id, usuario.empresaId);

  const dados = await corpo(req, schemaItemOrcamento.partial());

  const item = await prisma.orcamentoItem.findFirst({ where: { id: params.itemId, orcamentoId: params.id } });
  if (!item) throw new RespostaDeErro(404, "item não encontrado");

  const largura = dados.larguraMm ?? item.larguraMm;
  const altura = dados.alturaMm ?? item.alturaMm;
  const tipologiaId = dados.tipologiaId ?? item.tipologiaId;
  if (tipologiaId) await validarMedidas(tipologiaId, usuario.empresaId, largura, altura);

  await prisma.orcamentoItem.update({
    where: { id: params.itemId },
    data: { ...dados, parametros: (dados.parametros ?? undefined) as never },
  });

  return ok(await recalcularOrcamento(params.id, usuario.empresaId));
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();
  await orcamentoEditavel(params.id, usuario.empresaId);

  const { count } = await prisma.orcamentoItem.deleteMany({ where: { id: params.itemId, orcamentoId: params.id } });
  if (count === 0) throw new RespostaDeErro(404, "item não encontrado");

  return ok(await recalcularOrcamento(params.id, usuario.empresaId));
});
