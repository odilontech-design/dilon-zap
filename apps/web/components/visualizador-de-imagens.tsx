"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Galeria das imagens de uma conversa, como no WhatsApp Web.
 *
 * Clicar numa imagem abre ela grande, e dali dá pra andar pelas outras imagens
 * da MESMA conversa sem voltar e procurar na rolagem — que era o que acontecia
 * antes, com a imagem presa no tamanho do balão e o print ilegível.
 *
 * Só imagem entra na faixa. Áudio e documento não têm o que ampliar, e vídeo
 * ficaria preso num player dentro de um visualizador de foto.
 */

export type ImagemDaConversa = {
  id: string;
  /** Legenda, quando houver. */
  body: string;
  createdAt: string;
  /** Nome de quem enviou, pra situar a imagem no atendimento. */
  autor: string | null;
};

export function VisualizadorDeImagens({
  imagens,
  abertaId,
  onTrocar,
  onFechar,
}: {
  imagens: ImagemDaConversa[];
  abertaId: string;
  onTrocar: (id: string) => void;
  onFechar: () => void;
}) {
  const indice = imagens.findIndex((i) => i.id === abertaId);
  const atual = indice >= 0 ? imagens[indice] : null;
  const faixaRef = useRef<HTMLDivElement>(null);

  const ir = useCallback(
    (passo: number) => {
      if (indice < 0) return;
      const proximo = imagens[indice + passo];
      if (proximo) onTrocar(proximo.id);
    },
    [imagens, indice, onTrocar]
  );

  // Teclado antes do mouse: quem está conferindo várias imagens seguidas passa
  // por elas com a seta, não mirando numa setinha na tela.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
      else if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ir, onFechar]);

  // A miniatura da imagem aberta entra em vista sozinha — numa conversa com
  // trinta prints, a faixa estaria rolada longe da atual.
  useEffect(() => {
    faixaRef.current
      ?.querySelector('[data-aberta="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [abertaId]);

  if (!atual) return null;

  const src = `/api/messages/${atual.id}/media`;
  const quando = new Date(atual.createdAt).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Visualizador de imagens"
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{atual.autor ?? "Imagem"}</p>
          <p className="text-xs text-white/60">
            {quando}
            {imagens.length > 1 && ` · ${indice + 1} de ${imagens.length}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <a
            href={`${src}?download=1`}
            className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
            title="Baixar"
            aria-label="Baixar imagem"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
          </a>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
            title="Abrir em outra aba"
            aria-label="Abrir imagem em outra aba"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" />
            </svg>
          </a>
          <button
            onClick={onFechar}
            className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
            title="Fechar (Esc)"
            aria-label="Fechar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Clicar no vazio fecha, igual ao WhatsApp Web. O clique na própria
          imagem não fecha — é onde a pessoa aproxima pra ler o print. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={onFechar}>
        {indice > 0 && (
          <SetaDeNavegacao lado="esquerda" onClick={() => ir(-1)} />
        )}

        {/* eslint-disable-next-line @next/next/no-img-element -- vem via redirect assinado do R2, sem domínio fixo */}
        <img
          src={src}
          alt={atual.body || "imagem da conversa"}
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full object-contain"
        />

        {indice < imagens.length - 1 && (
          <SetaDeNavegacao lado="direita" onClick={() => ir(1)} />
        )}
      </div>

      {atual.body && (
        <p className="shrink-0 px-6 pb-2 text-center text-sm text-white/80">{atual.body}</p>
      )}

      {imagens.length > 1 && (
        <div ref={faixaRef} className="flex shrink-0 gap-2 overflow-x-auto px-4 py-3">
          {imagens.map((img) => {
            const aberta = img.id === atual.id;
            return (
              <button
                key={img.id}
                data-aberta={aberta}
                onClick={() => onTrocar(img.id)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded border-2 ${
                  aberta ? "border-accent" : "border-transparent opacity-60 hover:opacity-100"
                }`}
                aria-label={`Ver imagem de ${new Date(img.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
              >
                {/* lazy: a miniatura baixa o arquivo em tamanho real (não há
                    miniatura gerada no servidor). Sem isto, abrir o
                    visualizador numa conversa com trinta prints puxaria os
                    trinta de uma vez. Assim só desce o que está à vista. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
                <img
                  src={`/api/messages/${img.id}/media`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SetaDeNavegacao({ lado, onClick }: { lado: "esquerda" | "direita"; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white/80 hover:bg-black/70 hover:text-white ${
        lado === "esquerda" ? "left-4" : "right-4"
      }`}
      aria-label={lado === "esquerda" ? "Imagem anterior" : "Próxima imagem"}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={lado === "esquerda" ? "M15 18 9 12l6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}
