"use client";

import { useId } from "react";

/**
 * Símbolo da marca Dilon Tech: o 'D' segmentado em polígonos (dados, módulos
 * de software, processos organizados) atravessado pela seta ascendente
 * projetada pro quadrante superior direito (crescimento, ganho de eficiência).
 * Ver Manual de Identidade Visual v1.0, seção 2.
 *
 * Sem o círculo Deep Navy da versão avatar: a 28px (tamanho no menu recolhido)
 * o 'D' azul sobre o azul-marinho perdia contraste e sobrava só a seta. Solto,
 * o 'D' pega o fundo da barra e volta a ser reconhecível no tamanho pequeno.
 *
 * Os cortes de segmentação são vazados por máscara, não pintados por cima.
 * Pintar exigiria saber a cor do fundo — e a barra principal é branca enquanto
 * a do painel admin é quase preta, onde traços brancos viravam riscos berrantes.
 * Vazando, o corte simplesmente mostra o que estiver atrás.
 *
 * O teal é #00C9AE e não o Electric Teal #00F5D4 do manual: o valor original é
 * claro demais pra ficar legível sobre branco, que é o fundo da barra principal.
 * Mesma matiz, só rebaixado o suficiente pra funcionar nos dois fundos.
 */
export function DilonMark({ className = "w-7 h-7" }: { className?: string }) {
  // Dois DilonMark coexistem no DOM (cabeçalho mobile e barra lateral); IDs
  // fixos colidiriam e um pegaria o gradiente/máscara do outro.
  const uid = useId().replace(/:/g, "");

  return (
    <svg viewBox="0 0 48 48" className={`${className} shrink-0`} role="img" aria-label="Dilon Tech">
      <defs>
        <linearGradient id={`dilon-d-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3B86DA" />
          <stop offset="100%" stopColor="#1B5FA6" />
        </linearGradient>
        <mask id={`dilon-cuts-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <path d="M6 24h9M21 6l-6 8.5" stroke="#000" strokeWidth="2" fill="none" />
        </mask>
      </defs>

      {/* 'D': contorno externo e contraforma no mesmo path, evenodd vaza o miolo. */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill={`url(#dilon-d-${uid})`}
        mask={`url(#dilon-cuts-${uid})`}
        d="M6 6h15C31.5 6 39 13.6 39 24s-7.5 18-18 18H6V6zm9 8.5v19h6c5.4 0 9-3.7 9-9.5s-3.6-9.5-9-9.5h-6z"
      />

      {/* Seta ascendente cruzando o símbolo. */}
      <path
        d="M4 40C14 37 26 29 34 14"
        fill="none"
        stroke="#00C9AE"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path d="M41 7 29 10.5l8 8z" fill="#00C9AE" />
    </svg>
  );
}
