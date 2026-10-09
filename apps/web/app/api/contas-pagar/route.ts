import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro, parseDia, inicioDoDiaBR, fimDoDiaBR } from "@/lib/guarda-financeiro";
import { criarContaPagar, ErroDePagar, listarParcelasPagar, resumoAPagar } from "@/lib/contas-pagar";
import type { StatusParcela } from "@dilon-zap/receivables";

const STATUS: StatusParcela[] = ["PENDENTE", "PAGA", "CANCELADA", "REEMBOLSADA"];
const FORMAS = ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE", "OUTRO"] as const;

/**
 * A lista de contas a pagar, uma linha por parcela.
 * ?desde&ate=YYYY-MM-DD · ?tipoData=vencimento|pagamento · ?fornecedor=texto
 * ?status=PENDENTE,PAGA (padrão PENDENTE) · ?forma=BOLETO
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const q = new URL(req.url).searchParams;
  const tipoData = q.get("tipoData") === "pagamento" ? "pagamento" : "vencimento";
  const status = (q.get("status") ?? "PENDENTE").split(",").filter((s): s is StatusParcela => (STATUS as string[]).includes(s));
  const forma = (FORMAS as readonly string[]).includes(q.get("forma") ?? "") ? (q.get("forma") as (typeof FORMAS)[number]) : undefined;

  const desde = tipoData === "vencimento" ? parseDia(q.get("desde")) : inicioDoDiaBR(q.get("desde"));
  const ate = tipoData === "vencimento" ? parseDia(q.get("ate")) : fimDoDiaBR(q.get("ate"));

  const [linhas, resumo] = await Promise.all([
    listarParcelasPagar(user.tenantId, {
      desde,
      ate,
      tipoData,
      fornecedor: q.get("fornecedor")?.trim() || undefined,
      status: status.length ? status : ["PENDENTE"],
      forma,
    }),
    resumoAPagar(user.tenantId),
  ]);

  return NextResponse.json({
    linhas,
    resumo,
    totais: { registros: linhas.length, valorCents: linhas.reduce((s, l) => s + l.valorCents, 0), saldoCents: linhas.reduce((s, l) => s + l.saldoCents, 0) },
  });
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

const novaSchema = z
  .object({
    fornecedorId: z.string().min(1).optional(),
    fornecedorNome: z.string().trim().min(1).max(120).optional(),
    descricao: z.string().trim().max(200).nullable().optional(),
    totalCents: z.number().int().min(1).max(10_000_000_000),
    numParcelas: z.number().int().min(1).max(60),
    periodicidade: z.enum(["SEMANAL", "QUINZENAL", "MENSAL"]),
    primeiroVencimento: dia,
    forma: z.enum(FORMAS).default("BOLETO"),
  })
  .refine((d) => d.fornecedorId || d.fornecedorNome, "informe o fornecedor");

export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = novaSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    const conta = await prisma.$transaction((tx) =>
      criarContaPagar(tx, {
        tenantId: user.tenantId,
        fornecedorId: d.fornecedorId,
        fornecedorNome: d.fornecedorNome,
        descricao: d.descricao,
        forma: d.forma,
        userId: user.id,
        plano: { totalCents: d.totalCents, numParcelas: d.numParcelas, periodicidade: d.periodicidade, primeiroVencimento: parseDia(d.primeiroVencimento)! },
      })
    );
    await logAudit({ actor: user, action: "conta_pagar.criada", metadata: { contaId: conta.id, totalCents: d.totalCents, parcelas: d.numParcelas } });
    return NextResponse.json(conta, { status: 201 });
  } catch (e) {
    if (e instanceof ErroDePagar) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
