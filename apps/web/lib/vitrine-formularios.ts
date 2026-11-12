/** Telefone digitado num formulário público → só dígitos com DDI 55, ou null se não parece um número brasileiro. */
export function telefoneDoVisitante(texto: string): string | null {
  const digitos = texto.replace(/\D/g, "");
  const telefone = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  return telefone.length >= 12 && telefone.length <= 13 ? telefone : null;
}
