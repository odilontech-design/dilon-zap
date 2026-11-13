"use client";

import { useState } from "react";
import Link from "next/link";

/** Menu do celular: botão de três barras que abre a lista de páginas (no desktop o menu fica à vista). */
export function MenuMovel({ itens, claro }: { itens: { rotulo: string; href: string; ativo: boolean }[]; claro: boolean }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="md:hidden">
      <button type="button" aria-label={aberto ? "Fechar menu" : "Abrir menu"} aria-expanded={aberto} onClick={() => setAberto(!aberto)} className={`flex h-11 w-11 items-center justify-center rounded-full ${claro ? "text-neutral-900 hover:bg-neutral-100" : "text-white hover:bg-white/10"}`}>
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {aberto ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {aberto && (
        <nav aria-label="Menu da loja" className={`absolute inset-x-0 top-full z-30 border-t shadow-xl ${claro ? "border-neutral-200 bg-white text-neutral-900" : "border-white/10 bg-[var(--loja-mais-escuro)] text-white"}`}>
          <ul className="mx-auto flex max-w-6xl flex-col px-4 py-2">
            {itens.map((i) => (
              <li key={i.href}>
                <Link href={i.href} onClick={() => setAberto(false)} aria-current={i.ativo ? "page" : undefined} className={`flex items-center justify-between py-3.5 text-base ${i.ativo ? "font-semibold" : "opacity-90"}`} style={i.ativo ? { color: "var(--loja2)" } : undefined}>
                  {i.rotulo}
                  <span aria-hidden>›</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
