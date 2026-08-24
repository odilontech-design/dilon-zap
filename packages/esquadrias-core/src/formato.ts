/** Formatação de dinheiro e medida, compartilhada entre servidor (PDF/proposta) e telas. */

export function formatarCentavos(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatarReais(centavos: number): string {
  return `R$ ${formatarCentavos(centavos)}`;
}

/**
 * Lê o que o usuário digitou num campo de dinheiro. Aceita "1.234,56",
 * "1234,56" e "1234.56" — o vendedor digita do jeito dele e o sistema não
 * pode transformar mil reais em um real por causa do separador.
 */
export function lerCentavos(texto: string): number {
  const limpo = String(texto ?? "").replace(/[^\d,.-]/g, "").trim();
  if (!limpo) return 0;

  const temVirgula = limpo.includes(",");
  const normalizado = temVirgula ? limpo.replace(/\./g, "").replace(",", ".") : limpo;

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
}

export function formatarMm(mm: number): string {
  return `${Math.round(mm)} mm`;
}

export function formatarM2(m2: number): string {
  return `${m2.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

/**
 * Quantidade de insumo. Peça sai inteira ("4"), granel sai com a fração que a
 * fórmula deu ("0,48 kg", "3,3 m") — sem casas decimais penduradas quando a
 * conta fecha redonda.
 */
export function formatarQuantidade(quantidade: number): string {
  return quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
