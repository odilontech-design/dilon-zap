/**
 * Limpeza do Inbox de uma empresa: resolve todas as conversas abertas e
 * pendentes (grupos ficam de fora) e marca as mensagens delas como lidas,
 * para a equipe recomeçar do zero.
 *
 * Pedido da Hemoderi na reunião de 13/10/2026. Não cria "atendimento
 * encerrado" para cada conversa — isso inflaria os relatórios com centenas de
 * atendimentos que ninguém fez. A conversa fica resolvida com o motivo
 * "Limpeza do Inbox" e, se o cliente escrever de novo, reabre normalmente.
 *
 * Uso (dentro do container web, como o verificar-contas-receber):
 *   npx tsx ../../scripts/limpar-inbox.ts "Hemoderi"            → simulação
 *   npx tsx ../../scripts/limpar-inbox.ts "Hemoderi" --gravar   → grava
 */
import { prisma } from "@dilon-zap/db";

async function main() {
  const nome = process.argv[2];
  const gravar = process.argv.includes("--gravar");
  if (!nome) throw new Error('informe o nome da empresa, ex.: "Hemoderi"');

  const tenant = await prisma.tenant.findFirst({ where: { name: nome }, select: { id: true, name: true } });
  if (!tenant) throw new Error(`empresa "${nome}" não encontrada`);

  const where = { tenantId: tenant.id, status: { in: ["OPEN", "PENDING"] as ("OPEN" | "PENDING")[] }, contact: { grupo: false } };
  const conversas = await prisma.conversation.findMany({ where, select: { id: true, status: true, assignedToId: true, setorId: true } });
  const ids = conversas.map((c) => c.id);
  const naoLidas = ids.length
    ? await prisma.message.count({ where: { conversationId: { in: ids }, direction: "INBOUND", readAt: null } })
    : 0;

  console.log(`${tenant.name}: ${conversas.length} conversa(s) a resolver`);
  console.log(`  abertas: ${conversas.filter((c) => c.status === "OPEN").length} · pendentes: ${conversas.filter((c) => c.status === "PENDING").length}`);
  console.log(`  com responsável: ${conversas.filter((c) => c.assignedToId).length} · em setor: ${conversas.filter((c) => c.setorId).length}`);
  console.log(`  mensagens não lidas que viram lidas: ${naoLidas}`);

  if (!gravar) {
    console.log("\nSimulação — nada foi gravado. Rode de novo com --gravar.");
    return;
  }

  const agora = new Date();
  const [msgs, convs] = await prisma.$transaction([
    prisma.message.updateMany({ where: { conversationId: { in: ids }, direction: "INBOUND", readAt: null }, data: { readAt: agora } }),
    prisma.conversation.updateMany({
      where: { id: { in: ids } },
      data: { status: "RESOLVED", closedAt: agora, closeReason: "Limpeza do Inbox (reunião de 13/10/2026)" },
    }),
  ]);
  await prisma.auditLog.create({
    data: {
      actorUserId: "script",
      actorName: "Dilon Tech (script limpar-inbox)",
      actorEmail: "",
      actorTenantId: tenant.id,
      targetTenantId: tenant.id,
      targetTenantName: tenant.name,
      action: "inbox.limpeza",
      metadata: { conversas: convs.count, mensagensLidas: msgs.count },
    },
  });
  console.log(`\nGravado: ${convs.count} conversa(s) resolvida(s), ${msgs.count} mensagem(ns) marcada(s) como lida(s).`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
