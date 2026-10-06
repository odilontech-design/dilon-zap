// Por qual número a empresa envia. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/whatsapp-sessions.test-manual.ts
import { escolherNumero } from "./whatsapp-sessions";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido   ${JSON.stringify(obtido)}\n        esperado ${JSON.stringify(esperado)}`}`
  );
}

const geral = { id: "num-geral", setorId: null };
const financeiro = { id: "num-financeiro", setorId: "setor-fin" };
const fiscal = { id: "num-fiscal", setorId: "setor-fiscal" };

// Empresa com um número só: todo mundo manda por ele, com ou sem setor.
checa("um número só, usuário sem setor", escolherNumero([geral], []), geral);
checa("um número só, usuário com setor", escolherNumero([geral], ["setor-fin"]), geral);

// O caso da Guttierres: linha do financeiro separada da linha de atendimento.
checa("financeiro manda pela linha do financeiro", escolherNumero([geral, financeiro], ["setor-fin"]), financeiro);
checa("atendente de outro setor manda pela linha geral", escolherNumero([geral, financeiro], ["setor-fiscal"]), geral);
checa("usuário sem setor nenhum manda pela linha geral", escolherNumero([geral, financeiro], []), geral);
checa(
  "quem está nos dois setores manda pela linha do setor que tem número",
  escolherNumero([geral, financeiro], ["setor-fiscal", "setor-fin"]),
  financeiro
);

// A ordem dos números no banco não pode mudar quem envia.
checa("ordem invertida não muda a escolha", escolherNumero([financeiro, geral], ["setor-fin"]), financeiro);
checa("ordem invertida, usuário de fora", escolherNumero([financeiro, geral], ["setor-fiscal"]), geral);

// Dois setores com número próprio e nenhum geral.
checa("cada setor na sua linha", escolherNumero([financeiro, fiscal], ["setor-fiscal"]), fiscal);
checa(
  "sem linha geral, usuário de fora cai na primeira — melhor enviar torto que não enviar",
  escolherNumero([financeiro, fiscal], ["setor-rh"]),
  financeiro
);

checa("empresa sem número nenhum", escolherNumero([], ["setor-fin"]), null);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
