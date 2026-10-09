import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro, parseDia } from "@/lib/guarda-financeiro";
import { cancelarParcela, editarParcela, ErroDeConta, estornarNaConta, receberNaConta, reembolsarParcela } from "@/lib/contas-receber";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

const schema = z.discriminatedUnion("acao", [
  /** Receber esta parcela (o que passar do saldo dela segue para as próximas). */
  z.object({
    acao: z.literal("receber"),
    valorCents: z.number().int().min(1).optional(), // padrão: o saldo da parcela
    meio: z.enum(["PIX", "CARTAO", "DINHEIRO", "BOLETO", "FIADO"]).optional(),
    recebidoEm: dia.optional(),
    observacao: z.string().trim().max(300).optional(),
  }),
  z.object({ acao: z.literal("estornar"), observacao: z.string().trim().max(300).optional() }),
  z.object({ acao: z.literal("reembolsar"), observacao: z.string().trim().max(300).optional() }),
  z.object({ acao: z.literal("cancelar") }),
  z.object({
    acao: z.literal("editar"),
    vencimento: dia.nullable().optional(),
    valorCents: z.number().int().min(1).optional(),
    observacao: z.string().trim().max(300).nullable().optional(),
  }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  const parcela = await prisma.parcela.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, contaId: true, valorCents: true },
  });
  if (!parcela) return NextResponse.json({ error: "parcela não encontrada" }, { status: 404 });

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      switch (d.acao) {
        case "receber": {
          // Sem valor informado, quita o que falta desta parcela.
          let valor = d.valorCents;
          if (valor === undefined) {
            const pago = await tx.pagamento.aggregate({ where: { parcelaId: parcela.id }, _sum: { valorCents: true } });
            valor = parcela.valorCents - (pago._sum.valorCents ?? 0);
          }
          return receberNaConta(tx, {
            tenantId: user.tenantId,
            contaId: parcela.contaId,
            parcelaId: parcela.id,
            valorCents: valor,
            meio: d.meio,
            recebidoEm: d.recebidoEm ? new Date(`${d.recebidoEm}T12:00:00Z`) : undefined,
            observacao: d.observacao,
            userId: user.id,
          });
        }
        case "estornar":
          return estornarNaConta(tx, { tenantId: user.tenantId, contaId: parcela.contaId, parcelaId: parcela.id, observacao: d.observacao, userId: user.id });
        case "reembolsar":
          return reembolsarParcela(tx, { tenantId: user.tenantId, parcelaId: parcela.id, observacao: d.observacao, userId: user.id });
        case "cancelar":
          return cancelarParcela(tx, { tenantId: user.tenantId, parcelaId: parcela.id });
        case "editar":
          return editarParcela(tx, {
            tenantId: user.tenantId,
            parcelaId: parcela.id,
            vencimento: d.vencimento === undefined ? undefined : d.vencimento ? parseDia(d.vencimento) : null,
            valorCents: d.valorCents,
            observacao: d.observacao,
          });
      }
    });
    await logAudit({ actor: user, action: `parcela.${d.acao}`, metadata: { parcelaId: parcela.id, contaId: parcela.contaId } });
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
