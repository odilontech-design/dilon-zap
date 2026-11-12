"use client";

import { useState } from "react";
import { fotoUrl } from "../comum";

/** Foto grande com as miniaturas embaixo. Setas do teclado e toque nas laterais trocam a foto. */
export function Galeria({ slug, fotos, alt }: { slug: string; fotos: string[]; alt: string }) {
  const [i, setI] = useState(0);
  if (!fotos.length) {
    return <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-neutral-100 text-sm text-neutral-400">Fotos em breve</div>;
  }
  const ir = (d: number) => setI((x) => (x + d + fotos.length) % fotos.length);
  return (
    <div className="flex flex-col gap-2" onKeyDown={(e) => (e.key === "ArrowRight" ? ir(1) : e.key === "ArrowLeft" ? ir(-1) : null)} tabIndex={0}>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoUrl(slug, fotos[i])} alt={`${alt} · foto ${i + 1} de ${fotos.length}`} className="h-full w-full object-cover text-transparent" />
        {fotos.length > 1 && (
          <>
            <button aria-label="Foto anterior" onClick={() => ir(-1)} className="absolute inset-y-0 left-0 w-1/4 text-3xl text-white/0 hover:text-white/90">
              ‹
            </button>
            <button aria-label="Próxima foto" onClick={() => ir(1)} className="absolute inset-y-0 right-0 w-1/4 text-3xl text-white/0 hover:text-white/90">
              ›
            </button>
            <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
              {i + 1}/{fotos.length}
            </span>
          </>
        )}
      </div>
      {fotos.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {fotos.map((f, j) => (
            <button key={f} onClick={() => setI(j)} className={`aspect-[4/3] w-20 shrink-0 overflow-hidden rounded-md border-2 ${j === i ? "border-accent" : "border-transparent"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoUrl(slug, f)} alt="" loading="lazy" className="h-full w-full object-cover text-transparent" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
