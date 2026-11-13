"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** A busca da abertura: marca ou modelo, valor máximo e câmbio. Leva à lista (#estoque) já filtrada. */
export function BuscaRapida({ caminho, faixas, cambios }: { caminho: string; faixas: number[]; cambios: string[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [max, setMax] = useState("");
  const [cambio, setCambio] = useState("");
  const campo = "w-full rounded-xl border border-white/15 bg-white/95 px-4 py-3 text-sm text-neutral-900 outline-none focus:ring-2 focus:ring-[var(--loja2)]";
  return (
    <form
      role="search"
      aria-label="Buscar veículos"
      className="rounded-2xl border border-white/10 bg-black/45 p-4 shadow-2xl backdrop-blur md:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const p = new URLSearchParams();
        if (q.trim()) p.set("q", q.trim());
        if (max) p.set("max", max);
        if (cambio) p.set("cambio", cambio);
        router.push(`${caminho}${p.size ? `?${p}` : ""}#estoque`, { scroll: true });
      }}
    >
      <p className="mb-3 text-base font-semibold text-white">Encontre seu próximo carro</p>
      <div className="grid gap-3 md:grid-cols-[1.6fr_1fr_1fr_auto]">
        <label>
          <span className="mb-1 block text-xs font-medium text-neutral-300">Marca ou modelo</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Honda Civic" className={campo} />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-neutral-300">Valor máximo</span>
          <select value={max} onChange={(e) => setMax(e.target.value)} className={campo}>
            <option value="">Qualquer valor</option>
            {faixas.map((f) => (
              <option key={f} value={f}>
                Até R$ {f.toLocaleString("pt-BR")}
              </option>
            ))}
          </select>
        </label>
        {cambios.length > 1 ? (
          <label>
            <span className="mb-1 block text-xs font-medium text-neutral-300">Câmbio</span>
            <select value={cambio} onChange={(e) => setCambio(e.target.value)} className={campo}>
              <option value="">Todos</option>
              {cambios.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="hidden md:block" />
        )}
        <button type="submit" className="self-end rounded-xl px-6 py-3 text-sm font-bold shadow-lg transition hover:opacity-90" style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
          Buscar veículos
        </button>
      </div>
    </form>
  );
}
