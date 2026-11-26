import assert from "node:assert/strict";
import test from "node:test";
import { centavos, dinheiroDaEntrada, dataDaCelula, lerPlanilhaDeVendas, marcaDoModelo, separarModelo, somaDosValores, telefoneDoComprador } from "./importar-vendas";
import type { AbaLida } from "./xlsx-leitor";

// Dados inventados: nada daqui é de cliente real.
const CAB = ["DATA DA VENDA", "PLACA", "VEICULO", "MODELO/ANO", "RENAVAM", "CHASSI", "COR", "NOME DO COMPRADOR", "ENDEREÇO", "TELEFONE", "RG", "CPF", "VALOR FINANCIADO", "ENTRADA", "FINANCEIRA", "PRAZO", "PARCELA", "ENTREGUE?", "KM"];
const linha = (o: Partial<Record<string, string | number>> = {}) => [
  46024, "ABC1D23", "POLO CL ADA", "2018/2019", "123", "9BWZZZ", "PRATA", "MARIA TESTE", "RUA A 1", "(21) 99999-0000", "12345", "12345678901", "R$:30.000,00", "R$:5.000,00 + 2 BOLETOS DE R$:500", "SANTANDER", "48X", "R$:900,00", "SIM", 50000,
].map((v, i) => (o[CAB[i]] !== undefined ? o[CAB[i]]! : v));

test("lê vendas de uma aba mensal e calcula o valor aproximado", () => {
  const abas: AbaLida[] = [{ nome: "JANEIRO", linhas: [CAB, linha()] }, { nome: "TRANSF JANEIRO", linhas: [CAB, linha()] }];
  const r = lerPlanilhaDeVendas(abas);
  assert.deepEqual(r.abasLidas, ["JANEIRO"]);
  assert.equal(r.linhas.length, 1);
  const l = r.linhas[0];
  assert.equal(l.marca, "Volkswagen");
  assert.equal(l.modelo, "Polo");
  assert.equal(l.versao, "CL ADA");
  assert.equal(l.financiadoCents, 3_000_000);
  assert.equal(l.entradaCents, 500_000); // o boleto não entra
  assert.equal(l.precoCents, 3_500_000);
  assert.equal(l.banco, "Santander");
  assert.equal(l.telefone, "5521999990000");
  assert.equal(l.cpf, "123.456.789-01");
  assert.equal(l.data.toISOString().slice(0, 10), "2026-01-02");
});

test("aceita data em texto, cabeçalho de data em branco e aponta linhas ruins", () => {
  const cabBranco = ["  ", ...CAB.slice(1)];
  const r = lerPlanilhaDeVendas([
    { nome: "MARÇO", linhas: [cabBranco, linha({ "DATA DA VENDA": 46083 })] },
    { nome: "ABRIL", linhas: [CAB, linha({ "DATA DA VENDA": "01/04/2026" }), linha({ TELEFONE: "123" }), linha({ PLACA: "XX" }), linha({ "DATA DA VENDA": "" })] },
  ]);
  assert.equal(r.linhas.length, 3);
  assert.equal(r.linhas[1].data.toISOString().slice(0, 10), "2026-04-01");
  assert.equal(r.problemas.length, 2);
  assert.equal(r.linhas.every((l) => l.dataExata), false);
});

test("auxiliares", () => {
  assert.equal(centavos("R$:68.384,80"), 6_838_480);
  assert.equal(somaDosValores("R$:4.000,00 + 2 BOLETOS DE R$:500"), 450_000);
  assert.equal(dinheiroDaEntrada("R$:4.000,00 + 2 BOLETOS DE R$:500"), 400_000);
  assert.deepEqual(separarModelo("NOVO UNO WAY"), { modelo: "Novo Uno", versao: "WAY" });
  assert.equal(marcaDoModelo("NOVA SAVEIRO CS"), "Volkswagen");
  assert.equal(marcaDoModelo("XYZ"), "Outra marca");
  assert.equal(telefoneDoComprador("21 99999-0000"), "5521999990000");
  assert.equal(telefoneDoComprador("123"), null);
  assert.equal(dataDaCelula("31/02/2026"), null);
});
