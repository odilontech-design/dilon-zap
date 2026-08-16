"use client";

import { useEffect, useState } from "react";

export type Tema = "claro" | "escuro";

export const TEMA_KEY = "dilonzap:tema";

/**
 * Aplica o tema no <html>. Fica fora do componente porque o script anti-flash
 * do layout precisa fazer exatamente a mesma coisa antes do React existir —
 * se as duas lógicas divergirem, a tela pisca na cor errada ao carregar.
 */
export function aplicarTema(tema: Tema) {
  document.documentElement.dataset.theme = tema === "escuro" ? "dark" : "light";
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // Começa em "claro" e corrige depois da montagem. Ler o localStorage no
  // estado inicial quebraria a hidratação: no servidor ele não existe, então
  // o HTML renderizado lá e o do cliente sairiam diferentes.
  const [tema, setTema] = useState<Tema>("claro");

  useEffect(() => {
    const salvo = window.localStorage.getItem(TEMA_KEY);
    setTema(salvo === "escuro" ? "escuro" : "claro");
  }, []);

  function alternar() {
    setTema((atual) => {
      const proximo: Tema = atual === "claro" ? "escuro" : "claro";
      window.localStorage.setItem(TEMA_KEY, proximo);
      aplicarTema(proximo);
      return proximo;
    });
  }

  const escuro = tema === "escuro";
  const rotulo = escuro ? "Mudar para modo dia" : "Mudar para modo noite";

  return (
    <button
      onClick={alternar}
      aria-label={rotulo}
      title={rotulo}
      className={`flex items-center gap-2 rounded-md text-neutral-500 hover:text-accent hover:bg-neutral-100 ${
        compact ? "justify-center w-7 h-7" : "px-2 py-1.5 -ml-2"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 shrink-0"
        aria-hidden
      >
        {escuro ? (
          // Sol: está escuro, o clique leva pro dia.
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          // Lua: está claro, o clique leva pra noite.
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        )}
      </svg>
      {!compact && <span className="text-xs">{escuro ? "Modo dia" : "Modo noite"}</span>}
    </button>
  );
}
