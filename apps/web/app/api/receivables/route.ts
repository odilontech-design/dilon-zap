import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { listarRecebiveis, listarHistoricoRecebido, recebidoNoMes } from "@/lib/receivables";

/**
 * O que a empresa tem a receber.
 *
 * Só responsável e financeiro. Não é permissão por permissão: a lista mostra
 * quanto cada cliente deve e há quanto tempo, e isso é informação de gestão —
 * a consultora que atende no Inbox não precisa dela pra trabalhar.
 */
// Janela do histórico. 12 meses cobre o ano fiscal inteiro, que é o horizonte
// de quem confere recebimento de honorário; acima disso a tela viraria um
// extrato que ninguém lê rolando.
const MESES_VALIDOS = [1, 3, 6, 12] as const;

export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "CONTAS_RECEBER");
  if (bloqueio) return bloqueio;
  if (user.role !== "OWNER" && user.role !== "FINANCEIRO") {
    return NextResponse.json(
      { error: "só o responsável e o financeiro veem as contas a receber" },
      { status: 403 }
    );
  }

  const params = new URL(req.url).searchParams;
  const mesesPedidos = Number(params.get("meses"));
  const meses = (MESES_VALIDOS as readonly number[]).includes(mesesPedidos) ? mesesPedidos : 3;

  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { timezone: true },
  });

  const desde = new Date();
  desde.setMonth(desde.getMonth() - meses);

  const [itens, historico, recebidoNoMesCents] = await Promise.all([
    listarRecebiveis(user.tenantId),
    listarHistoricoRecebido(user.tenantId, desde),
    recebidoNoMes(user.tenantId, tenant.timezone),
  ]);

  // Totais por faixa, calculados aqui pra tela não precisar reduzir de novo e
  // pra que os dois números (lista e resumo) venham sempre da mesma conta.
  const resumo = { vencido: 0, vence_hoje: 0, a_vencer: 0, sem_prazo: 0, total: 0 };
  for (const i of itens) {
    resumo[i.faixa] += i.saldoCents;
    resumo.total += i.saldoCents;
  }

  return NextResponse.json({ itens, resumo, historico, recebidoNoMesCents, meses });
}

/** Quanto um contato específico deve — usado na ficha dentro do Inbox. */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "CONTAS_RECEBER");
  if (bloqueio) return bloqueio;
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
