import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { recalcularOrcamento } from "@/lib/calculo";
import { schemaItemOrcamento } from "@/lib/schemas";
import { validarMedidas } from "@/lib/tipologias";

type Ctx = { params: { id: string } };

export const POST = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schemaItemOrcamento);

  const orcamento = await prisma.orcamento.findFirst({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (!orcamento) throw new RespostaDeErro(404, "orçamento não encontrado");
  if (orcamento.status === "APROVADO") throw new RespostaDeErro(409, "orçamento aprovado não aceita novos itens");

  const tipologia = await validarMedidas(dados.tipologiaId, usuario.empresaId, dados.larguraMm, dados.alturaMm);

  const ultimo = await prisma.orcamentoItem.aggregate({ where: { orcamentoId: params.id }, _max: { ordem: true } });

  await prisma.orcamentoItem.create({
    data: {
      ...dados,
      descricao: dados.descricao || tipologia.nome,
      orcamentoId: params.id,
      parametros: (dados.parametros ?? undefined) as never,
      ordem: (ultimo._max.ordem ?? -1) + 1,
    },
  });

  const recalculado = await recalcularOrcamento(params.id, usuario.empresaId);
  return ok(recalculado, 201);
});
