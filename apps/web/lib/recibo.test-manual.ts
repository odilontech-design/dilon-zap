// Recibo impresso: contas, formato e o que some quando não está preenchido.
// Puro, sem banco. Dados fictícios — nunca de cliente real.
// Rodar com: npx tsx apps/web/lib/recibo.test-manual.ts
import { montarRecibo, formatarDocumento, type ReciboEntrada } from "./recibo";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`
  );
}

// centsToBRL usa espaço não separável depois do "R$". Normaliza pra comparar.
const n = (s: string | null | undefined) => (s == null ? s : s.replace(/ /g, " "));

function entrada(ajustes: {
  empresa?: Partial<ReciboEntrada["empresa"]>;
  pedido?: Partial<ReciboEntrada["pedido"]>;
  cliente?: Partial<ReciboEntrada["cliente"]>;
} = {}): ReciboEntrada {
  return {
    empresa: {
      nome: "Loja Exemplo",
      reciboNome: null,
      reciboDocumento: null,
      reciboEndereco: null,
      reciboTelefone: null,
      reciboRodape: null,
      reciboLarguraMm: 80,
      timezone: "America/Sao_Paulo",
      ...ajustes.empresa,
    },
    pedido: {
      numero: 42,
      createdAt: new Date("2026-09-11T13:00:00Z"),
      fechadoEm: new Date("2026-09-11T17:32:00Z"), // 14:32 em São Paulo
      paymentMethod: "PIX",
      pago: true,
      pagoEm: new Date("2026-09-11T17:32:00Z"),
      vencimento: null,
      subtotalCents: 10000,
      descontoCents: 0,
      totalCents: 10000,
      observacao: null,
      vendedor: "Ana Teste",
      itens: [{ nomeProduto: "Hidratante Teste 200ml", precoTabelaCents: 5000, precoUnitCents: 5000, quantidade: 2 }],
      pagamentos: [{ valorCents: 10000 }],
      ...ajustes.pedido,
    },
    cliente: { nome: "Maria Fictícia", telefone: "+55 11 90000-0000", documento: null, endereco: null, ...ajustes.cliente },
  };
}

const totais = (r: ReturnType<typeof montarRecibo>) => r.totais.map((t) => [t.rotulo, n(t.valor)]);

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

checa("CPF só com números ganha pontuação e nome", formatarDocumento("12345678909"), "CPF 123.456.789-09");
checa("CPF já pontuado é normalizado", formatarDocumento(" 123.456.789-09 "), "CPF 123.456.789-09");
checa("CNPJ só com números", formatarDocumento("11222333000181"), "CNPJ 11.222.333/0001-81");
checa("texto livre sai como foi escrito", formatarDocumento("MEI 11.222.333/0001-81"), "MEI 11.222.333/0001-81");
checa("número de tamanho estranho não é inventado", formatarDocumento("12345"), "12345");
checa("vazio vira nulo", formatarDocumento("   "), null);

// ---------------------------------------------------------------------------
// Totais
// ---------------------------------------------------------------------------

checa("sem desconto: subtotal e total", totais(montarRecibo(entrada())), [
  ["Subtotal", "R$ 100,00"],
  ["TOTAL", "R$ 100,00"],
]);

{
  // Tabela 50, vendido a 45 cada, 2 unidades: 10 de desconto no item; e mais
  // 5 de desconto no pedido. 100 - 10 - 5 = 85.
  const r = montarRecibo(
    entrada({
      pedido: {
        itens: [{ nomeProduto: "Hidratante Teste 200ml", precoTabelaCents: 5000, precoUnitCents: 4500, quantidade: 2 }],
        subtotalCents: 9000,
        descontoCents: 500,
        totalCents: 8500,
      },
    })
  );
  checa("desconto no item e no pedido aparecem separados, como no SmartPOS", totais(r), [
    ["Subtotal", "R$ 100,00"],
    ["Desconto nos itens", "- R$ 10,00"],
    ["Desconto", "- R$ 5,00"],
    ["TOTAL", "R$ 85,00"],
  ]);
  checa("linha do item a preço de tabela", [r.itens[0].detalhe, r.itens[0].total].map(n), ["2 x R$ 50,00", "R$ 100,00"]);
  checa("linha do item mostra o desconto dela", n(r.itens[0].ajuste), "Desconto - R$ 10,00");
}

{
  const r = montarRecibo(
    entrada({
      pedido: {
        itens: [{ nomeProduto: "Kit Teste", precoTabelaCents: 5000, precoUnitCents: 5500, quantidade: 1 }],
        subtotalCents: 5500,
        totalCents: 5500,
      },
    })
  );
  checa("preço acima da tabela vira acréscimo", totais(r), [
    ["Subtotal", "R$ 50,00"],
    ["Acréscimo nos itens", "+ R$ 5,00"],
    ["TOTAL", "R$ 55,00"],
  ]);
}

{
  const r = montarRecibo(
    entrada({
      pedido: {
        itens: [{ nomeProduto: "Item avulso", precoTabelaCents: 0, precoUnitCents: 3000, quantidade: 1 }],
        subtotalCents: 3000,
        totalCents: 3000,
      },
    })
  );
  checa("item sem preço de tabela não é acréscimo", totais(r), [
    ["Subtotal", "R$ 30,00"],
    ["TOTAL", "R$ 30,00"],
  ]);
  checa("item sem preço de tabela não tem ajuste na linha", r.itens[0].ajuste, null);
}

{
  // Subtotal gravado não bate com os itens: não arrisca o detalhado.
  const r = montarRecibo(
    entrada({
      pedido: {
        itens: [{ nomeProduto: "Hidratante Teste 200ml", precoTabelaCents: 5000, precoUnitCents: 4500, quantidade: 2 }],
        subtotalCents: 9500,
        totalCents: 9500,
      },
    })
  );
  checa("totais divergentes: formato simples, total congelado", totais(r), [
    ["Subtotal", "R$ 95,00"],
    ["TOTAL", "R$ 95,00"],
  ]);
  checa("formato simples: item pelo preço cobrado, sem ajuste", [n(r.itens[0].detalhe), r.itens[0].ajuste], [
    "2 x R$ 45,00",
    null,
  ]);
}

checa(
  "quantidade de itens soma unidades, não linhas",
  montarRecibo(
    entrada({
      pedido: {
        itens: [
          { nomeProduto: "A", precoTabelaCents: 1000, precoUnitCents: 1000, quantidade: 3 },
          { nomeProduto: "B", precoTabelaCents: 2000, precoUnitCents: 2000, quantidade: 2 },
        ],
        subtotalCents: 7000,
        totalCents: 7000,
      },
    })
  ).quantidadeDeItens,
  5
);

// ---------------------------------------------------------------------------
// Pagamento
// ---------------------------------------------------------------------------

{
  const r = montarRecibo(entrada());
  checa("PIX pago na hora: só a forma, sem repetir a data", r.pagamento, [{ rotulo: "Forma de pagamento", valor: "PIX" }]);
  checa("PIX pago na hora: situação PAGO", r.situacao, "PAGO");
}

checa(
  "boleto quitado em outro dia mostra quando",
  montarRecibo(entrada({ pedido: { paymentMethod: "BOLETO", pagoEm: new Date("2026-09-15T15:00:00Z") } })).pagamento,
  [
    { rotulo: "Forma de pagamento", valor: "Boleto" },
    { rotulo: "Pago em", valor: "15/09/2026" },
  ]
);

{
  const r = montarRecibo(
    entrada({
      pedido: {
        paymentMethod: "FIADO",
        pago: false,
        pagoEm: null,
        vencimento: new Date("2026-09-30T15:00:00Z"),
        pagamentos: [{ valorCents: 3000 }],
      },
    })
  );
  checa("fiado com parcela: vencimento, pago e saldo", r.pagamento.map((l) => [l.rotulo, n(l.valor)]), [
    ["Forma de pagamento", "Fiado"],
    ["Vencimento", "30/09/2026"],
    ["Já pago", "R$ 30,00"],
    ["Saldo a pagar", "R$ 70,00"],
  ]);
  checa("fiado: situação PENDENTE", r.situacao, "PENDENTE");
}

checa(
  "fiado sem nada pago não imprime saldo igual ao total",
  montarRecibo(entrada({ pedido: { paymentMethod: "FIADO", pago: false, pagoEm: null, pagamentos: [] } })).pagamento,
  [{ rotulo: "Forma de pagamento", valor: "Fiado" }]
);

// ---------------------------------------------------------------------------
// Data no fuso da empresa
// ---------------------------------------------------------------------------

checa("hora no fuso de São Paulo, não em UTC", montarRecibo(entrada()).dataHora, "11/09/2026 14:32");
checa(
  "venda das 22h não pula pro dia seguinte",
  montarRecibo(entrada({ pedido: { fechadoEm: new Date("2026-09-12T01:10:00Z") } })).dataHora,
  "11/09/2026 22:10"
);
checa(
  "pedido sem data de fechamento usa a de criação",
  montarRecibo(entrada({ pedido: { fechadoEm: null } })).dataHora,
  "11/09/2026 10:00"
);

// ---------------------------------------------------------------------------
// Cabeçalho, cliente e rodapé
// ---------------------------------------------------------------------------

{
  const r = montarRecibo(entrada());
  checa("sem dados de recibo: nome do sistema e mais nada", r.empresa, { nome: "Loja Exemplo", linhas: [] });
  checa("cliente só com o que existe", r.cliente, [
    { rotulo: "Cliente", valor: "Maria Fictícia" },
    { rotulo: "Telefone", valor: "+55 11 90000-0000" },
  ]);
  checa("largura padrão 80 mm", r.larguraMm, 80);
  checa("título com o número do pedido", r.titulo, "Pedido nº 42");
}

{
  const r = montarRecibo(
    entrada({
      empresa: {
        reciboNome: "Exemplo Comércio de Cosméticos LTDA",
        reciboDocumento: "11222333000181",
        reciboEndereco: "Rua Fictícia, 100 - Centro",
        reciboTelefone: "(11) 3000-0000",
        reciboRodape: "Trocas em até 7 dias",
        reciboLarguraMm: 58,
      },
      cliente: { documento: "12345678909", endereco: "Av. Imaginária, 50" },
    })
  );
  checa("razão social no lugar do nome do sistema", r.empresa.nome, "Exemplo Comércio de Cosméticos LTDA");
  checa("linhas do cabeçalho na ordem", r.empresa.linhas, [
    "CNPJ 11.222.333/0001-81",
    "Rua Fictícia, 100 - Centro",
    "(11) 3000-0000",
  ]);
  checa("CPF do cliente sem repetir o rótulo", r.cliente[2], { rotulo: "CPF/CNPJ", valor: "123.456.789-09" });
  checa("endereço do cliente", r.cliente[3], { rotulo: "Endereço", valor: "Av. Imaginária, 50" });
  checa("58 mm respeitado", r.larguraMm, 58);
  checa("rodapé", r.rodape, "Trocas em até 7 dias");
}

checa(
  "largura desconhecida cai no padrão de balcão",
  montarRecibo(entrada({ empresa: { reciboLarguraMm: 76 } })).larguraMm,
  80
);
checa(
  "contato sem nome e sem telefone: bloco do cliente vazio",
  montarRecibo(entrada({ cliente: { nome: "  ", telefone: null } })).cliente,
  []
);
checa("observação em branco some", montarRecibo(entrada({ pedido: { observacao: "  " } })).observacao, null);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
