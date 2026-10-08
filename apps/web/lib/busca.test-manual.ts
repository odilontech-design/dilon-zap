// Busca em lista já carregada: acento, maiúscula e várias palavras.
// Rodar com: npx tsx apps/web/lib/busca.test-manual.ts
import { casaComBusca, normalizarParaBusca } from "./busca";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

checa("normaliza acento e caixa", normalizarParaBusca("  Relatórios - Iara  "), "relatorios - iara");
checa("normaliza cedilha e til", normalizarParaBusca("AÇÃO São"), "acao sao");

// O caso do uso real: nomes de grupo com acento.
checa("sem acento acha com acento", casaComBusca("Relatórios - Bruna Velez", "relatorios"), true);
checa("com acento acha sem acento", casaComBusca("Relatorios - Bruna", "relatórios"), true);
checa("maiúscula não importa", casaComBusca("Agenda de cirurgias", "AGENDA"), true);
checa("pedaço no meio da palavra", casaComBusca("Agenda de cirurgias", "irurg"), true);

checa("busca vazia casa tudo", casaComBusca("qualquer coisa", ""), true);
checa("busca só de espaços casa tudo", casaComBusca("qualquer coisa", "   "), true);

// Várias palavras: todas precisam aparecer, em qualquer ordem.
checa("duas palavras, na ordem", casaComBusca("Relatórios - Bruna Velez", "relatorios bruna"), true);
checa("duas palavras, fora de ordem", casaComBusca("Relatórios - Bruna Velez", "velez relatorios"), true);
checa("uma palavra presente e outra ausente não casa", casaComBusca("Relatórios - Bruna", "bruna iara"), false);

checa("não casa o que não está lá", casaComBusca("Agenda de cirurgias", "financeiro"), false);
checa("emoji no nome não atrapalha", casaComBusca("Relatórios - Iara 🩸", "iara"), true);
checa("buscar o próprio emoji funciona", casaComBusca("Relatórios - Iara 🩸", "🩸"), true);
checa("número no nome", casaComBusca("PRF-SLM - RJ - Rogério R.", "prf slm"), true);
checa("pontuação não é exigida", casaComBusca("Rogério R.", "rogerio r"), true);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
