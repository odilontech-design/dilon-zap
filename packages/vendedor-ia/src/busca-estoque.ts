/**
 * A busca do estoque que o Vendedor IA faz não pode depender de acento: o cliente escreve "citroen", o modelo da IA
 * escreve "Citroën" e o cadastro tem "Citroen" — e o `contains` do banco ignora maiúsculas, mas não acentos. Foi assim
 * que um C3 disponível "sumiu" e a IA disse ao cliente que tinha errado (Sales, 25/11).
 */

/** Minúsculas e sem acento: "Citroën" → "citroen". */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export type CarroParaBusca = { marca: string; modelo: string; versao?: string | null };

/**
 * Todas as palavras do texto precisam aparecer na marca, no modelo ou na versão (cada uma em qualquer um deles), e a
 * marca pedida precisa estar na marca do carro. Sem acento e sem diferença de maiúsculas.
 */
export function combinaComABusca(c: CarroParaBusca, palavras: string[], marca: string | null): boolean {
  const campos = [c.marca, c.modelo, c.versao ?? ""].map(semAcento);
  if (marca && !semAcento(c.marca).includes(semAcento(marca))) return false;
  return palavras.every((p) => {
    const q = semAcento(p);
    return !q || campos.some((campo) => campo.includes(q));
  });
}
