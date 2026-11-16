/**
 * O carro como cada portal deve ver: o preço e o texto "dos classificados" (quando a loja pôs
 * um diferente do site) e, por cima, o ajuste daquele portal ("Diferente em algum portal" no
 * cadastro). Sem ajuste, é o mesmo preço e texto do site. O hash do anúncio é calculado sobre o
 * resultado, então mudar um ajuste reenvia só ao portal afetado.
 */
export type PortalComAjuste = "OLX" | "WEBMOTORS" | "MOBIAUTO" | "NAPISTA";

type ComPreco = {
  precoCents: number;
  descricao: string | null;
  precoClassificadosCents?: number | null;
  descricaoClassificados?: string | null;
  ajustesPorPortal?: unknown;
};

export function paraOPortal<T extends ComPreco>(v: T, portal: PortalComAjuste): T {
  const ajustes = (v.ajustesPorPortal && typeof v.ajustesPorPortal === "object" ? v.ajustesPorPortal : {}) as Record<string, { precoCents?: number; descricao?: string } | undefined>;
  const a = ajustes[portal];
  const precoCents = (a?.precoCents && a.precoCents > 0 ? a.precoCents : null) ?? (v.precoClassificadosCents && v.precoClassificadosCents > 0 ? v.precoClassificadosCents : null) ?? v.precoCents;
  const descricao = a?.descricao?.trim() || v.descricaoClassificados?.trim() || v.descricao;
  return { ...v, precoCents, descricao };
}
