import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro, parseDia, inicioDoDiaBR, fimDoDiaBR } from "@/lib/guarda-financeiro";
import { criarContaManual, ErroDeConta, listarParcelas, resumoDoAReceber } from "@/lib/contas-receber";
import type { StatusParcela } from "@dilon-zap/receivables";

const STATUS: StatusParcela[] = ["PENDENTE", "PAGA", "CANCELADA", "REEMBOLSADA"];
const TIPOS = ["ENTRADA", "UNICA", "SEMANAL", "QUINZENAL", "MENSAL"] as const;

/**
 * A lista de contas a receber, uma linha por parcela.
 *
 * ?desde=YYYY-MM-DD&ate=YYYY-MM-DD   período
 * ?tipoData=vencimento|pagamento     qual data o período filtra
 * ?cliente=texto                     nome ou telefone
 * ?status=PENDENTE,PAGA              (padrão: PENDENTE)
 * ?tipo=SEMANAL                      tipo de pagamento
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const q = new URL(req.url).searchParams;
  const tipoData = q.get("tipoData") === "pagamento" ? "pagamento" : "vencimento";
  const status = (q.get("status") ?? "PENDENTE")
    .split(",")
    .filter((s): s is StatusParcela => (STATUS as string[]).includes(s));
  const tipo = (TIPOS as readonly string[]).includes(q.get("tipo") ?? "") ? (q.get("tipo") as (typeof TIPOS)[number]) : undefined;

  // Vencimento é uma data guardada ao meio-dia UTC: comparar com o meio-dia do
  // dia pedido inclui os dois extremos do período. Pagamento é um instante, e o
  // dia dele é o de Brasília.
  const desde = tipoData === "vencimento" ? parseDia(q.get("desde")) : inicioDoDiaBR(q.get("desde"));
  const ate = tipoData === "vencimento" ? parseDia(q.get("ate")) : fimDoDiaBR(q.get("ate"));

  const [linhas, resumo] = await Promise.all([
    listarParcelas(user.tenantId, {
      desde,
      ate,
      tipoData,
      cliente: q.get("cliente")?.trim() || undefined,
      status: status.length ? status : ["PENDENTE"],
      tipo,
    }),
    resumoDoAReceber(user.tenantId),
  ]);

  return NextResponse.json({
    linhas,
    resumo,
    totais: {
      registros: linhas.length,
      valorCents: linhas.reduce((s, l) => s + l.valorCents, 0),
      saldoCents: linhas.reduce((s, l) => s + l.saldoCents, 0),
    },
  });
}

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida");

const novaSchema = z.object({
  contactId: z.string().min(1),
  descricao: z.string().trim().max(200).nullable().optional(),
  totalCents: z.number().int().min(1).max(10_000_000_000),
  entradaCents: z.number().int().min(0).optional(),
  vencimentoEntrada: dia.optional(),
  numParcelas: z.number().int().min(1).max(60),
  periodicidade: z.enum(["SEMANAL", "QUINZENAL", "MENSAL"]),
  primeiroVencimento: dia,
});

/** Nova conta a receber (avulsa), já dividida em entrada + parcelas. */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = novaSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    const conta = await prisma.$transaction((tx) =>
      criarContaManual(tx, {
        tenantId: user.tenantId,
        contactId: d.contactId,
        descricao: d.descricao,
        userId: user.id,
        plano: {
          totalCents: d.totalCents,
          entradaCents: d.entradaCents,
          vencimentoEntrada: parseDia(d.vencimentoEntrada),
          numParcelas: d.numParcelas,
          periodicidade: d.periodicidade,
          primeiroVencimento: parseDia(d.primeiroVencimento)!,
        },
      })
    );
    await logAudit({ actor: user, action: "conta_receber.criada", metadata: { contaId: conta.id, totalCents: d.totalCents, parcelas: d.numParcelas } });
    return NextResponse.json(conta, { status: 201 });
  } catch (e) {
    if (e instanceof ErroDeConta) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
