"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Marca da Dilon Tech.
 *
 * Se o arquivo não estiver em `public/`, cai no nome escrito — nunca some e
 * nunca vira ícone quebrado. A assinatura da empresa é a última coisa que
 * pode falhar numa página que serve de vitrine.
 */
export function LogoDilon({ className = "" }: { className?: string }) {
  const [semArquivo, setSemArquivo] = useState(false);
  const ref = useRef<HTMLImageElement | null>(null);

  // Mesmo motivo do carrossel: o 404 acontece antes da hidratacao, entao o
  // onError nao pega. Confere o estado real depois de montar.
  useEffect(() => {
    const el = ref.current;
    if (el && el.complete && el.naturalWidth === 0) setSemArquivo(true);
  }, []);

  if (semArquivo) {
    return (
      <span className={`text-sm font-semibold tracking-tight ${className}`}>
        Dilon <span className="text-accent">Tech</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- arquivo estático em public/
    <img
      ref={ref}
      src="/dilon-tech.png"
      alt="Dilon Tech"
      onError={() => setSemArquivo(true)}
      className={`h-10 w-auto ${className}`}
    />
  );
}
