// Simulador de financiamento (conta, validações e texto). Rodar de apps/web com: npx tsx lib/financiamento.test-manual.ts
import { lerPercentual, lerReais, parcelaPrice, simular, textoDaSimulacao } from "./financiamento";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

// valores conferidos à parte (fórmula Price: PV·i / (1 − (1+i)^−n))
checa("R$ 50.000 a 1,5% em 36x = R$ 1.807,62", parcelaPrice(5_000_000, 1.5, 36), 180_762);
checa("R$ 40.000 a 1,9% em 48x = R$ 1.277,68", parcelaPrice(4_000_000, 1.9, 48), 127_768);
checa("taxa zero divide igualmente", parcelaPrice(1_200_000, 0, 12), 100_000);

const s = simular({ precoCents: 7_000_000, entradaCents: 2_000_000, taxaMensalPct: 1.5 });
checa("simulação: financia o preço menos a entrada, com os 5 prazos", s.ok && [s.financiadoCents, s.linhas.map((l) => l.meses)], [5_000_000, [12, 24, 36, 48, 60]]);
checa("simulação: 36x bate com a conta e o total e os juros fecham", s.ok && (() => { const l = s.linhas[2]; return [l.parcelaCents, l.totalPagoCents === l.parcelaCents * 36, l.jurosCents === l.totalPagoCents - 5_000_000]; })(), [180_762, true, true]);
checa("quanto maior o prazo, menor a parcela e maiores os juros", s.ok && s.linhas.every((l, i, a) => i === 0 || (l.parcelaCents < a[i - 1].parcelaCents && l.jurosCents > a[i - 1].jurosCents)), true);

checa("sem preço: recusa", simular({ precoCents: 0, entradaCents: 0, taxaMensalPct: 1.5 }).ok, false);
checa("entrada igual ao preço: recusa", simular({ precoCents: 1_000_000, entradaCents: 1_000_000, taxaMensalPct: 1.5 }).ok, false);
checa("taxa em branco (NaN): recusa", simular({ precoCents: 1_000_000, entradaCents: 0, taxaMensalPct: NaN }).ok, false);
checa("taxa absurda (15% ao mês): recusa", simular({ precoCents: 1_000_000, entradaCents: 0, taxaMensalPct: 15 }).ok, false);
checa("entrada negativa: recusa", simular({ precoCents: 1_000_000, entradaCents: -1, taxaMensalPct: 1 }).ok, false);

checa("lerReais: formatos do dia a dia", [lerReais("55.000,50"), lerReais("55000"), lerReais("R$ 1.234,00"), lerReais(""), lerReais("abc")], [5_500_050, 5_500_000, 123_400, 0, 0]);
checa("lerPercentual: vírgula, ponto e vazio", [lerPercentual("1,8"), lerPercentual("1.8"), Number.isNaN(lerPercentual("")), Number.isNaN(lerPercentual("x"))], [1.8, 1.8, true, true]);

if (s.ok) {
  const t = textoDaSimulacao({ carro: "Fiat Argo 2022/2023", precoCents: 7_000_000, entradaCents: 2_000_000, taxaMensalPct: 1.5, financiadoCents: s.financiadoCents, linhas: s.linhas });
  checa("texto: diz que é estimativa, mostra a taxa usada e as 5 parcelas", [/estimativa/.test(t), /1,5% ao mês/.test(t), (t.match(/\dx de R\$/g) ?? []).length, /não é aprovação de crédito/.test(t)], [true, true, 5, true]);
  checa("texto sem carro não tem linha vazia no topo", textoDaSimulacao({ carro: null, precoCents: 100, entradaCents: 0, taxaMensalPct: 1, financiadoCents: 100, linhas: [] }).split("\n")[1].startsWith("Valor do carro"), true);
}
console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
