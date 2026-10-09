/**
 * Prova de fumaça das contas a receber, das parcelas e do caixa contra o banco
 * de verdade. Cria dados de teste numa empresa, confere cada passo e APAGA tudo
 * no fim (o contato de teste leva junto conta, parcelas, pedidos e recebimentos).
 *
 * Recusa rodar se a empresa tem um caixa aberto: o teste abre o dele.
 *
 * Uso (de dentro de apps/web, para o alias @/ resolver):
 *   cd apps/web && npx tsx ../../scripts/verificar-contas-receber.ts "Dilon Tech"
 */
import { prisma } from "@dilon-zap/db";
import { abrirCaixa, dadosDoCaixa, fecharCaixa, registrarMovimento } from "../apps/web/lib/caixa";
import {
  criarContaManual,
  detalheDaConta,
  estornarNaConta,
  garantirContaDoPedido,
  listarParcelas,
  receberNaConta,
  reembolsarParcela,
  reparcelarConta,
} from "../apps/web/lib/contas-receber";
import { fecharPedido } from "../apps/web/lib/orders";
import { registrarPagamento } from "../apps/web/lib/receivables";

function confere(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`);
  if (!ok) throw new Error(`falhou: ${nome}`);
}

const dia = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
};

async function main() {
  const nomeEmpresa = process.argv[2];
  if (!nomeEmpresa) throw new Error("informe o nome da empresa");

  const tenant = await prisma.tenant.findFirstOrThrow({ where: { name: { startsWith: nomeEmpresa } } });
  const usuario = await prisma.user.findFirstOrThrow({ where: { tenantId: tenant.id, role: { in: ["OWNER", "SUPERADMIN", "FINANCEIRO"] } } });
  if (await prisma.caixa.findFirst({ where: { tenantId: tenant.id, fechadoEm: null } })) {
    throw new Error("a empresa tem um caixa aberto: o teste não roda por cima dele");
  }

  const marca = `Teste Fumaça ${Date.now()}`;
  const contato = await prisma.contact.create({ data: { tenantId: tenant.id, waJid: `fumaca-${Date.now()}@s.whatsapp.net`, name: marca } });
  let caixaId: string | null = null;

  try {
    caixaId = (await abrirCaixa(tenant.id, usuario.id, 5000)).id;

    /* ----------------------------- conta avulsa: entrada + 3 semanais ----------------------------- */
    const conta = await prisma.$transaction((tx) =>
      criarContaManual(tx, {
        tenantId: tenant.id,
        contactId: contato.id,
        descricao: "fumaça",
        userId: usuario.id,
        plano: { totalCents: 1000_00, entradaCents: 100_00, numParcelas: 3, periodicidade: "SEMANAL", primeiroVencimento: dia(7), vencimentoEntrada: dia(0) },
      })
    );
    const abertas = await listarParcelas(tenant.id, { tipoData: "vencimento", status: ["PENDENTE"], cliente: marca });
    confere("4 parcelas pendentes (entrada + 3)", abertas.map((p) => [p.tipo, p.numero, p.totalParcelas, p.valorCents]), [
      ["ENTRADA", 1, 1, 100_00],
      ["SEMANAL", 1, 3, 300_00],
      ["SEMANAL", 2, 3, 300_00],
      ["SEMANAL", 3, 3, 300_00],
    ]);
    const entrada = abertas[0];

    await prisma.$transaction((tx) => receberNaConta(tx, { tenantId: tenant.id, contaId: conta.id, parcelaId: entrada.id, valorCents: 100_00, meio: "DINHEIRO", userId: usuario.id }));
    let det = await detalheDaConta(tenant.id, conta.id);
    confere("entrada paga em dinheiro", det!.parcelas.map((p) => p.status), ["PAGA", "PENDENTE", "PENDENTE", "PENDENTE"]);

    const r = await prisma.$transaction((tx) => receberNaConta(tx, { tenantId: tenant.id, contaId: conta.id, valorCents: 450_00, meio: "PIX", userId: usuario.id }));
    confere("450 quita a 1ª e adianta a 2ª (2 lançamentos)", r.parcelasAtingidas, 2);
    det = await detalheDaConta(tenant.id, conta.id);
    confere("situação depois do transbordo", det!.parcelas.map((p) => [p.status, p.saldoCents]), [["PAGA", 0], ["PAGA", 0], ["PENDENTE", 150_00], ["PENDENTE", 300_00]]);

    let erroEsperado = "";
    try {
      await prisma.$transaction((tx) => receberNaConta(tx, { tenantId: tenant.id, contaId: conta.id, valorCents: 9999_00, meio: "PIX" }));
    } catch (e) {
      erroEsperado = (e as Error).message;
    }
    confere("receber mais do que se deve é recusado", erroEsperado.includes("maior que o saldo"), true);

    await prisma.$transaction((tx) => estornarNaConta(tx, { tenantId: tenant.id, contaId: conta.id, valorCents: 100_00, userId: usuario.id }));
    det = await detalheDaConta(tenant.id, conta.id);
    confere("estorno volta a dívida da última parcela paga", det!.parcelas.map((p) => p.saldoCents), [0, 0, 250_00, 300_00]);

    await prisma.$transaction((tx) => reembolsarParcela(tx, { tenantId: tenant.id, parcelaId: entrada.id, userId: usuario.id }));
    det = await detalheDaConta(tenant.id, conta.id);
    confere("reembolso encerra a entrada", det!.parcelas[0].status, "REEMBOLSADA");

    await prisma.$transaction((tx) => reparcelarConta(tx, { tenantId: tenant.id, contaId: conta.id, numParcelas: 2, periodicidade: "QUINZENAL", primeiroVencimento: dia(20) }));
    det = await detalheDaConta(tenant.id, conta.id);
    // A 1ª e a 2ª parcelas já tinham recebimento e ficam; só a 3ª (300, intocada) vira 2 de 150.
    confere(
      "reparcelar refaz só o que estava sem recebimento",
      det!.parcelas.filter((p) => p.status === "PENDENTE").map((p) => p.valorCents).sort((a, b) => a - b),
      [150_00, 150_00, 300_00]
    );

    /* ------------------------------ pedido que fecha devendo ------------------------------ */
    const pedido = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        contactId: contato.id,
        createdById: usuario.id,
        items: { create: [{ nomeProduto: "Item de teste A", precoTabelaCents: 100_00, precoUnitCents: 100_00, quantidade: 1 }, { nomeProduto: "Item de teste B", precoTabelaCents: 50_00, precoUnitCents: 50_00, quantidade: 2 }] },
      },
    });
    await fecharPedido({ orderId: pedido.id, tenantId: tenant.id, userId: usuario.id, paymentMethod: "FIADO", descontoCents: 0, pago: false, vencimento: dia(5) });
    const contaPedido = await prisma.contaReceber.findUnique({ where: { orderId: pedido.id }, include: { parcelas: true } });
    confere("pedido fechado devendo ganha conta com 1 parcela do total", [contaPedido?.parcelas.length, contaPedido?.parcelas[0].valorCents], [1, 200_00]);

    let rp = await registrarPagamento({ orderId: pedido.id, tenantId: tenant.id, valorCents: 80_00, meio: "PIX", userId: usuario.id });
    confere("recebimento parcial pelo caminho antigo", [rp.saldoDepois, rp.quitado], [120_00, false]);
    let o = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    confere("pedido segue em aberto, com vencimento", [o.pago, o.vencimento !== null], [false, true]);

    rp = await registrarPagamento({ orderId: pedido.id, tenantId: tenant.id, valorCents: 120_00, meio: "DINHEIRO", userId: usuario.id });
    o = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    confere("quitado: pedido pago, sem vencimento", [rp.quitado, o.pago, o.vencimento], [true, true, null]);

    rp = await registrarPagamento({ orderId: pedido.id, tenantId: tenant.id, valorCents: -50_00, meio: "DINHEIRO", userId: usuario.id });
    o = await prisma.order.findUniqueOrThrow({ where: { id: pedido.id } });
    confere("estorno reabre a dívida e o vencimento volta", [rp.saldoDepois, o.pago, o.vencimento !== null], [50_00, false, true]);

    const idempotente = await prisma.$transaction((tx) => garantirContaDoPedido(tx, pedido.id));
    confere("garantir a conta duas vezes devolve a mesma", idempotente.id, contaPedido!.id);

    /* ------------------------------------------- caixa ------------------------------------------- */
    await registrarMovimento(tenant.id, usuario.id, caixaId, { tipo: "SANGRIA", valorCents: 20_00, descricao: "fumaça" });
    const dados = await dadosDoCaixa(tenant.id, caixaId);
    // Dinheiro: +100 (entrada) −100 (reembolso) +120 (quitação do pedido) −50 (estorno) = +70; sangria −20.
    confere("esperado em dinheiro na gaveta", dados!.resumo.esperadoDinheiroCents, 5000 + 70_00 - 20_00);
    const fechamento = await fecharCaixa(tenant.id, usuario.id, caixaId, 5000 + 70_00 - 20_00, "fumaça");
    confere("caixa confere ao contar o esperado", fechamento.diferencaCents, 0);
  } finally {
    // O contato leva junto conta, parcelas, pedidos, itens e recebimentos.
    await prisma.contact.delete({ where: { id: contato.id } }).catch((e) => console.error("limpeza do contato:", e.message));
    if (caixaId) await prisma.caixa.delete({ where: { id: caixaId } }).catch((e) => console.error("limpeza do caixa:", e.message));
  }
  console.log("\nTudo certo — e a limpeza foi feita.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
