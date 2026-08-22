import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { recalcularOrcamento } from "@/lib/calculo";
import { registrar } from "@/lib/auditoria";

type Ctx = { params: { id: string } };

export const GET = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();

  const orcamento = await prisma.orcamento.findFirst({
    where: { id: params.id, empresaId: usuario.empresaId },
    include: {
      cliente: true,
      vendedor: { select: { id: true, nome: true } },
      itens: { include: { tipologia: { select: { nome: true, desenhoSvg: true } }, corAluminio: true, corFerragem: true }, orderBy: { ordem: "asc" } },
    },
  });
  if (!orcamento) throw new RespostaDeErro(404, "orçamento não encontrado");

  return ok(orcamento);
});

const schema = z.object({
  titulo: z.string().trim().min(2).max(120).optional(),
  clienteId: z.string().trim().nullish(),
  condicoes: z.string().trim().max(4000).nullish(),
  observacoes: z.string().trim().max(4000).nullish(),
  descontoPercent: z.number().min(0).max(100).optional(),
  descontoCentavos: z.number().int().min(0).optional(),
  freteCentavos: z.number().int().min(0).optional(),
  validoAte: z.string().datetime().nullish(),
});

export const PATCH = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schema);

  const atual = await prisma.orcamento.findFirst({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (!atual) throw new RespostaDeErro(404, "orçamento não encontrado");
  if (atual.status === "APROVADO") throw new RespostaDeErro(409, "orçamento aprovado não pode ser alterado");

  await prisma.orcamento.update({
    where: { id: params.id },
    data: { ...dados, validoAte: dados.validoAte ? new Date(dados.validoAte) : dados.validoAte },
  });

  // Desconto e frete mudam o total: recalcula sempre, em vez de confiar na
  // tela ter mandado os totais certos junto.
  const recalculado = await recalcularOrcamento(params.id, usuario.empresaId);
  return ok(recalculado);
});

export const DELETE = rota<Ctx>(async (_req, { params }) => {
  const usuario = await usuarioDaApi();

  const atual = await prisma.orcamento.findFirst({ where: { id: params.id, empresaId: usuario.empresaId } });
  if (!atual) throw new RespostaDeErro(404, "orçamento não encontrado");
  if (atual.status === "APROVADO") throw new RespostaDeErro(409, "orçamento aprovado vira obra e não pode ser excluído");

  await prisma.orcamento.delete({ where: { id: params.id } });
  await registrar(usuario, "orcamento.excluido", { entidade: "Orcamento", entidadeId: params.id, detalhe: { numero: atual.numero } });

  return ok({ ok: true });
});
