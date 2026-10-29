import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro, parseDia } from "@/lib/guarda-financeiro";
import { ErroDeCategoria, validarCategoria } from "@/lib/categorias-financeiras";
import { cancelarConta, detalheDaConta, ErroDeConta, receberNaConta, reparcelarConta } from "@/lib/contas-receber";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const detalhe = await detalheDaConta(user.tenantId, params.id);
  if (!detalhe) return NextResponse.json({ error: "conta não encontrada" }, { status: 404 });
  return NextResponse.json(detalhe);
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

const schema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("categoria"), categoriaId: z.string().min(1).nullable() }),
  z.object({ acao: z.literal("cancelar"), estornar: z.boolean().optional(), motivo: z.string().trim().max(200).optional() }),
  z.object({
    acao: z.literal("reparcelar"),
    entradaCents: z.number().int().min(0).optional(),
    vencimentoEntrada: dia.optional(),
    numParcelas: z.number().int().min(1).max(60),
    periodicidade: z.enum(["SEMANAL", "QUINZENAL", "MENSAL"]),
    primeiroVencimento: dia,
  }),
  // Recebimento "solto": entra nas parcelas pela ordem (entrada, depois vencimento).
  z.object({
    acao: z.literal("receber"),
    valorCents: z.number().int().min(1),
    meio: z.enum(["PIX", "CARTAO", "DINHEIRO", "BOLETO", "FIADO"]).optional(),
    recebidoEm: dia.optional(),
    observacao: z.string().trim().max(300).optional(),
  }),
]);

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      if (d.acao === "categoria") {
        const categoriaId = await validarCategoria(tx, user.tenantId, d.categoriaId, "RECEITA");
        const r = await tx.contaReceber.updateMany({ where: { id: params.id, tenantId: user.tenantId }, data: { categoriaId } });
        if (r.count === 0) throw new ErroDeConta("conta não encontrada", 404);
        return { ok: true };
      }
      if (d.acao === "cancelar")
        return cancelarConta(tx, { tenantId: user.tenantId, contaId: params.id, estornar: d.estornar, motivo: d.motivo, userId: user.id });
      if (d.acao === "reparcelar") {
        return reparcelarConta(tx, {
          tenantId: user.tenantId,
          contaId: params.id,
          entradaCents: d.entradaCents,
          vencimentoEntrada: parseDia(d.vencimentoEntrada),
          numParcelas: d.numParcelas,
          periodicidade: d.periodicidade,
          primeiroVencimento: parseDia(d.primeiroVencimento)!,
        });
      }
      return receberNaConta(tx, {
        tenantId: user.tenantId,
        contaId: params.id,
        valorCents: d.valorCents,
        meio: d.meio,
        recebidoEm: d.recebidoEm ? new Date(`${d.recebidoEm}T12:00:00Z`) : undefined,
        observacao: d.observacao,
        userId: user.id,
      });
    });
    await logAudit({ actor: user, action: `conta_receber.${d.acao}`, metadata: { contaId: params.id } });
    return NextResponse.json(resultado);
  } catch (e) {
    if (e instanceof ErroDeConta || e instanceof ErroDeCategoria) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
