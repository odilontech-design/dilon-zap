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
      reciboChavePix: null,
      reciboOcultarTelefone: false,
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
  // Já virou "Acréscimo nos itens". Não vira mais: preço negociado acima da
  // tabela é só o preço, e chamar a diferença de acréscimo fazia o comprovante
  // parecer cobrança a mais (relatado pela Guttierres, em honorário contábil).
  checa("preço acima da tabela sai pelo próprio preço, sem acréscimo", totais(r), [
    ["Subtotal", "R$ 55,00"],
    ["TOTAL", "R$ 55,00"],
  ]);
  checa("preço acima da tabela não põe ajuste na linha do item", r.itens[0].ajuste, null);
  checa("linha do item mostra o preço cobrado", n(r.itens[0].detalhe), "1 x R$ 55,00");
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

// Chave PIX: só sai no pedido que fechou como PIX a pagar e ainda não foi
// quitado. No já pago seria convite a pagar de novo; no boleto, ruído.
const comChave = { reciboChavePix: "12.345.678/0001-90" };
checa(
  "PIX a pagar e em aberto: chave sai no recibo",
  montarRecibo(
    entrada({ empresa: comChave, pedido: { paymentMethod: "PIX_PENDENTE", pago: false, pagoEm: null } })
  ).pagamento.find((l) => l.rotulo === "Chave PIX")?.valor,
  "12.345.678/0001-90"
);
checa(
  "PIX já pago: chave não sai",
  montarRecibo(entrada({ empresa: comChave, pedido: { paymentMethod: "PIX", pago: true } })).pagamento.some(
    (l) => l.rotulo === "Chave PIX"
  ),
  false
);
checa(
  "boleto em aberto: chave não sai",
  montarRecibo(
    entrada({ empresa: comChave, pedido: { paymentMethod: "BOLETO", pago: false, pagoEm: null } })
  ).pagamento.some((l) => l.rotulo === "Chave PIX"),
  false
);
checa(
  "PIX a pagar sem chave cadastrada: linha some em vez de sair vazia",
  montarRecibo(
    entrada({ empresa: { reciboChavePix: null }, pedido: { paymentMethod: "PIX_PENDENTE", pago: false, pagoEm: null } })
  ).pagamento.some((l) => l.rotulo === "Chave PIX"),
  false
);
checa(
  "PIX a pagar sai como PIX pro cliente, sem 'pendente'",
  montarRecibo(
    entrada({ empresa: comChave, pedido: { paymentMethod: "PIX_PENDENTE", pago: false, pagoEm: null } })
  ).pagamento.find((l) => l.rotulo === "Forma de pagamento")?.valor,
  "PIX"
);

// Nome no recibo: o apelido da agenda do WhatsApp não pode virar o nome
// impresso quando a empresa tem razão social cadastrada.
checa(
  "razão social vence o nome do WhatsApp",
  montarRecibo(entrada({ cliente: { nome: "Paulo | PDUARTE", nomeNoRecibo: "Duarte Com. de Alimentos Ltda" } }))
    .cliente[0],
  { rotulo: "Cliente", valor: "Duarte Com. de Alimentos Ltda" }
);
checa(
  "sem razão social, segue o nome do contato",
  montarRecibo(entrada({ cliente: { nome: "Paulo | PDUARTE", nomeNoRecibo: null } })).cliente[0],
  { rotulo: "Cliente", valor: "Paulo | PDUARTE" }
);
checa(
  "razão social só com espaços não vence o nome do contato",
  montarRecibo(entrada({ cliente: { nome: "Paulo", nomeNoRecibo: "   " } })).cliente[0],
  { rotulo: "Cliente", valor: "Paulo" }
);
checa(
  "telefone oculto some do bloco do cliente",
  montarRecibo(entrada({ empresa: { reciboOcultarTelefone: true } })).cliente.some(
    (l) => l.rotulo === "Telefone"
  ),
  false
);
checa(
  "telefone oculto não derruba o resto do bloco",
  montarRecibo(
    entrada({
      empresa: { reciboOcultarTelefone: true },
      cliente: { nomeNoRecibo: "Empresa Exemplo Ltda", documento: "12345678000190" },
    })
  ).cliente,
  [
    { rotulo: "Cliente", valor: "Empresa Exemplo Ltda" },
    { rotulo: "CPF/CNPJ", valor: "12.345.678/0001-90" },
  ]
);

// Serviço cobrado acima da tabela: o preço negociado É o preço. Nada de
// "Acréscimo", que fazia o comprovante da Guttierres parecer cobrança a mais.
const servicoAcimaDaTabela = entrada({
  pedido: {
    itens: [
      { nomeProduto: "Honorário Contábil - Outubro", precoTabelaCents: 35000, precoUnitCents: 50000, quantidade: 1 },
    ],
    subtotalCents: 50000,
    descontoCents: 0,
    totalCents: 50000,
  },
});
const itemNegociado = montarRecibo(servicoAcimaDaTabela).itens[0];
checa(
  "item acima da tabela sai pelo preço cobrado",
  { ...itemNegociado, detalhe: n(itemNegociado.detalhe), total: n(itemNegociado.total) },
  { nome: "Honorário Contábil - Outubro", detalhe: "1 x R$ 500,00", total: "R$ 500,00", ajuste: null }
);
checa(
  "item acima da tabela não gera linha de acréscimo nos totais",
  montarRecibo(servicoAcimaDaTabela).totais.map((t) => t.rotulo),
  ["Subtotal", "TOTAL"]
);
checa(
  "subtotal impresso bate com o cobrado",
  n(montarRecibo(servicoAcimaDaTabela).totais.find((t) => t.rotulo === "Subtotal")?.valor),
  "R$ 500,00"
);
// Desconto segue intacto: é o caso da Believe, e ver o abatimento é o ponto.
const comDesconto = entrada({
  pedido: {
    itens: [{ nomeProduto: "Sérum", precoTabelaCents: 10000, precoUnitCents: 8000, quantidade: 2 }],
    subtotalCents: 16000,
    descontoCents: 0,
    totalCents: 16000,
  },
});
checa(
  "item abaixo da tabela ainda mostra desconto",
  n(montarRecibo(comDesconto).itens[0].ajuste),
  "Desconto - R$ 40,00"
);
checa(
  "desconto nos itens continua somado à parte",
  montarRecibo(comDesconto).totais.map((t) => `${t.rotulo}=${n(t.valor)}`),
  ["Subtotal=R$ 200,00", "Desconto nos itens=- R$ 40,00", "TOTAL=R$ 160,00"]
);
// Um de cada no mesmo pedido: a conta tem que continuar fechando.
checa(
  "desconto e preço negociado no mesmo pedido fecham o subtotal",
  montarRecibo(
    entrada({
      pedido: {
        itens: [
          { nomeProduto: "Honorário", precoTabelaCents: 35000, precoUnitCents: 50000, quantidade: 1 },
          { nomeProduto: "Sérum", precoTabelaCents: 10000, precoUnitCents: 8000, quantidade: 2 },
        ],
        subtotalCents: 66000,
        descontoCents: 0,
        totalCents: 66000,
      },
    })
  ).totais.map((t) => `${t.rotulo}=${n(t.valor)}`),
  ["Subtotal=R$ 700,00", "Desconto nos itens=- R$ 40,00", "TOTAL=R$ 660,00"]
);

// QR do PIX: existe só quando o cliente de fato precisa pagar por PIX.
const pixPendente = {
  empresa: { reciboChavePix: "67211588000101" },
  pedido: { paymentMethod: "PIX_PENDENTE" as const, pago: false, pagoEm: null },
};
const valorDoQr = (r: ReturnType<typeof montarRecibo>) => {
  const codigo = r.pixCopiaECola;
  if (!codigo) return null;
  // Lê o campo 54 (valor) percorrendo os campos, igual faria o app do banco.
  let i = 0;
  while (i < codigo.length) {
    const id = codigo.slice(i, i + 2);
    const tam = Number(codigo.slice(i + 2, i + 4));
    if (id === "54") return codigo.slice(i + 4, i + 4 + tam);
    i += 4 + tam;
  }
  return null;
};

// A fixture padrão já vem quitada, então o saldo precisa existir de verdade.
const pixEmAberto = {
  ...pixPendente,
  pedido: { ...pixPendente.pedido, totalCents: 55000, pagamentos: [] },
};
checa(
  "PIX a pagar em aberto gera o copia e cola",
  typeof montarRecibo(entrada(pixEmAberto)).pixCopiaECola,
  "string"
);
checa(
  "o copia e cola gerado carrega a chave cadastrada",
  montarRecibo(entrada(pixEmAberto)).pixCopiaECola?.includes("67211588000101"),
  true
);
checa("PIX já pago não gera QR", montarRecibo(entrada({ pedido: { paymentMethod: "PIX", pago: true } })).pixCopiaECola, null);
checa(
  "boleto em aberto não gera QR",
  montarRecibo(entrada({ ...pixPendente, pedido: { ...pixPendente.pedido, paymentMethod: "BOLETO" } })).pixCopiaECola,
  null
);
checa(
  "sem chave cadastrada não gera QR",
  montarRecibo(entrada({ ...pixPendente, empresa: { reciboChavePix: null } })).pixCopiaECola,
  null
);
// O valor do QR é o SALDO: pagamento parcial não pode fazer o cliente pagar
// de novo a parte que já quitou.
checa(
  "QR usa o total quando nada foi pago",
  valorDoQr(montarRecibo(entrada({ ...pixPendente, pedido: { ...pixPendente.pedido, totalCents: 55000, pagamentos: [] } }))),
  "550.00"
);
checa(
  "QR usa o saldo quando houve pagamento parcial",
  valorDoQr(
    montarRecibo(
      entrada({
        ...pixPendente,
        pedido: { ...pixPendente.pedido, totalCents: 55000, pagamentos: [{ valorCents: 20000 }] },
      })
    )
  ),
  "350.00"
);
checa(
  "saldo zerado não gera QR",
  montarRecibo(
    entrada({
      ...pixPendente,
      pedido: { ...pixPendente.pedido, totalCents: 55000, pagamentos: [{ valorCents: 55000 }] },
    })
  ).pixCopiaECola,
  null
);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
