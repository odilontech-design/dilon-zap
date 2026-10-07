/**
 * CPF e CNPJ: validação de verdade, pelos dígitos verificadores.
 *
 * Puro e com teste porque é a única barreira entre um cadastro aproveitável e
 * lixo. O formulário de autocadastro fica numa página pública alimentada por
 * tráfego pago — ou seja, robô vai achar. Conferir só o tamanho deixaria
 * passar "11111111111", e a Dilon Tech descobriria na hora de emitir a nota.
 *
 * O dígito verificador não prova que o documento existe, nem que é de quem
 * preencheu. Prova que não foi digitado ao acaso, que é o que dá pra saber sem
 * consultar a Receita.
 */

export type TipoDeDocumento = "CPF" | "CNPJ";

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

/**
 * Soma ponderada do módulo 11, que é a conta por trás dos dois documentos.
 * Pesos diferentes, mesma mecânica — escrever duas vezes era onde o erro ia
 * se esconder.
 */
function digitoModulo11(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((s, d, i) => s + d * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11) return false;
  // Todos os dígitos iguais passam na conta do módulo 11 — "111.111.111-11" é
  // matematicamente válido. São os primeiros que um robô escreve.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const n = d.split("").map(Number);
  const primeiro = digitoModulo11(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoModulo11(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === n[9] && segundo === n[10];
}

export function cnpjValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;

  const n = d.split("").map(Number);
  const primeiro = digitoModulo11(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoModulo11(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === n[12] && segundo === n[13];
}

/** O tipo pelo tamanho, quando o documento é válido. Senão, null. */
export function tipoDoDocumento(valor: string): TipoDeDocumento | null {
  if (cpfValido(valor)) return "CPF";
  if (cnpjValido(valor)) return "CNPJ";
  return null;
}

export function documentoValido(valor: string): boolean {
  return tipoDoDocumento(valor) !== null;
}

/**
 * Pontuado pra leitura humana. Guardamos só os dígitos; a pontuação é coisa
 * de tela, e guardar formatado faria "67.211.588/0001-01" e "67211588000101"
 * serem dois cadastros diferentes do mesmo CNPJ.
 */
export function formatarDocumentoBR(valor: string): string {
  const d = somenteDigitos(valor);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return valor;
}
