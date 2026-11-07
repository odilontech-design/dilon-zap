import { prisma } from "@dilon-zap/db";

/**
 * O que a exclusão de uma empresa leva junto e o que a impede.
 *
 * A exclusão apaga a empresa e, em cascata, tudo que é dela (usuários,
 * contatos, conversas, mensagens, pedidos, financeiro, sessões do WhatsApp).
 * Os impeditivos existem porque três coisas vivem FORA deste banco e
 * continuariam existindo, cobrando ou ocupando recurso depois do sumiço da
 * empresa: a cobrança automática (Asaas/Mercado Pago), o escritório no ERP e a
 * própria empresa de quem está operando o painel.
 */
export async function impactoDaExclusao(tenantId: string, empresaDoAdmin: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      subscription: {
        select: { status: true, asaasSubscriptionId: true, asaasPixAuthorizationId: true, mpPreapprovalId: true },
      },
      erpContabilidade: { select: { id: true } },
      sessions: { select: { id: true, status: true } },
      users: { select: { role: true } },
    },
  });
  if (!tenant) return null;

  const [contatos, conversas, mensagens, pedidos, ultima] = await Promise.all([
    prisma.contact.count({ where: { tenantId } }),
    prisma.conversation.count({ where: { tenantId } }),
    prisma.message.count({ where: { conversation: { tenantId } } }),
    prisma.order.count({ where: { tenantId } }),
    prisma.message.findFirst({
      where: { conversation: { tenantId } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const impeditivos: string[] = [];
  if (tenant.id === empresaDoAdmin) impeditivos.push("É a empresa de quem está logado no painel. Não dá para excluir a própria empresa.");
  if (tenant.users.some((u) => u.role === "SUPERADMIN")) impeditivos.push("Tem usuário SUPERADMIN. Esse acesso precisa continuar existindo.");
  const sub = tenant.subscription;
  if (sub && sub.status !== "CANCELED" && (sub.asaasSubscriptionId || sub.asaasPixAuthorizationId || sub.mpPreapprovalId)) {
    impeditivos.push("Tem cobrança automática ativa (Asaas ou Mercado Pago). Cancele a cobrança na ficha da empresa antes, senão ela continua cobrando.");
  }
  if (tenant.erpContabilidade) impeditivos.push("Tem escritório no ERP de contabilidade vinculado. Desfaça o vínculo antes, para o escritório não ficar órfão no ERP.");

  return {
    id: tenant.id,
    nome: tenant.name,
    usuarios: tenant.users.length,
    sessoes: tenant.sessions.length,
    contatos,
    conversas,
    mensagens,
    pedidos,
    ultimaMensagemEm: ultima?.createdAt ?? null,
    impeditivos,
  };
}

/**
 * Apaga a empresa no banco, em uma transação.
 *
 * O resto sai por cascata, mas quatro relações do schema são RESTRICT e, quando
 * pai e filho somem juntos, o Postgres pode recusar conforme a ordem em que
 * processa a cascata: Negociação → Etapa/Funil, Conta a pagar → Fornecedor e
 * Campanha do SDR → Perfil (ICP). Por isso os filhos saem primeiro, de forma
 * explícita. Se aparecer uma nova relação RESTRICT, o teste
 * exclusao-empresa.test.ts avisa.
 */
export async function excluirEmpresaNoBanco(tenantId: string) {
  await prisma.$transaction([
    prisma.negociacao.deleteMany({ where: { tenantId } }),
    prisma.contaPagar.deleteMany({ where: { tenantId } }),
    prisma.sdrCampanha.deleteMany({ where: { tenantId } }),
    prisma.tenant.delete({ where: { id: tenantId } }),
  ]);
}
