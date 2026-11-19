// Conta da venda da loja online que vira pedido (itens + frete − desconto). Pura, sem banco e sem rede.
// Rodar com: npx tsx apps/web/lib/venda-do-site.test-manual.ts
import { totalDaVenda } from "./venda-do-site-total";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`);
}

const item = (precoUnitCents: number, quantidade: number) => ({ codigo: "x", nome: "x", quantidade, precoUnitCents });

// 2 × 45,90 + 1 × 30,00 = 121,80; frete 15,00; desconto 5,00 → 131,80
checa(
  "itens + frete − desconto",
  totalDaVenda({ itens: [item(4590, 2), item(3000, 1)], freteCents: 1500, descontoCents: 500 }),
  { subtotalCents: 13680, descontoCents: 500, totalCents: 13180 }
);
checa(
  "sem frete e sem desconto",
  totalDaVenda({ itens: [item(1000, 3)], freteCents: 0, descontoCents: 0 }),
  { subtotalCents: 3000, descontoCents: 0, totalCents: 3000 }
);
checa(
  "desconto maior que tudo zera o total, nunca negativo (pago só com carteira)",
  totalDaVenda({ itens: [item(1000, 1)], freteCents: 0, descontoCents: 5000 }),
  { subtotalCents: 1000, descontoCents: 1000, totalCents: 0 }
);

console.log(falhas ? `\n${falhas} falha(s)` : "\ntudo certo");
process.exit(falhas ? 1 : 0);
