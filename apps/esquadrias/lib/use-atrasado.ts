"use client";

import { useEffect, useState } from "react";

/**
 * Devolve `valor` só depois que ele para de mudar por `ms` milissegundos.
 *
 * Usado nas buscas: a chave do SWR muda a cada tecla, e sem isso digitar
 * "Silva" fazia cinco consultas ao servidor (cinco execuções cobradas na
 * Vercel) para mostrar só o último resultado.
 */
export function useAtrasado<T>(valor: T, ms = 350): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}
