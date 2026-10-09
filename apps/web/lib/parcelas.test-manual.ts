// Parcelas e caixa: divisão em centavos, vencimentos, situação derivada dos
// recebimentos, alocação e conferência do caixa. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/parcelas.test-manual.ts
import {
  alocarRecebimento,
  gerarParcelas,
  ordenarParaQuitar,
  resumoDoCaixa,
  situacaoDaParcela,
  vencimentoDaParcela,
  type ParcelaEntrada,
} from "@dilon-zap/receivables";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}
function lanca(nome: string, fn: () => unknown, trecho: string) {
  try {
    fn();
    checa(nome, "não lançou", `lança "${trecho}"`);
  } catch (e) {
    const msg = (e as Error).message;
    checa(nome, msg.includes(trecho), true);
  }
}

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ------------------------------------------------------------ divisão
{
  const p = gerarParcelas({ totalCents: 600_00, numParcelas: 6, periodicidade: "SEMANAL", primeiroVencimento: dia("2026-10-10") });
  checa("6 parcelas de 100", p.map((x) => x.valorCents), [100_00, 100_00, 100_00, 100_00, 100_00, 100_00]);
  checa("numeração '1 de 6'", [p[0].numero, p[0].totalParcelas, p[5].numero], [1, 6, 6]);
  checa("tipo é a periodicidade", p[0].tipo, "SEMANAL");
}
{
  const p = gerarParcelas({ totalCents: 100_00 + 3, numParcelas: 6, periodicidade: "SEMANAL", primeiroVencimento: dia("2026-10-10") });
  const soma = p.reduce((s, x) => s + x.valorCents, 0);
  checa("a soma das parcelas é sempre o total", soma, 100_03);
  // 10.003 centavos ÷ 6 = 1.667 com 1 de resto: só a primeira ganha o centavo.
  checa("centavos que sobram vão para as primeiras", p.map((x) => x.valorCents), [1668, 1667, 1667, 1667, 1667, 1667]);
}
{
  // exemplo parecido com a tela do SmartPOS: 678,90 em 6 semanais
  const p = gerarParcelas({ totalCents: 678_90, numParcelas: 6, periodicidade: "SEMANAL", primeiroVencimento: dia("2026-09-05") });
  checa("678,90 em 6 soma 678,90", p.reduce((s, x) => s + x.valorCents, 0), 678_90);
  checa("parcelas diferem no máximo 1 centavo", Math.max(...p.map((x) => x.valorCents)) - Math.min(...p.map((x) => x.valorCents)) <= 1, true);
}
{
  const p = gerarParcelas({ totalCents: 270_00, entradaCents: 90_00, numParcelas: 2, periodicidade: "QUINZENAL", primeiroVencimento: dia("2026-10-20"), vencimentoEntrada: dia("2026-10-10") });
  checa("entrada vem primeiro, '1 de 1'", [p[0].tipo, p[0].numero, p[0].totalParcelas, p[0].valorCents, iso(p[0].vencimento)], ["ENTRADA", 1, 1, 90_00, "2026-10-10"]);
  checa("o resto é dividido nas parcelas", p.slice(1).map((x) => x.valorCents), [90_00, 90_00]);
  checa("quinzenal soma 14 dias", p.slice(1).map((x) => iso(x.vencimento)), ["2026-10-20", "2026-11-03"]);
}
{
  const p = gerarParcelas({ totalCents: 50_00, numParcelas: 1, periodicidade: "MENSAL", primeiroVencimento: dia("2026-10-10") });
  checa("uma parcela só é 'única'", [p.length, p[0].tipo], [1, "UNICA"]);
}
{
  const p = gerarParcelas({ totalCents: 90_00, entradaCents: 30_00, numParcelas: 1, periodicidade: "MENSAL", primeiroVencimento: dia("2026-10-10") });
  checa("entrada + uma parcela", p.map((x) => [x.tipo, x.valorCents]), [["ENTRADA", 30_00], ["UNICA", 60_00]]);
}
lanca("entrada igual ao total é recusada", () => gerarParcelas({ totalCents: 100, entradaCents: 100, numParcelas: 1, periodicidade: "SEMANAL", primeiroVencimento: dia("2026-10-10") }), "entrada");
lanca("total zero é recusado", () => gerarParcelas({ totalCents: 0, numParcelas: 1, periodicidade: "SEMANAL", primeiroVencimento: dia("2026-10-10") }), "maior que zero");
lanca("parcelas demais é recusado", () => gerarParcelas({ totalCents: 1000, numParcelas: 61, periodicidade: "SEMANAL", primeiroVencimento: dia("2026-10-10") }), "1 a 60");

// ------------------------------------------------------------ datas
checa("mensal: 31/01 → 28/02 → 31/03 (não encadeia)", [0, 1, 2].map((i) => iso(vencimentoDaParcela(dia("2026-01-31"), "MENSAL", i))), ["2026-01-31", "2026-02-28", "2026-03-31"]);
checa("mensal cruza o ano", iso(vencimentoDaParcela(dia("2026-11-15"), "MENSAL", 2)), "2027-01-15");
checa("semanal soma 7 dias", iso(vencimentoDaParcela(dia("2026-10-10"), "SEMANAL", 3)), "2026-10-31");
checa("vencimento fica ao meio-dia UTC (fuso não empurra o dia)", vencimentoDaParcela(new Date("2026-10-10T01:00:00Z"), "SEMANAL", 0).toISOString(), "2026-10-10T12:00:00.000Z");

// ------------------------------------------------------------ situação
const parcela = (p: Partial<ParcelaEntrada> = {}): ParcelaEntrada => ({
  id: "p1",
  numero: 1,
  tipo: "SEMANAL",
  vencimento: dia("2026-10-10"),
  valorCents: 100_00,
  canceladaEm: null,
  reembolsadaEm: null,
  ...p,
});
{
  const s = situacaoDaParcela(parcela(), []);
  checa("sem recebimento: pendente, saldo cheio", [s.status, s.saldoCents], ["PENDENTE", 100_00]);
}
{
  const s = situacaoDaParcela(parcela(), [{ valorCents: 40_00, recebidoEm: dia("2026-10-05"), meio: "PIX" }]);
  checa("recebimento parcial: segue pendente com saldo", [s.status, s.pagoCents, s.saldoCents], ["PENDENTE", 40_00, 60_00]);
}
{
  const s = situacaoDaParcela(parcela(), [
    { valorCents: 40_00, recebidoEm: dia("2026-10-05"), meio: "PIX" },
    { valorCents: 60_00, recebidoEm: dia("2026-10-08"), meio: "DINHEIRO" },
  ]);
  checa("quitada: paga, com a data e o meio do último recebimento", [s.status, s.saldoCents, iso(s.pagaEm!), s.meio], ["PAGA", 0, "2026-10-08", "DINHEIRO"]);
}
{
  const s = situacaoDaParcela(parcela({ canceladaEm: dia("2026-10-06") }), []);
  checa("cancelada não deve nada", [s.status, s.saldoCents], ["CANCELADA", 0]);
  const r = situacaoDaParcela(parcela({ reembolsadaEm: dia("2026-10-09") }), [
    { valorCents: 100_00, recebidoEm: dia("2026-10-08"), meio: "PIX" },
    { valorCents: -100_00, recebidoEm: dia("2026-10-09"), meio: "PIX" },
  ]);
  checa("reembolsada: status próprio, nada a receber", [r.status, r.saldoCents, r.pagoCents], ["REEMBOLSADA", 0, 0]);
}

// ------------------------------------------------------------ ordem e alocação
{
  const lista = ordenarParaQuitar([
    { tipo: "SEMANAL" as const, vencimento: dia("2026-11-10"), numero: 2 },
    { tipo: "SEMANAL" as const, vencimento: null, numero: 3 },
    { tipo: "SEMANAL" as const, vencimento: dia("2026-10-10"), numero: 1 },
    { tipo: "ENTRADA" as const, vencimento: dia("2026-12-01"), numero: 1 },
  ]);
  checa("entrada primeiro, depois vencimento, sem prazo no fim", lista.map((x) => `${x.tipo}${x.numero}`), ["ENTRADA1", "SEMANAL1", "SEMANAL2", "SEMANAL3"]);
}
{
  const abertas = [
    { id: "a", tipo: "ENTRADA" as const, vencimento: dia("2026-10-01"), numero: 1, saldoCents: 50_00 },
    { id: "b", tipo: "SEMANAL" as const, vencimento: dia("2026-10-08"), numero: 1, saldoCents: 100_00 },
    { id: "c", tipo: "SEMANAL" as const, vencimento: dia("2026-10-15"), numero: 2, saldoCents: 100_00 },
  ];
  checa("pagamento maior que uma parcela transborda para a seguinte", alocarRecebimento(abertas, 120_00), [
    { parcelaId: "a", valorCents: 50_00 },
    { parcelaId: "b", valorCents: 70_00 },
  ]);
  checa("parcela escolhida é quitada primeiro", alocarRecebimento(abertas, 100_00, "c"), [{ parcelaId: "c", valorCents: 100_00 }]);
  checa("sobra da escolhida segue a ordem normal", alocarRecebimento(abertas, 130_00, "c"), [
    { parcelaId: "c", valorCents: 100_00 },
    { parcelaId: "a", valorCents: 30_00 },
  ]);
  lanca("receber mais do que se deve é recusado", () => alocarRecebimento(abertas, 251_00), "maior que o saldo");
  lanca("valor zero é recusado", () => alocarRecebimento(abertas, 0), "maior que zero");
  checa("parcela sem saldo não recebe", alocarRecebimento([...abertas, { id: "d", tipo: "SEMANAL", vencimento: dia("2026-09-01"), numero: 9, saldoCents: 0 }], 10_00), [{ parcelaId: "a", valorCents: 10_00 }]);
}

// ------------------------------------------------------------ caixa
{
  const r = resumoDoCaixa({
    valorInicialCents: 200_00,
    recebimentos: [
      { valorCents: 150_00, meio: "DINHEIRO" },
      { valorCents: 80_00, meio: "DINHEIRO" },
      { valorCents: -30_00, meio: "DINHEIRO" }, // estorno
      { valorCents: 300_00, meio: "PIX" },
      { valorCents: 120_00, meio: "CARTAO" },
      { valorCents: 10_00, meio: null },
    ],
    movimentos: [
      { tipo: "SUPRIMENTO", valorCents: 50_00 },
      { tipo: "SANGRIA", valorCents: 100_00 },
      { tipo: "DESPESA", valorCents: 25_00 },
    ],
  });
  checa("dinheiro líquido do estorno", r.recebidoDinheiroCents, 200_00);
  checa("esperado = inicial + dinheiro + suprimento − sangria − despesa", r.esperadoDinheiroCents, 200_00 + 200_00 + 50_00 - 100_00 - 25_00);
  checa("PIX e cartão não entram na gaveta", [r.porMeio.PIX, r.porMeio.CARTAO], [300_00, 120_00]);
  checa("total recebido soma todos os meios", r.totalRecebidoCents, 150_00 + 80_00 - 30_00 + 300_00 + 120_00 + 10_00);
  checa("sem meio informado vira OUTRO", r.porMeio.OUTRO, 10_00);
}
{
  const r = resumoDoCaixa({ valorInicialCents: 0, recebimentos: [], movimentos: [] });
  checa("caixa vazio espera zero", r.esperadoDinheiroCents, 0);
}
{
  const r = resumoDoCaixa({ valorInicialCents: 100_00, recebimentos: [{ valorCents: 50_00, meio: "DINHEIRO" }], movimentos: [], saidasDinheiroCents: 30_00 });
  checa("pagamento a fornecedor em dinheiro sai da gaveta", [r.esperadoDinheiroCents, r.pagamentosAFornecedoresCents], [120_00, 30_00]);
}

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
