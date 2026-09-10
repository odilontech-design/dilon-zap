"use client";

import { useEffect, useState } from "react";

/**
 * Cores dos gráficos de relatório.
 *
 * Slots 1 a 3 da paleta categórica, em ordem fixa. Nunca cicla e nunca é
 * escolhida por tamanho: a cor acompanha a entidade ("Resolvidas" é sempre a
 * mesma cor), não a posição no ranking. Sem isso, um filtro que muda a ordem
 * repintaria tudo e a leitura da semana passada deixaria de valer.
 *
 * Conferidas com o validador contra a superfície real do app:
 *
 *   claro  (#ffffff): faixa de luminosidade, croma, separação para daltonismo
 *                     (pior par ΔE 9.2) e visão normal (ΔE 24.0) — passam.
 *                     Aviso: o verde-água fica em 2,82:1 de contraste, abaixo
 *                     de 3:1. Por isso todo gráfico aqui carrega rótulo
 *                     escrito e tabela ao lado — é a compensação exigida.
 *   escuro (#1a1d21): passa em tudo, inclusive contraste.
 *
 * Os dois modos são escolhidos, não invertidos automaticamente: são os mesmos
 * três matizes reajustados para a superfície escura.
 */

export type ModoCor = "claro" | "escuro";

const SLOTS = {
  claro: ["#2a78d6", "#eb6834", "#1baf7a"],
  escuro: ["#3987e5", "#d95926", "#199e70"],
} as const;

export function coresDoModo(modo: ModoCor) {
  return SLOTS[modo];
}

/**
 * Qual tema está valendo agora.
 *
 * Lê o mesmo `data-theme` que o resto do app usa, e cai no preferido do
 * sistema quando ninguém escolheu. Precisa rodar no cliente: no servidor não
 * existe nem o atributo nem a preferência do navegador.
 */
export function modoAtual(): ModoCor {
  if (typeof document === "undefined") return "claro";
  const marcado = document.documentElement.getAttribute("data-theme");
  if (marcado === "dark") return "escuro";
  if (marcado === "light") return "claro";
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/**
 * As cores do tema em vigor, acompanhando a troca.
 *
 * Começa sempre em "claro" e corrige depois da montagem — mesmo cuidado do
 * ThemeToggle: ler o DOM durante a renderização faria o servidor e o cliente
 * produzirem HTML diferente e quebraria a hidratação.
 *
 * O observador existe porque o toggle troca o atributo sem recarregar a
 * página. Sem ele, os gráficos ficariam com as cores do tema anterior até a
 * próxima navegação — visível justamente no escuro, onde o contraste some.
 */
export function useCoresGrafico() {
  const [modo, setModo] = useState<ModoCor>("claro");

  useEffect(() => {
    setModo(modoAtual());

    const observador = new MutationObserver(() => setModo(modoAtual()));
    observador.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observador.disconnect();
  }, []);

  return coresDoModo(modo);
}
