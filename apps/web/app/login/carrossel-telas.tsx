"use client";

import { useEffect, useRef, useState } from "react";

export type Tela = { src: string; alt: string; legenda: string };

/**
 * Carrossel com as telas do sistema.
 *
 * Cada slide se remove sozinho se o arquivo não existir, e o carrossel inteiro
 * desaparece se nenhum carregar. É o que permite a página ir pro ar antes das
 * capturas: quem colocar os PNGs em `public/telas/` vê o carrossel aparecer
 * sem tocar em código, e enquanto não houver arquivo ninguém vê imagem
 * quebrada em produção.
 *
 * Sem giro automático de propósito. Isto fica ao lado de um campo de senha que
 * a equipe usa todo dia — movimento no canto do olho a cada cinco segundos
 * atrapalha quem só quer entrar.
 */
export function CarrosselTelas({ telas }: { telas: Tela[] }) {
  const [quebradas, setQuebradas] = useState<string[]>([]);
  const [atual, setAtual] = useState(0);
  const refs = useRef<Record<string, HTMLImageElement | null>>({});

  // O onError sozinho nao basta. O HTML vem pronto do servidor, o navegador
  // comeca a baixar as imagens enquanto ainda le a pagina, e um 404 dispara o
  // erro ANTES de o React hidratar e pendurar o handler — entao o slide
  // quebrado nunca sumia. Aqui, depois de montar, conferimos o que ja falhou:
  // imagem que terminou de carregar com largura zero e imagem que nao veio.
  useEffect(() => {
    const jaFalharam = telas
      .filter((t) => {
        const el = refs.current[t.src];
        return el && el.complete && el.naturalWidth === 0;
      })
      .map((t) => t.src);
    if (jaFalharam.length > 0) {
      setQuebradas((q) => [...new Set([...q, ...jaFalharam])]);
    }
  }, [telas]);

  const validas = telas.filter((t) => !quebradas.includes(t.src));
  if (validas.length === 0) return null;

  const indice = Math.min(atual, validas.length - 1);
  const tela = validas[indice];

  return (
    <figure className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-surface shadow-sm">
        {/* Barra de janela: diz "isto é um sistema" sem a captura precisar
            incluir o navegador inteiro. */}
        <div className="flex items-center gap-1.5 border-b border-neutral-200 bg-neutral-100 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-neutral-300" />
        </div>

        {/* Todas montadas, só a atual visível: trocar de slide não dispara um
            carregamento novo, então não pisca a cada clique. */}
        <div className="relative">
          {validas.map((t, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- arquivo estático em public/
            <img
              key={t.src}
              ref={(el) => { refs.current[t.src] = el; }}
              src={t.src}
              alt={t.alt}
              onError={() => setQuebradas((q) => (q.includes(t.src) ? q : [...q, t.src]))}
              className={`block w-full ${i === indice ? "" : "hidden"}`}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <figcaption className="text-xs text-neutral-500">{tela.legenda}</figcaption>

        {validas.length > 1 && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setAtual((i) => (i - 1 + validas.length) % validas.length)}
              aria-label="Tela anterior"
              className="rounded-md border border-neutral-300 px-2 py-1 text-neutral-600 transition hover:border-accent hover:text-accent"
            >
              <span aria-hidden="true">&larr;</span>
            </button>

            {/* Os pontos são botões, não enfeite: dizem onde você está e levam
                direto pra tela que interessa. */}
            <div className="flex items-center gap-1.5">
              {validas.map((t, i) => (
                <button
                  key={t.src}
                  type="button"
                  onClick={() => setAtual(i)}
                  aria-label={`Ver ${t.legenda}`}
                  aria-current={i === indice}
                  className={`h-2 rounded-full transition-all ${
                    i === indice ? "w-5 bg-accent" : "w-2 bg-neutral-300 hover:bg-neutral-400"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setAtual((i) => (i + 1) % validas.length)}
              aria-label="Próxima tela"
              className="rounded-md border border-neutral-300 px-2 py-1 text-neutral-600 transition hover:border-accent hover:text-accent"
            >
              <span aria-hidden="true">&rarr;</span>
            </button>
          </div>
        )}
      </div>
    </figure>
  );
}
