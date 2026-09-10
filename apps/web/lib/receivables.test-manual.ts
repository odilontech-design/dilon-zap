// Contas a receber: saldo, faixa de vencimento e dias de atraso. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/receivables.test-manual.ts
import { saldoDoPedido, faixaDeVencimento, diasDeAtraso } from "./receivables";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`
  );
}

// ---------------------------------------------------------------------------
// Saldo. É a soma do histórico, nunca um campo editado.
// ---------------------------------------------------------------------------

checa("sem pagamento — deve tudo", saldoDoPedido(20000, []), 20000);
checa("pagou tudo de uma vez", saldoDoPedido(20000, [{ valorCents: 20000 }]), 0);
checa(
  "pagou 60 de 200 — o caso que o booleano não representava",
  saldoDoPedido(20000, [{ valorCents: 6000 }]),
  14000
);
checa(
  "três parcelas fecham a conta",
  saldoDoPedido(20000, [{ valorCents: 7000 }, { valorCents: 7000 }, { valorCents: 6000 }]),
  0
);
checa(
  "estorno é pagamento negativo e reabre a dívida",
  saldoDoPedido(20000, [{ valorCents: 20000 }, { valorCents: -5000 }]),
  5000
);

// ---------------------------------------------------------------------------
// Faixa de vencimento. Compara DIA, não instante — quem combinou "dia 15"
// quis dizer o dia inteiro, não 15 às 00h00.
// ---------------------------------------------------------------------------

const HOJE = new Date(2026, 8, 10, 14, 30); // 10/09/2026, 14h30

checa("vence hoje, e ainda é hoje", faixaDeVencimento(new Date(2026, 8, 10, 9, 0), HOJE), "vence_hoje");
checa(
  "vence hoje mais tarde — continua vence_hoje, não a_vencer",
  faixaDeVencimento(new Date(2026, 8, 10, 23, 0), HOJE),
  "vence_hoje"
);
checa("venceu ontem", faixaDeVencimento(new Date(2026, 8, 9, 23, 59), HOJE), "vencido");
checa("vence amanhã", faixaDeVencimento(new Date(2026, 8, 11, 0, 1), HOJE), "a_vencer");
checa("sem prazo combinado", faixaDeVencimento(null, HOJE), "sem_prazo");

// A armadilha: vencimento hoje às 9h, agora são 14h30. Comparando instantes,
// isso apareceria como VENCIDO no meio da tarde do próprio dia do combinado —
// e a cobrança sairia pra quem ainda está dentro do prazo.
checa(
  "vencimento de manhã não vira vencido à tarde do mesmo dia",
  faixaDeVencimento(new Date(2026, 8, 10, 9, 0), HOJE) === "vencido",
  false
);

// ---------------------------------------------------------------------------
// Dias de atraso.
// ---------------------------------------------------------------------------

checa("um dia de atraso", diasDeAtraso(new Date(2026, 8, 9), HOJE), 1);
checa("dez dias de atraso", diasDeAtraso(new Date(2026, 7, 31), HOJE), 10);
checa("vence hoje — zero de atraso", diasDeAtraso(new Date(2026, 8, 10), HOJE), 0);
checa("vence no futuro — nunca negativo", diasDeAtraso(new Date(2026, 8, 20), HOJE), 0);

// Virada de mês e de ano são onde aritmética de data costuma errar.
checa(
  "atraso atravessando a virada do ano",
  diasDeAtraso(new Date(2025, 11, 28), new Date(2026, 0, 3)),
  6
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
