import Link from "next/link";
import { LOGOS_DE_MARCAS } from "@/lib/marcas-logos";
import { slugDe, type GrupoDeCarros } from "@/lib/vitrine-seo";

/** "GM - Chevrolet", "VW" e afins para a chave do símbolo. */
const APELIDOS: Record<string, string> = { vw: "volkswagen", gm: "chevrolet", "gm-chevrolet": "chevrolet", "chevrolet-gm": "chevrolet", "mercedes-benz": "mercedes", "land-rover": "landrover", "alfa-romeo": "alfaromeo", "aston-martin": "astonmartin", "rolls-royce": "rollsroyce", ds: "dsautomobiles" };

export function chaveDaMarca(marca: string): string {
  const s = slugDe(marca);
  return APELIDOS[s] ?? s;
}

/** O símbolo da montadora (SVG inline) ou, sem ele, as iniciais da marca num círculo. */
export function LogoDaMarca({ marca, className = "h-8 w-8" }: { marca: string; className?: string }) {
  const logo = LOGOS_DE_MARCAS[chaveDaMarca(marca)];
  if (logo) {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={marca} className={className} fill="currentColor">
        <path d={logo.path} />
      </svg>
    );
  }
  const iniciais = marca.split(/[\s-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  return (
    <span aria-label={marca} className={`${className} inline-flex items-center justify-center rounded-full border-2 border-current text-[10px] font-bold leading-none`}>
      {iniciais || "?"}
    </span>
  );
}

/** A faixa "procure por marca": um toque leva à página daquela montadora (que também é página de SEO). */
export function FaixaDeMarcas({ slug, grupos }: { slug: string; grupos: GrupoDeCarros[] }) {
  if (grupos.length < 2) return null;
  return (
    <section aria-label="Procure por marca" className="mx-auto w-full max-w-6xl px-4 pt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-neutral-500">Procure por marca</h2>
      <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {grupos.map((g) => (
          <li key={g.marcaSlug} className="snap-start">
            <Link href={`/loja/${slug}/marca/${g.marcaSlug}`} className="group flex h-24 w-28 flex-col items-center justify-center gap-2 rounded-2xl border border-neutral-200 bg-surface text-neutral-700 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--loja)] hover:text-[var(--loja)] hover:shadow-md">
              <LogoDaMarca marca={g.marca} className="h-9 w-9" />
              <span className="max-w-full truncate px-2 text-xs font-medium">
                {g.marca} <span className="text-neutral-400">· {g.n}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
