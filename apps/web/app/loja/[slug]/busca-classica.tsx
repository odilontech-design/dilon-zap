"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Carro = { marca: string; modelo: string; anoModelo: number; precoCents: number };

const FAIXAS = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 100_000, 120_000, 150_000, 200_000, 300_000];

/**
 * A busca do estilo clássico (o jeito dos sites AutoCerto): faixa cinza logo abaixo dos banners,
 * com marca, modelo, preço de/até e ano de/até numa linha e o botão "Localizar". Leva à lista
 * (#estoque) já filtrada.
 */
export function BuscaClassica({ caminho, carros, semPreco = false }: { caminho: string; carros: Carro[]; /** Todos os carros "sob consulta": sem os campos de valor. */ semPreco?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState({ marca: "", modelo: "", min: "", max: "", ano: "", anoAte: "" });
  const marcas = useMemo(() => [...new Set(carros.map((c) => c.marca))].sort((a, b) => a.localeCompare(b, "pt-BR")), [carros]);
  const modelos = useMemo(() => [...new Set(carros.filter((c) => !f.marca || c.marca === f.marca).map((c) => c.modelo))].sort((a, b) => a.localeCompare(b, "pt-BR")), [carros, f.marca]);
  const anos = useMemo(() => [...new Set(carros.map((c) => c.anoModelo))].sort((a, b) => a - b), [carros]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement>) => setF({ ...f, [k]: e.target.value, ...(k === "marca" ? { modelo: "" } : {}) });
  const campo = "h-12 w-full rounded-sm border-0 bg-white px-3 text-[15px] text-neutral-700 outline-none focus:ring-2 focus:ring-[var(--loja2)]";
  const reais = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
  return (
    <section aria-label="Encontre seu veículo" style={{ background: "linear-gradient(180deg,#5f6469,#7d8287)" }}>
      <form
        role="search"
        className="mx-auto max-w-6xl px-4 py-5"
        onSubmit={(e) => {
          e.preventDefault();
          const p = new URLSearchParams();
          if (f.marca) p.set("marca", f.marca);
          if (f.modelo) p.set("modelo", f.modelo);
          if (f.min) p.set("min", f.min);
          if (f.max) p.set("max", f.max);
          if (f.ano) p.set("ano", f.ano);
          if (f.anoAte) p.set("anoate", f.anoAte);
          router.push(`${caminho}${p.size ? `?${p}` : ""}#estoque`, { scroll: true });
        }}
      >
        <h2 className="mb-3 text-xl font-bold uppercase tracking-wide text-white">Encontre seu veículo</h2>
        <div className={`grid grid-cols-2 gap-3 ${semPreco ? "md:grid-cols-[1.4fr_1.4fr_1fr_1fr_auto]" : "md:grid-cols-[1.4fr_1.4fr_1fr_1fr_1fr_1fr_auto]"}`}>
          <select aria-label="Marca" value={f.marca} onChange={set("marca")} className={campo}>
            <option value="">TODOS</option>
            {marcas.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select aria-label="Modelo" value={f.modelo} onChange={set("modelo")} className={campo}>
            <option value="">Modelo</option>
            {modelos.map((m) => <option key={m}>{m}</option>)}
          </select>
          {!semPreco && (
            <>
              <select aria-label="Preço de" value={f.min} onChange={set("min")} className={campo}>
                <option value="">Preço de</option>
                {FAIXAS.map((v) => <option key={v} value={v}>{reais(v)}</option>)}
              </select>
              <select aria-label="Preço até" value={f.max} onChange={set("max")} className={campo}>
                <option value="">Preço até</option>
                {FAIXAS.map((v) => <option key={v} value={v}>{reais(v)}</option>)}
              </select>
            </>
          )}
          <select aria-label="Ano de" value={f.ano} onChange={set("ano")} className={campo}>
            <option value="">Ano de</option>
            {anos.map((a) => <option key={a}>{a}</option>)}
          </select>
          <select aria-label="Ano até" value={f.anoAte} onChange={set("anoAte")} className={campo}>
            <option value="">Ano até</option>
            {anos.map((a) => <option key={a}>{a}</option>)}
          </select>
          <button type="submit" className="col-span-2 flex h-12 items-center justify-center gap-2 rounded-sm px-7 text-sm font-bold uppercase transition hover:opacity-90 md:col-span-1" style={{ background: "var(--loja)", color: "var(--loja2)" }}>
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            Localizar
          </button>
        </div>
      </form>
    </section>
  );
}
