"use client";

import { useEffect, useRef, useState } from "react";

export type AcaoDoMenu = { rotulo: React.ReactNode; onClick: () => void; perigo?: boolean };

/**
 * Botão "⋯" com as ações secundárias de uma linha de tabela. Existe para a
 * coluna de ações não empurrar a tabela para fora da tela (Produtos tinha
 * quatro botões lado a lado e o último sumia cortado).
 *
 * A lista abre em posição FIXA, calculada a partir do botão: dentro de um
 * container com overflow-x-auto, um menu absoluto seria cortado pela borda
 * da própria tabela. Fecha ao clicar fora, rolar ou redimensionar.
 */
export function MenuAcoes({ acoes, rotulo = "Mais ações" }: { acoes: AcaoDoMenu[]; rotulo?: string }) {
  const botaoRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    const fechar = (e: Event) => {
      if (e.type === "mousedown" && (menuRef.current?.contains(e.target as Node) || botaoRef.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    document.addEventListener("mousedown", fechar);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fechar);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
      document.removeEventListener("keydown", tecla);
    };
  }, [pos]);

  function alternar() {
    if (pos) return setPos(null);
    const r = botaoRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={alternar}
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        className="rounded-md px-2 py-0.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800 leading-none text-lg"
      >
        ⋯
      </button>
      {pos && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: pos.top, right: pos.right }}
          className="fixed z-50 min-w-[160px] rounded-md border border-neutral-200 bg-surface py-1 shadow-lg text-sm text-left"
        >
          {acoes.map((a, i) => (
            <button
              key={i}
              role="menuitem"
              type="button"
              onClick={() => {
                setPos(null);
                a.onClick();
              }}
              className={`block w-full px-3 py-2 text-left hover:bg-neutral-50 ${a.perigo ? "text-red-600" : "text-neutral-700"}`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
