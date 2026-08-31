"use client";

import { useState } from "react";

/**
 * Captura de tela do sistema, numa moldura de janela.
 *
 * Some sozinha se o arquivo não existir. É o que deixa a página de login
 * completa antes das imagens entrarem: quem coloca o PNG em
 * `public/telas/` vê a captura aparecer sem tocar em código, e enquanto não
 * houver arquivo ninguém vê ícone de imagem quebrada em produção.
 */
export function TelaDoSistema({
  src,
  alt,
  legenda,
}: {
  src: string;
  alt: string;
  legenda?: string;
}) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return null;

  return (
    <figure className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-surface shadow-sm">
        {/* Barra da janela: dá contexto de "isto é um sistema" sem precisar
            que a captura inclua o navegador inteiro. */}
        <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- arquivo estático em public/, sem otimização remota */}
        <img
          src={src}
          alt={alt}
          onError={() => setFalhou(true)}
          className="block w-full"
          loading="lazy"
        />
      </div>
      {legenda && <figcaption className="text-xs text-neutral-500">{legenda}</figcaption>}
    </figure>
  );
}
