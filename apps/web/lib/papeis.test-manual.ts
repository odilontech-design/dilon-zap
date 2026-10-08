// Quem gere o financeiro e o catálogo. Puro.
// Rodar com: npx tsx apps/web/lib/papeis.test-manual.ts
import { ehGerencia } from "./papeis";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `\n        obtido ${JSON.stringify(obtido)} esperado ${JSON.stringify(esperado)}`}`);
}

checa("responsável gere", ehGerencia("OWNER"), true);
checa("financeiro gere", ehGerencia("FINANCEIRO"), true);
// O caso que deu origem à função: a Dilon Tech usa a própria ferramenta e o
// superadmin é o único usuário da empresa dele.
checa("superadmin gere a própria empresa", ehGerencia("SUPERADMIN"), true);

// A consultora só consulta preço e saldo — não negocia valor nem conta estoque.
checa("atendente NÃO gere", ehGerencia("AGENT"), false);

checa("papel desconhecido não gere", ehGerencia("qualquer"), false);
checa("papel vazio não gere", ehGerencia(""), false);
checa("undefined não gere", ehGerencia(undefined), false);
checa("null não gere", ehGerencia(null), false);
// Caixa importa: o papel vem do banco já normalizado, e aceitar "owner" abriria
// uma porta que nenhuma outra parte do sistema reconhece.
checa("caixa diferente não passa", ehGerencia("owner"), false);

console.log(falhas === 0 ? "\nTudo certo." : `\n${falhas} falha(s).`);
if (falhas > 0) process.exit(1);
