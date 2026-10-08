// Formatação pro WhatsApp: marcas e limpeza de texto colado. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/formatar-texto.test-manual.ts
import { aplicarMarca, organizarTexto, precisaOrganizar } from "./formatar-texto";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

// ---------------------------------------------------------------- marcas
const t = "Olá mundo cruel";

checa("negrito numa palavra", aplicarMarca(t, 4, 9, "*"), { texto: "Olá *mundo* cruel", inicio: 5, fim: 10 });
checa("itálico", aplicarMarca(t, 4, 9, "_").texto, "Olá _mundo_ cruel");
checa("tachado", aplicarMarca(t, 4, 9, "~").texto, "Olá ~mundo~ cruel");
checa("código usa três crases", aplicarMarca(t, 4, 9, "```").texto, "Olá ```mundo``` cruel");

// Duplo clique numa palavra costuma levar o espaço junto. "* mundo*" não vira
// negrito no WhatsApp — o asterisco precisa encostar.
checa("espaço no começo da seleção fica fora da marca", aplicarMarca(t, 3, 9, "*").texto, "Olá *mundo* cruel");
checa("espaço no fim da seleção fica fora da marca", aplicarMarca(t, 4, 10, "*").texto, "Olá *mundo* cruel");
checa("só espaços selecionados não muda nada", aplicarMarca("a   b", 1, 4, "*").texto, "a   b");

checa("sem seleção, par vazio com o cursor no meio", aplicarMarca("ab", 1, 1, "*"), {
  texto: "a**b",
  inicio: 2,
  fim: 2,
});

// Apertar de novo desfaz — senão a pessoa que errou o clique tem que apagar à mão.
checa("tira a marca quando ela está dentro da seleção", aplicarMarca("Olá *mundo* cruel", 4, 11, "*").texto, "Olá mundo cruel");
checa("tira a marca quando ela está logo fora da seleção", aplicarMarca("Olá *mundo* cruel", 5, 10, "*").texto, "Olá mundo cruel");
checa("seleção invertida (arrastou pra trás) funciona igual", aplicarMarca(t, 9, 4, "*").texto, "Olá *mundo* cruel");

// ---------------------------------------------------------------- organizar
// O texto exato do print: a IA entregou "\n" escrito, em vez de quebra de linha.
const daIA =
  'Exemplo: "Olá! Sou o assistente da Dilon Tech.\\n1 - Quero conhecer os sistemas\\n2 - Suporte técnico\\n3 - Financeiro"';
checa(
  "\\n escrito vira quebra de linha de verdade",
  organizarTexto(daIA),
  'Exemplo: "Olá! Sou o assistente da Dilon Tech.\n1 - Quero conhecer os sistemas\n2 - Suporte técnico\n3 - Financeiro"'
);

checa("negrito de Markdown vira negrito de WhatsApp", organizarTexto("Isto é **muito** importante"), "Isto é *muito* importante");
checa("vários negritos na mesma linha", organizarTexto("**a** e **b**"), "*a* e *b*");
checa("título de Markdown vira linha em negrito", organizarTexto("## Mapeamento de Filas"), "*Mapeamento de Filas*");
checa("título com ** dentro não vira ***", organizarTexto("# **Plano**"), "*Plano*");
checa("# no meio da frase não é título", organizarTexto("pedido #123 pronto"), "pedido #123 pronto");
checa("** solto, sem par, fica como está", organizarTexto("2 ** 3 = 8"), "2 ** 3 = 8");
checa("** que atravessa linhas não é par", organizarTexto("**abre\nfecha**"), "**abre\nfecha**");

checa("marcador ○ vira •", organizarTexto("○ item um\n● item dois\n▪ item três"), "• item um\n• item dois\n• item três");
checa("marcador mantém a indentação", organizarTexto("  ○ filho"), "• filho");
checa("hífen de lista não é mexido", organizarTexto("- item"), "- item");

checa("quebra do Windows vira simples", organizarTexto("a\r\nb\r\nc"), "a\nb\nc");
checa("espaço no fim de linha sai", organizarTexto("a   \nb\t"), "a\nb");
checa("três ou mais linhas em branco viram uma", organizarTexto("a\n\n\n\n\nb"), "a\n\nb");
checa("uma linha em branco é respeitada", organizarTexto("a\n\nb"), "a\n\nb");
checa("espaço nas pontas do texto sai", organizarTexto("\n\n  oi  \n\n"), "oi");

checa("texto limpo passa igual", organizarTexto("Bom dia! Tudo bem?"), "Bom dia! Tudo bem?");
checa("é estável: organizar duas vezes dá o mesmo", organizarTexto(organizarTexto(daIA)), organizarTexto(daIA));

checa("precisaOrganizar vê o \\n escrito", precisaOrganizar("a\\nb"), true);
checa("precisaOrganizar vê Markdown", precisaOrganizar("**x**"), true);
checa("precisaOrganizar não acusa texto limpo", precisaOrganizar("Bom dia!"), false);
checa("precisaOrganizar não acusa vazio", precisaOrganizar(""), false);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
