import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro, parseDia } from "@/lib/guarda-financeiro";
import { cancelarContaPagar, detalheDaContaPagar, ErroDePagar, pagarNaConta, reparcelarContaPagar } from "@/lib/contas-pagar";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;
  const detalhe = await detalheDaContaPagar(user.tenantId, params.id);
  if (!detalhe) return NextResponse.json({ error: "conta não encontrada" }, { status: 404 });
  return NextResponse.json(detalhe);
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");
const FORMAS = ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE", "OUTRO"] as const;

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("cancelar") }),
  z.object({ acao: z.literal("reparcelar"), numParcelas: z.number().int().min(1).max(60), periodicidade: z.enum(["SEMANAL", "QUINZENAL", "MENSAL"]), primeiroVencimento: dia }),
  z.object({ acao: z.literal("pagar"), valorCents: z.number().int().min(1), meio: z.enum(FORMAS).optional(), pagoEm: dia.optional(), observacao: z.string().trim().max(300).optional() }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    const r = await prisma.$transaction(async (tx) => {
      if (d.acao === "cancelar") return cancelarContaPagar(tx, { tenantId: user.tenantId, contaId: params.id });
      if (d.acao === "reparcelar") {
        return reparcelarContaPagar(tx, { tenantId: user.tenantId, contaId: params.id, numParcelas: d.numParcelas, periodicidade: d.periodicidade, primeiroVencimento: parseDia(d.primeiroVencimento)! });
      }
      return pagarNaConta(tx, {
        tenantId: user.tenantId,
        contaId: params.id,
        valorCents: d.valorCents,
        meio: d.meio,
        pagoEm: d.pagoEm ? new Date(`${d.pagoEm}T12:00:00Z`) : undefined,
        observacao: d.observacao,
        userId: user.id,
      });
    });
    await logAudit({ actor: user, action: `conta_pagar.${d.acao}`, metadata: { contaId: params.id } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDePagar) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
