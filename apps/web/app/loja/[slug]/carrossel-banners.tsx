"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Banner = { id: string; titulo: string | null; link: string | null; temCelular: boolean };

/**
 * Os banners do topo da página inicial (como no site antigo da loja): passam sozinhos a cada
 * 6 segundos, param com o mouse em cima, têm setas e bolinhas, e trocam para a imagem de
 * celular quando a loja enviou uma. A primeira imagem carrega na hora; as outras, depois.
 */
export function CarrosselDeBanners({ slug, banners }: { slug: string; banners: Banner[] }) {
  const [i, setI] = useState(0);
  const [parado, setParado] = useState(false);
  const n = banners.length;
  useEffect(() => {
    if (n < 2 || parado) return;
    const t = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(t);
  }, [n, parado]);
  if (!n) return null;
  const url = (b: Banner, celular = false) => `/api/loja/${slug}/banner/${b.id}${celular ? "?celular=1" : ""}`;
  return (
    <section aria-roledescription="carrossel" aria-label="Destaques da loja" className="relative w-full overflow-hidden bg-neutral-900" onMouseEnter={() => setParado(true)} onMouseLeave={() => setParado(false)}>
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/6] lg:aspect-[16/5]">
        {banners.map((b, j) => {
          const imagem = (
            <picture>
              {b.temCelular && <source media="(max-width: 640px)" srcSet={url(b, true)} />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url(b)} alt={b.titulo ?? ""} loading={j === 0 ? "eager" : "lazy"} fetchPriority={j === 0 ? "high" : undefined} className="absolute inset-0 h-full w-full object-cover" />
            </picture>
          );
          return (
            <div key={b.id} aria-hidden={j !== i} className={`absolute inset-0 transition-opacity duration-700 ${j === i ? "opacity-100" : "pointer-events-none opacity-0"}`}>
              {b.link ? (
                b.link.startsWith("/") ? <Link href={b.link} aria-label={b.titulo ?? "Ver"} tabIndex={j === i ? 0 : -1}>{imagem}</Link> : <a href={b.link} target="_blank" rel="noreferrer" aria-label={b.titulo ?? "Ver"} tabIndex={j === i ? 0 : -1}>{imagem}</a>
              ) : (
                imagem
              )}
            </div>
          );
        })}
      </div>
      {n > 1 && (
        <>
          <button type="button" aria-label="Banner anterior" onClick={() => setI((x) => (x - 1 + n) % n)} className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl text-white hover:bg-black/60">‹</button>
          <button type="button" aria-label="Próximo banner" onClick={() => setI((x) => (x + 1) % n)} className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-xl text-white hover:bg-black/60">›</button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-2">
            {banners.map((b, j) => (
              <button key={b.id} type="button" aria-label={`Ir para o banner ${j + 1}`} aria-current={j === i} onClick={() => setI(j)} className={`h-2.5 rounded-full transition-all ${j === i ? "w-6 bg-white" : "w-2.5 bg-white/50"}`} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
