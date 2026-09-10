import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { mrr, ativacao, alertas, diasRestantesDeTeste, type ClienteSaas } from "@/lib/saas";
import { effectiveInvoiceStatus } from "@/lib/billing";

/**
 * O retrato da Dilon Tech como empresa SaaS.
 *
 * Tudo numa rota, calculado na hora. São poucas empresas e a consulta roda
 * quando alguém abre o painel — não há volume que justifique guardar número
 * pronto, e número guardado precisa de alguém lembrando de atualizar.
 */
export async function GET() {
  await requireSuperAdmin();

  const empresas = await prisma.tenant.findMany({
    // A empresa interna da Dilon Tech é da casa, não cliente: entrar aqui
    // contaria um usuário de suporte como cliente sem assinatura.
    where: { slug: { not: "dilon-tech-interno" } },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      subscription: {
        select: {
          status: true,
          amountCents: true,
          plano: true,
          plataformaCompleta: true,
          testeAte: true,
          setupCents: true,
          setupPagoEm: true,
          canceladoEm: true,
          motivoCancelamento: true,
        },
      },
      sessions: { select: { status: true } },
      invoices: { select: { status: true, dueDate: true } },
      _count: { select: { users: { where: { deactivatedAt: null } } } },
    },
    orderBy: { name: "asc" },
  });

  // Última mensagem de cada empresa numa consulta só, e não uma por empresa.
  const ultimas = await prisma.$queryRaw<{ tenantId: string; ultima: Date }[]>`
    SELECT s."tenantId", max(m."createdAt") AS ultima
    FROM "Message" m JOIN "WhatsAppSession" s ON s.id = m."sessionId"
    GROUP BY s."tenantId"
  `;
  const ultimaPorEmpresa = new Map(ultimas.map((u) => [u.tenantId, u.ultima]));

  const clientes: (ClienteSaas & Record<string, unknown>)[] = empresas.map((e) => {
    const vencidas = e.invoices.filter((i) => effectiveInvoiceStatus(i) === "OVERDUE").length;
    const sub = e.subscription;
    return {
      id: e.id,
      nome: e.name,
      slug: e.slug,
      criadoEm: e.createdAt,
      situacao: sub ? sub.status : "SEM_ASSINATURA",
      mensalCents: sub ? sub.amountCents : null,
      testeAte: sub?.testeAte ?? null,
      whatsappConectado: e.sessions.some((s) => s.status === "CONNECTED"),
      ultimaMensagemEm: ultimaPorEmpresa.get(e.id) ?? null,
      usuariosAtivos: e._count.users,
      faturasVencidas: vencidas,
      plano: sub?.plano ?? null,
      plataformaCompleta: sub?.plataformaCompleta ?? true,
      setupCents: sub?.setupCents ?? null,
      setupPago: Boolean(sub?.setupPagoEm),
      canceladoEm: sub?.canceladoEm ?? null,
      motivoCancelamento: sub?.motivoCancelamento ?? null,
    };
  });

  const agora = new Date();
  const porSituacao = { TRIAL: 0, ACTIVE: 0, PAUSED: 0, CANCELED: 0, SEM_ASSINATURA: 0 };
  for (const c of clientes) porSituacao[c.situacao]++;

  return NextResponse.json({
    resumo: {
      mrrCents: mrr(clientes),
      // Anualizado é o número que investidor e banco perguntam; custa uma
      // multiplicação e evita alguém fazer a conta de cabeça errado.
      arrCents: mrr(clientes) * 12,
      porSituacao,
      inadimplentes: clientes.filter((c) => c.faturasVencidas > 0).length,
      semAtivacao: clientes.filter((c) => c.situacao !== "CANCELED" && ativacao(c, agora) === "nunca_ativou").length,
    },
    alertas: alertas(clientes, agora),
    clientes: clientes.map((c) => ({
      ...c,
      ativacao: ativacao(c, agora),
      diasDeTeste: c.testeAte ? diasRestantesDeTeste(c.testeAte, agora) : null,
    })),
  });
}
