"use client";

import { useRef, useState } from "react";
import { fotoSrcSet, fotoUrl } from "../comum";

/**
 * Foto grande com miniaturas. Setas do teclado, toque nas laterais e deslizar
 * o dedo trocam a foto. A imagem fica sempre dentro da moldura (posição
 * absoluta): foto de qualquer tamanho não estica a página.
 */
export function Galeria({ slug, fotos, alt }: { slug: string; fotos: string[]; alt: string }) {
  const [i, setI] = useState(0);
  const toque = useRef<number | null>(null);
  if (!fotos.length) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-2xl bg-neutral-100 text-sm text-neutral-400">Fotos em breve</div>;
  }
  const ir = (d: number) => setI((x) => (x + d + fotos.length) % fotos.length);
  return (
    <div className="flex min-w-0 flex-col gap-3" onKeyDown={(e) => (e.key === "ArrowRight" ? ir(1) : e.key === "ArrowLeft" ? ir(-1) : null)} tabIndex={0}>
      <div
        className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-neutral-100 shadow-sm"
        onTouchStart={(e) => (toque.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (toque.current === null) return;
          const dx = e.changedTouches[0].clientX - toque.current;
          toque.current = null;
          if (Math.abs(dx) > 40) ir(dx < 0 ? 1 : -1);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fotoUrl(slug, fotos[i], 1200)}
          srcSet={fotoSrcSet(slug, fotos[i], [800, 1200])}
          sizes="(min-width:1024px) 700px, 100vw"
          fetchPriority={i === 0 ? "high" : undefined}
          decoding="async"
          alt={`${alt} · foto ${i + 1} de ${fotos.length}`}
          className="absolute inset-0 h-full w-full object-cover text-transparent"
        />
        {fotos.length > 1 && (
          <>
            <button aria-label="Foto anterior" onClick={() => ir(-1)} className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70">
              ‹
            </button>
            <button aria-label="Próxima foto" onClick={() => ir(1)} className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-xl text-white hover:bg-black/70">
              ›
            </button>
            <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-2.5 py-0.5 text-xs text-white">
              {i + 1}/{fotos.length}
            </span>
          </>
        )}
      </div>
      {fotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {fotos.map((f, j) => (
            <button key={f} onClick={() => setI(j)} aria-label={`Ver foto ${j + 1}`} aria-current={j === i} className={`relative aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-lg border-2 transition md:w-24 ${j === i ? "border-[var(--loja)]" : "border-transparent opacity-70 hover:opacity-100"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoUrl(slug, f, 240)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover text-transparent" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
