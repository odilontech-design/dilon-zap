import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro, parseDia } from "@/lib/guarda-financeiro";
import { cancelarParcelaPagar, editarParcelaPagar, ErroDePagar, estornarPagamento, pagarNaConta, reembolsarParcelaPagar } from "@/lib/contas-pagar";

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");
const FORMAS = ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE", "OUTRO"] as const;

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("pagar"), valorCents: z.number().int().min(1).optional(), meio: z.enum(FORMAS).optional(), pagoEm: dia.optional(), observacao: z.string().trim().max(300).optional() }),
  z.object({ acao: z.literal("estornar"), observacao: z.string().trim().max(300).optional() }),
  z.object({ acao: z.literal("reembolsar"), observacao: z.string().trim().max(300).optional() }),
  z.object({ acao: z.literal("cancelar") }),
  z.object({
    acao: z.literal("editar"),
    vencimento: dia.nullable().optional(),
    valorCents: z.number().int().min(1).optional(),
    forma: z.enum(FORMAS).optional(),
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

  const parcela = await prisma.parcelaPagar.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true, contaId: true, valorCents: true } });
  if (!parcela) return NextResponse.json({ error: "parcela não encontrada" }, { status: 404 });

  try {
    const r = await prisma.$transaction(async (tx) => {
      switch (d.acao) {
        case "pagar": {
          let valor = d.valorCents;
          if (valor === undefined) {
            const pago = await tx.saidaPagamento.aggregate({ where: { parcelaId: parcela.id }, _sum: { valorCents: true } });
            valor = parcela.valorCents - (pago._sum.valorCents ?? 0);
          }
          return pagarNaConta(tx, {
            tenantId: user.tenantId,
            contaId: parcela.contaId,
            parcelaId: parcela.id,
            valorCents: valor,
            meio: d.meio,
            pagoEm: d.pagoEm ? new Date(`${d.pagoEm}T12:00:00Z`) : undefined,
            observacao: d.observacao,
            userId: user.id,
          });
        }
        case "estornar":
          return estornarPagamento(tx, { tenantId: user.tenantId, contaId: parcela.contaId, parcelaId: parcela.id, observacao: d.observacao, userId: user.id });
        case "reembolsar":
          return reembolsarParcelaPagar(tx, { tenantId: user.tenantId, parcelaId: parcela.id, observacao: d.observacao, userId: user.id });
        case "cancelar":
          return cancelarParcelaPagar(tx, { tenantId: user.tenantId, parcelaId: parcela.id });
        case "editar":
          return editarParcelaPagar(tx, {
            tenantId: user.tenantId,
            parcelaId: parcela.id,
            vencimento: d.vencimento === undefined ? undefined : d.vencimento ? parseDia(d.vencimento) : null,
            valorCents: d.valorCents,
            forma: d.forma,
            observacao: d.observacao,
          });
      }
    });
    await logAudit({ actor: user, action: `parcela_pagar.${d.acao}`, metadata: { parcelaId: parcela.id, contaId: parcela.contaId } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDePagar) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
