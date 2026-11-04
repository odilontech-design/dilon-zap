"use client";

import { useState } from "react";

/**
 * Origem da negociação como lista (Believe, 23/10): escolher entre as que a
 * empresa já usa, ou "+ Nova origem…" para acrescentar uma — que passa a
 * aparecer para todos. Texto livre gerava "insta", "Instagram " e "INSTAGRAM"
 * como três origens diferentes no relatório.
 */
export function CampoOrigem({
  value,
  onChange,
  origens,
  obrigatorio = false,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  origens: string[];
  obrigatorio?: boolean;
  className?: string;
}) {
  const [extras, setExtras] = useState<string[]>([]);
  // A origem atual entra na lista mesmo que tenha sido escrita de outro jeito.
  const lista = [...new Set([...origens, ...extras, ...(value ? [value] : [])])].sort((a, b) => a.localeCompare(b, "pt-BR"));

  return (
    <select
      value={value}
      required={obrigatorio}
      onChange={(e) => {
        if (e.target.value !== "__nova__") return onChange(e.target.value);
        const nova = prompt("Nova origem (ex: TikTok, Feira, Google):")?.trim();
        if (!nova) return;
        const existente = lista.find((o) => o.toLocaleLowerCase("pt-BR") === nova.toLocaleLowerCase("pt-BR"));
        if (!existente) setExtras((x) => [...x, nova]);
        onChange(existente ?? nova);
      }}
      className={className}
    >
      <option value="">{obrigatorio ? "Escolha a origem…" : "Sem origem"}</option>
      {lista.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__nova__">+ Nova origem…</option>
    </select>
  );
}
