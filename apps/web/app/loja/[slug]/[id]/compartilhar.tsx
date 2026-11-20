"use client";

import { useState } from "react";

/** Copiar o link ou abrir o compartilhamento do celular: quem gosta de um carro quase sempre manda para alguém. */
export function Compartilhar({ url, titulo }: { url: string; titulo: string }) {
  const [copiado, setCopiado] = useState(false);
  async function compartilhar() {
    try {
      if (navigator.share) return void (await navigator.share({ title: titulo, url }));
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // o usuário fechou o compartilhamento: nada a fazer
    }
  }
  return (
    <button type="button" onClick={compartilhar} className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v14" />
      </svg>
      {copiado ? "Link copiado!" : "Compartilhar"}
    </button>
  );
}
