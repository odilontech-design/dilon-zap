/**
 * Regra da senha que a pessoa escolhe pra própria conta. Pura, com teste.
 *
 * Não é política de complexidade (maiúscula, símbolo, número): isso só
 * empurra todo mundo pro "Senha@123". O que barra aqui é o que de fato vaza —
 * senha curta, igual à anterior, e as poucas que todo mundo tenta primeiro,
 * inclusive a provisória que costuma ser usada no cadastro.
 */

export const SENHA_MINIMO = 8;
// Limite do bcrypt: o que passa de 72 bytes é ignorado em silêncio, e a pessoa
// acharia que a parte final da senha conta.
export const SENHA_MAXIMO = 72;

const OBVIAS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "87654321",
  "00000000",
  "11111111",
  "12341234",
  "senha123",
  "senha1234",
  "password",
  "abcd1234",
  "qwerty123",
  "mudar123",
  "trocar123",
]);

/** Motivo pelo qual a nova senha não serve, ou null se serve. */
export function problemaNaSenha(nova: string, atual: string): string | null {
  if (nova.length < SENHA_MINIMO) return `a nova senha precisa de pelo menos ${SENHA_MINIMO} caracteres`;
  if (new TextEncoder().encode(nova).length > SENHA_MAXIMO) return "a nova senha é longa demais";
  if (nova === atual) return "a nova senha precisa ser diferente da atual";
  if (OBVIAS.has(nova.toLowerCase())) return "essa senha é fácil demais de adivinhar — escolha outra";
  return null;
}
