// Regras da revenda de veículos. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/veiculos-regras.test-manual.ts
import {
  custoTotal,
  diasEmEstoque,
  diferencaFipe,
  faixaDeEstoque,
  fichaParaCliente,
  margem,
  normalizarPlaca,
  placaValida,
  podeMudarStatus,
  reaisParaCentavos,
  restanteDaVenda,
} from "./veiculos-regras";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
function erro(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

const entrada = new Date("2026-09-01T12:00:00Z");
checa("dias em estoque até hoje", diasEmEstoque(entrada, null, new Date("2026-11-11T15:00:00Z")), 71);
checa("vendido conta até a saída", diasEmEstoque(entrada, new Date("2026-09-21T09:00:00Z"), new Date("2027-01-01")), 19);
checa("nunca negativo", diasEmEstoque(new Date("2026-12-01"), null, new Date("2026-11-01")), 0);

checa("faixa 29 dias", faixaDeEstoque(29), "novo");
checa("faixa 30 dias", faixaDeEstoque(30), "atencao");
checa("faixa 60 dias", faixaDeEstoque(60), "parado");
checa("faixa 90 dias", faixaDeEstoque(90), "critico");

checa("custo soma gastos", custoTotal([5000000, 80000, 35000], null), 5115000);
checa("consignado soma o repasse", custoTotal([20000], 4000000), 4020000);
checa("margem e percentual", margem(6000000, 5115000), { valorCents: 885000, percentual: 14.8 });
checa("margem com comissão", margem(6000000, 5115000, 100000), { valorCents: 785000, percentual: 13.1 });
checa("margem negativa", margem(5000000, 5200000).valorCents, -200000);
checa("FIPE acima", diferencaFipe(6300000, 6000000), 5);
checa("FIPE abaixo", diferencaFipe(5700000, 6000000), -5);
checa("sem FIPE", diferencaFipe(5700000, null), null);

checa(
  "restante: preço − troca − sinal − entrada − financiado",
  restanteDaVenda({ precoCents: 8000000, trocaCents: 3000000, sinalCents: 100000, entradaCents: 900000, financiadoCents: 3000000 }),
  1000000
);
checa("à vista fecha em zero", restanteDaVenda({ precoCents: 8000000, trocaCents: 0, sinalCents: 0, entradaCents: 8000000, financiadoCents: 0 }), 0);
checa(
  "passa do preço",
  erro(() => restanteDaVenda({ precoCents: 8000000, trocaCents: 0, sinalCents: 0, entradaCents: 5000000, financiadoCents: 4000000 })),
  "troca, sinal, entrada e financiamento passam do preço de venda"
);
checa(
  "troca maior que o carro",
  erro(() => restanteDaVenda({ precoCents: 3000000, trocaCents: 4000000, sinalCents: 0, entradaCents: 0, financiadoCents: 0 })),
  "a troca vale mais que o carro vendido: lance a diferença como compra"
);
checa("valor quebrado", erro(() => restanteDaVenda({ precoCents: 100.5, trocaCents: 0, sinalCents: 0, entradaCents: 0, financiadoCents: 0 })), "precoCents: valor inválido");

checa("placa antiga com traço", normalizarPlaca("abc-1234"), "ABC1234");
checa("placa Mercosul", placaValida("BRA2E19"), true);
checa("placa inválida", placaValida("AB12345"), false);
checa("placa vazia", normalizarPlaca(" - "), null);

checa("status: preparação → disponível", podeMudarStatus("PREPARACAO", "DISPONIVEL", "COMPRA"), true);
checa("status: vendido não volta pela ficha", podeMudarStatus("VENDIDO", "DISPONIVEL", "COMPRA"), false);
checa("status: devolver só consignado", podeMudarStatus("DISPONIVEL", "DEVOLVIDO", "COMPRA"), false);
checa("status: devolver consignado", podeMudarStatus("DISPONIVEL", "DEVOLVIDO", "CONSIGNACAO"), true);

checa("R$ com milhar e centavos", reaisParaCentavos("R$ 85.900,50"), 8590050);
checa("só milhar com ponto", reaisParaCentavos("85.900"), 8590000);
checa("número simples", reaisParaCentavos("85900"), 8590000);
checa("vazio", reaisParaCentavos(""), null);

const ficha = fichaParaCliente({
  marca: "Chevrolet",
  modelo: "Onix",
  versao: "LT 1.0",
  anoFabricacao: 2021,
  anoModelo: 2022,
  km: 41250,
  cambio: "Manual",
  combustivel: "Flex",
  cor: "Prata",
  opcionais: ["Ar", "Direção elétrica"],
  precoCents: 7490000,
  placa: "BRA2E19",
});
checa("ficha não mostra placa inteira", ficha.includes("BRA2E19"), false);
checa("ficha tem nome e preço", ficha.split("\n").slice(0, 2), ["*Chevrolet Onix LT 1.0 2021/2022*", "💰 R$\u00a074.900,00"]);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
