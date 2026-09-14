// Regra da nova senha. Puro. Rodar com: npx tsx apps/web/lib/senha.test-manual.ts
import { problemaNaSenha } from "./senha";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`
  );
}

checa("senha boa passa", problemaNaSenha("girassol-azul-7", "12345678"), null);
checa("curta não passa", problemaNaSenha("abc123", "12345678"), "a nova senha precisa de pelo menos 8 caracteres");
checa("exatamente 8 passa", problemaNaSenha("piano#42", "12345678"), null);
checa("igual à atual não passa", problemaNaSenha("girassol-azul-7", "girassol-azul-7"), "a nova senha precisa ser diferente da atual");
checa(
  "a provisória de sempre não passa, mesmo trocando de outra",
  problemaNaSenha("12345678", "outra-senha-qualquer"),
  "essa senha é fácil demais de adivinhar — escolha outra"
);
checa("óbvia com maiúscula também não", problemaNaSenha("Senha123", "12345678"), "essa senha é fácil demais de adivinhar — escolha outra");
checa("longa demais (bcrypt corta em 72 bytes)", problemaNaSenha("a".repeat(73), "12345678"), "a nova senha é longa demais");
checa("72 caracteres cabe", problemaNaSenha("b".repeat(72), "12345678"), null);
checa(
  "acento conta em bytes, não em letras",
  problemaNaSenha("é".repeat(37), "12345678"),
  "a nova senha é longa demais"
);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
