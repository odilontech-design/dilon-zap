import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { cancelarContaPagar } from "@/lib/contas-pagar";
import { ErroDeVeiculo, registrarEvento } from "@/lib/veiculos";
import { ROTULO_CUSTO, type TipoCusto } from "@/lib/veiculos-regras";
import { SEM_PERMISSAO, respostaDeErro } from "@/lib/veiculos-api";

/**
 * Tira um custo lançado errado. A conta a pagar que nasceu junto é cancelada;
 * se ela já tem pagamento, nada muda: o dinheiro saiu, e desfazer isso é no
 * Financeiro (estornar), não aqui.
 */
export async function DELETE(_req: Request, { params }: { params: { id: string; custoId: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  try {
    await prisma.$transaction(async (tx) => {
      const c = await tx.custoVeiculo.findFirst({
        where: { id: params.custoId, veiculoId: params.id, tenantId: user.tenantId },
        select: { id: true, tipo: true, valorCents: true, contaPagarId: true, contaPagar: { select: { canceladaEm: true } } },
      });
      if (!c) throw new ErroDeVeiculo("custo não encontrado", 404);
      if (c.contaPagarId && !c.contaPagar?.canceladaEm) await cancelarContaPagar(tx, { tenantId: user.tenantId, contaId: c.contaPagarId });
      await tx.custoVeiculo.delete({ where: { id: c.id } });
      const valor = (c.valorCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      await registrarEvento(tx, params.id, "custo", `Custo removido: ${ROTULO_CUSTO[c.tipo as TipoCusto]} ${valor}`, user.id);
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDeErro(e);
  }
}
