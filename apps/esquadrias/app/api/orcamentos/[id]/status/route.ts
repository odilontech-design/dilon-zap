import { z } from "zod";
import { prisma } from "@dilon-zap/erp-db";
import { corpo, ok, rota, usuarioDaApi, RespostaDeErro } from "@/lib/api";
import { recalcularOrcamento } from "@/lib/calculo";
import { registrar } from "@/lib/auditoria";
import { temRecurso } from "@/lib/planos";

type Ctx = { params: { id: string } };

const schema = z.object({
  status: z.enum(["RASCUNHO", "ENVIADO", "APROVADO", "REPROVADO", "EXPIRADO"]),
  /** Só na aprovação: gera as parcelas do contas a receber. */
  parcelas: z.number().int().min(1).max(36).default(1),
  primeiroVencimento: z.string().datetime().optional(),
});

/**
 * Muda o status e, na aprovação, materializa o que vem depois da venda.
 *
 * Aprovar não é só trocar uma coluna: é o momento em que o orçamento vira
 * obra (produção precisa saber que existe) e vira contas a receber (o
 * financeiro precisa cobrar). Fazer isso em três telas separadas é como o
 * dado se perde — a obra existe, mas ninguém lançou a receita.
 */
export const POST = rota<Ctx>(async (req, { params }) => {
  const usuario = await usuarioDaApi();
  const dados = await corpo(req, schema);

  const orcamento = await prisma.orcamento.findFirst({
    where: { id: params.id, empresaId: usuario.empresaId },
    include: { itens: { select: { id: true } }, obra: true },
  });
  if (!orcamento) throw new RespostaDeErro(404, "orçamento não encontrado");

  if (dados.status === "APROVADO") {
    if (orcamento.status === "APROVADO") throw new RespostaDeErro(409, "orçamento já está aprovado");
    if (orcamento.itens.length === 0) throw new RespostaDeErro(400, "não dá para aprovar um orçamento sem itens");

    // Recalcula ANTES de congelar: a partir daqui o orçamento é documento e
    // nunca mais é recalculado.
    const recalculado = await recalcularOrcamento(params.id, usuario.empresaId);
    const total = recalculado?.totalCentavos ?? orcamento.totalCentavos;

    await prisma.$transaction(async (tx) => {
      await tx.orcamento.update({
        where: { id: params.id },
        data: { status: "APROVADO", aprovadoEm: new Date() },
      });

      await tx.obra.create({
        data: {
          empresaId: usuario.empresaId,
          orcamentoId: params.id,
          clienteId: orcamento.clienteId,
          responsavelId: usuario.id,
          titulo: `${orcamento.titulo} #${orcamento.numero}`,
          valorCentavos: total,
        },
      });

      // O financeiro só existe do ESSENCIAL pra cima; no BÁSICO a obra é
      // criada mesmo assim, e a serralheria cobra por fora. Criar lançamento
      // que a empresa não consegue abrir seria pior do que não criar.
      if (temRecurso(usuario.plano, "FINANCEIRO")) {
        const base = dados.primeiroVencimento ? new Date(dados.primeiroVencimento) : new Date();
        // A última parcela absorve o resto da divisão: 3 parcelas de R$ 100,00
        // sobre R$ 301,00 fecham em 301,00, não em 300,99.
        const valorParcela = Math.floor(total / dados.parcelas);
        const resto = total - valorParcela * dados.parcelas;

        await tx.lancamento.createMany({
          data: Array.from({ length: dados.parcelas }, (_, i) => {
            const vencimento = new Date(base);
            vencimento.setMonth(vencimento.getMonth() + i);
            return {
              empresaId: usuario.empresaId,
              tipo: "RECEITA" as const,
              descricao: `${orcamento.titulo} #${orcamento.numero}`,
              categoria: "Venda",
              valorCentavos: i === dados.parcelas - 1 ? valorParcela + resto : valorParcela,
              vencimento,
              clienteId: orcamento.clienteId,
              parcela: i + 1,
              totalParcelas: dados.parcelas,
            };
          }),
        });
      }
    });

    await registrar(usuario, "orcamento.aprovado", {
      entidade: "Orcamento",
      entidadeId: params.id,
      detalhe: { numero: orcamento.numero, totalCentavos: total, parcelas: dados.parcelas },
    });

    return ok({ ok: true, status: "APROVADO" });
  }

  if (orcamento.status === "APROVADO") {
    throw new RespostaDeErro(409, "orçamento aprovado já virou obra — cancele a obra antes de mudar o status");
  }

  await prisma.orcamento.update({ where: { id: params.id }, data: { status: dados.status } });
  await registrar(usuario, `orcamento.${dados.status.toLowerCase()}`, { entidade: "Orcamento", entidadeId: params.id });

  return ok({ ok: true, status: dados.status });
});
