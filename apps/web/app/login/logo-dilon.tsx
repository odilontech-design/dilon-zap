"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Marca da Dilon Tech: o símbolo do arquivo oficial + o nome escrito.
 *
 * Por que não usar a imagem inteira: no PNG oficial a palavra "Dilon" é
 * BRANCA — ela foi desenhada pra fundo escuro e desaparece por completo no
 * fundo claro desta página. Sobrava um "D" solto e um "Tech" ilegível, porque
 * a arte tem 2000x2000 com muita margem e, reduzida a 40px de altura, o
 * conjunto some.
 *
 * Então recortamos só o símbolo — que é azul e ciano, e portanto legível nos
 * dois temas — e escrevemos o nome ao lado com as cores do tema. O arquivo
 * original fica intacto; o recorte é feito por CSS.
 *
 * Se o arquivo não existir, resta o nome escrito. A assinatura da empresa é a
 * última coisa que pode falhar numa página que serve de vitrine.
 */

// Região do símbolo dentro da arte quadrada de 2000x2000, medida na imagem.
const ARTE = 2000;
const SIMBOLO = { x: 600, y: 290, largura: 800, altura: 770 };
const ALTURA_EXIBIDA = 34;

export function LogoDilon({ className = "" }: { className?: string }) {
  const [semArquivo, setSemArquivo] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  // O onError sozinho não pega: o HTML vem pronto do servidor, o navegador
  // começa a baixar enquanto ainda lê a página, e um 404 dispara o erro antes
  // de o React hidratar. Confere o estado real depois de montar.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setSemArquivo(true);
  }, []);

  const escala = ALTURA_EXIBIDA / SIMBOLO.altura;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {!semArquivo && (
        <span
          className="relative block shrink-0 overflow-hidden"
          style={{ width: SIMBOLO.largura * escala, height: ALTURA_EXIBIDA }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- arquivo estático em public/ */}
          <img
            ref={ref}
            src="/dilon-tech.png"
            alt=""
            aria-hidden="true"
            onError={() => setSemArquivo(true)}
            className="absolute max-w-none"
            style={{
              width: ARTE * escala,
              height: ARTE * escala,
              left: -SIMBOLO.x * escala,
              top: -SIMBOLO.y * escala,
            }}
          />
        </span>
      )}
      <span className="text-base font-semibold tracking-tight text-neutral-900">
        Dilon <span className="text-accent">Tech</span>
      </span>
    </span>
  );
}
