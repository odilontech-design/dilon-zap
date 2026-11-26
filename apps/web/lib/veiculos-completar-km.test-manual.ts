// Apoios da tela "Completar" (colar lista, CSV, avisos de km). Puro: sem banco.
// Rodar com: npx tsx --tsconfig tsconfig.json lib/veiculos-completar-km.test-manual.ts
import { avisoDeKm, csvDaLista, kmRepetidos, lerKm, lerListaColada } from "./veiculos-completar-km";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

checa("km com ponto, espaço e 'km'", [lerKm("45.300"), lerKm("45 300"), lerKm("45300 km"), lerKm("")], [45300, 45300, 45300, null]);
checa("km inválida", [lerKm("abc"), lerKm("12345678")], [undefined, undefined]);

const carros = [{ id: "a", placa: "LSE7D72" }, { id: "b", placa: "KRR-4E42" }, { id: "c", placa: null }];
const r = lerListaColada("LSE7D72\t84203\nkrr4e42;45.300 km\nXYZ9A99 1000\nsem placa aqui\nLSE7D72 abc\n\n", carros);
checa("preenche pela placa (com ou sem hífen, maiúscula ou minúscula)", r.preenchidos, { a: "84203", b: "45300" });
checa("placa que não está na lista", r.semCarro, ["XYZ9A99"]);
checa("linhas sem placa ou com km ruim", r.invalidas, ["sem placa aqui", "LSE7D72 abc"]);

const csv = csvDaLista([{ placa: "LSE7D72", nome: "Honda HR-V 2016" }, { placa: null, nome: 'Carro "x"; teste' }]);
checa("CSV: cabeçalho, BOM e escape", [csv.startsWith("﻿Placa;Carro;Km"), csv.includes('"Carro ""x""; teste"')], [true, true]);

checa("km baixíssima em carro usado avisa", /muito baixa/.test(avisoDeKm(1, 2015, 2026) ?? ""), true);
checa("km normal não avisa", avisoDeKm(84203, 2015, 2026), null);
checa("carro do ano com km baixa não avisa", avisoDeKm(10, 2026, 2026), null);
checa("mesmo km em muitos carros é sinal de valor padrão", kmRepetidos([1, 1, 1, 1, 52000, 80000]), { km: 1, quantos: 4 });
checa("poucos repetidos não alerta", kmRepetidos([1, 1, 50000, 70000]), null);

if (falhas) {
  console.log(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\ntudo certo");
