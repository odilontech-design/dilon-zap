"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/**
 * A faixa do menu do estilo clássico, presa no topo ao rolar. Quando a faixa da cor da loja
 * (com o logo) sai da tela, o logo aparece à esquerda do menu, num bloco da cor da loja:
 * a marca continua à vista o tempo todo.
 */
export function MenuFixo({ logo, nome, inicio, children }: { logo: string | null; nome: string; inicio: string; children: React.ReactNode }) {
  const marco = useRef<HTMLDivElement>(null);
  const [fixo, setFixo] = useState(false);
  useEffect(() => {
    const el = marco.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(([e]) => setFixo(!e.isIntersecting));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <>
      <div ref={marco} aria-hidden className="h-px" />
      <nav aria-label="Menu da loja" className="sticky top-0 z-20 hidden shadow-md md:block" style={{ background: "var(--loja2)", color: "var(--loja)" }}>
        <div className="mx-auto flex max-w-6xl items-stretch px-4">
          <Link
            href={inicio}
            aria-label={`${nome}: página inicial`}
            tabIndex={fixo ? 0 : -1}
            className={`flex shrink-0 items-center overflow-hidden transition-all duration-300 ${fixo ? "mr-3 max-w-[200px] px-4 opacity-100" : "max-w-0 px-0 opacity-0"}`}
            style={{ background: "var(--loja)", color: "var(--loja-texto)" }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" className="h-9 w-auto max-w-[160px] object-contain" />
            ) : (
              <span className="whitespace-nowrap text-sm font-extrabold uppercase">{nome}</span>
            )}
          </Link>
          {children}
        </div>
      </nav>
    </>
  );
}
