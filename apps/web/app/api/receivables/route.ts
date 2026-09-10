import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { listarRecebiveis } from "@/lib/receivables";

/**
 * O que a empresa tem a receber.
 *
 * Só responsável e financeiro. Não é permissão por permissão: a lista mostra
 * quanto cada cliente deve e há quanto tempo, e isso é informação de gestão —
 * a consultora que atende no Inbox não precisa dela pra trabalhar.
 */
export async function GET() {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "FINANCEIRO") {
    return NextResponse.json(
      { error: "só o responsável e o financeiro veem as contas a receber" },
      { status: 403 }
    );
  }

  const itens = await listarRecebiveis(user.tenantId);

  // Totais por faixa, calculados aqui pra tela não precisar reduzir de novo e
  // pra que os dois números (lista e resumo) venham sempre da mesma conta.
  const resumo = { vencido: 0, vence_hoje: 0, a_vencer: 0, sem_prazo: 0, total: 0 };
  for (const i of itens) {
    resumo[i.faixa] += i.saldoCents;
    resumo.total += i.saldoCents;
  }

  return NextResponse.json({ itens, resumo });
}

/** Quanto um contato específico deve — usado na ficha dentro do Inbox. */
export async function POST(req: Request) {
  const user = await requireUser();
  const { contactId } = (await req.json().catch(() => ({}))) as { contactId?: string };
  if (!contactId) return NextResponse.json({ error: "contactId obrigatório" }, { status: 400 });

  const pedidos = await prisma.order.findMany({
    where: { tenantId: user.tenantId, contactId, status: "FECHADO", pago: false },
    select: { totalCents: true, pagamentos: { select: { valorCents: true } } },
  });

  const totalCents = pedidos.reduce(
    (soma, p) => soma + p.totalCents - p.pagamentos.reduce((s, x) => s + x.valorCents, 0),
    0
  );

  return NextResponse.json({ totalCents, pedidos: pedidos.length });
}
