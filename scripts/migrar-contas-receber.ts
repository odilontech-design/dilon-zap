/**
 * Cria a conta a receber (com uma parcela) para cada pedido fechado que ainda
 * está devendo e não tem conta. É o que faz o A receber novo, baseado em
 * parcelas, enxergar o que o antigo, baseado em pedidos, já mostrava.
 *
 * - A parcela tem o valor total do pedido e o vencimento dele (ou "sem prazo").
 * - Os recebimentos parciais que o pedido já tinha passam a ser da parcela.
 * - Pedido, pagamentos e vencimento não são alterados.
 *
 * Idempotente: pedido que já tem conta é pulado.
 *
 * Uso (de dentro de apps/web, para o alias @/ resolver):
 *   cd apps/web && npx tsx ../../scripts/migrar-contas-receber.ts            (simulação)
 *   cd apps/web && npx tsx ../../scripts/migrar-contas-receber.ts --gravar
 */
import { prisma } from "@dilon-zap/db";
import { garantirContaDoPedido, sincronizarConta } from "../apps/web/lib/contas-receber";

async function main() {
  const gravar = process.argv.includes("--gravar");
  console.log(gravar ? "GRAVANDO" : "SIMULAÇÃO (use --gravar para aplicar)");

  const pedidos = await prisma.order.findMany({
    where: { status: "FECHADO", pago: false, totalCents: { gt: 0 }, conta: null },
    select: {
      id: true,
      numero: true,
      tenantId: true,
      totalCents: true,
      vencimento: true,
      pagamentos: { select: { valorCents: true } },
      tenant: { select: { name: true } },
    },
    orderBy: { numero: "asc" },
  });

  const porEmpresa = new Map<string, { qtd: number; saldo: number }>();
  for (const p of pedidos) {
    const saldo = p.totalCents - p.pagamentos.reduce((s, x) => s + x.valorCents, 0);
    const a = porEmpresa.get(p.tenant.name) ?? { qtd: 0, saldo: 0 };
    a.qtd += 1;
    a.saldo += saldo;
    porEmpresa.set(p.tenant.name, a);
  }
  for (const [nome, a] of porEmpresa) console.log(`${nome}: ${a.qtd} pedido(s) devendo, saldo ${(a.saldo / 100).toFixed(2)}`);
  console.log(`Total: ${pedidos.length} conta(s) a criar.`);
  if (!gravar) return;

  let criadas = 0;
  for (const p of pedidos) {
    await prisma.$transaction(async (tx) => {
      const conta = await garantirContaDoPedido(tx, p.id);
      await sincronizarConta(tx, conta.id);
    });
    criadas += 1;
  }
  console.log(`Criadas: ${criadas}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
