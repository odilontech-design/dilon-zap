"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { PACOTES_VENDEDOR_IA, PLANOS_VEICULOS, type PlanoVeiculos } from "@/lib/veiculos-planos";

/**
 * Plano da revenda de veículos e pacote do Vendedor IA na ficha da empresa.
 * O recurso em si (ligar "Revenda de veículos" e "Vendedor IA") continua nas
 * exceções do painel de plano, acima.
 */

type Resp = {
  plano: PlanoVeiculos | null;
  leadsContratados: number | null;
  iaLigada: boolean;
  noPatio: number;
  temVeiculos: boolean;
  temVendedorIa: boolean;
  leadsNoMes: number;
  custoIaMesMicrosUsd: number;
};

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100";

export function RevendaPanel({ tenantId }: { tenantId: string }) {
  const { data, mutate } = useSWR<Resp>(`/api/admin/tenants/${tenantId}/revenda`, fetcher);
  const [plano, setPlano] = useState<PlanoVeiculos | "">("");
  const [leads, setLeads] = useState<string>("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!data) return;
    setPlano(data.plano ?? "");
    setLeads(data.leadsContratados === null ? "" : String(data.leadsContratados));
  }, [data]);

  if (!data || (!data.temVeiculos && !data.plano)) return null;

  async function salvar() {
    setAviso(null);
    setSalvando(true);
    const r = await fetch(`/api/admin/tenants/${tenantId}/revenda`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plano: plano || null, leadsContratados: leads ? Number(leads) : null }),
    });
    setSalvando(false);
    setAviso(r.ok ? "Salvo." : "Não deu para salvar.");
    mutate();
  }

  const p = plano ? PLANOS_VEICULOS[plano] : null;
  const pacote = PACOTES_VENDEDOR_IA.find((x) => String(x.leads) === leads);
  const total = (p?.mensalCents ?? 0) + (data.temVendedorIa ? pacote?.mensalCents ?? 0 : 0);
  return (
    <section className="mb-8 rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Revenda de veículos</h2>
      <p className="mb-3 text-xs text-neutral-400">
        Plano da vertical (limite de carros, catálogo do Facebook, multi-número no Revenda+, usuários ilimitados). Sem plano = sem limites.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Plano
          <select value={plano} onChange={(e) => setPlano(e.target.value as PlanoVeiculos | "")} className={campo}>
            <option value="">Sem plano (sob medida, sem limites)</option>
            {(Object.keys(PLANOS_VEICULOS) as PlanoVeiculos[]).map((k) => (
              <option key={k} value={k}>
                {PLANOS_VEICULOS[k].nome} · até {PLANOS_VEICULOS[k].carrosNoPatio} carros · {brl(PLANOS_VEICULOS[k].mensalCents)}/mês
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-300">
          Vendedor IA: leads contratados por mês
          <select value={leads} onChange={(e) => setLeads(e.target.value)} className={campo}>
            <option value="">Sem teto contratado</option>
            {PACOTES_VENDEDOR_IA.map((x) => (
              <option key={x.leads} value={x.leads}>
                até {x.leads} · {brl(x.mensalCents)}/mês
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-neutral-400">
        No estoque: {data.noPatio}
        {p ? ` de ${p.carrosNoPatio}` : ""} carros · Vendedor IA {data.temVendedorIa ? (data.iaLigada ? "ligado" : "liberado, desligado pela loja") : "não liberado (ligar nas exceções acima)"} · {data.leadsNoMes} lead(s) no mês, custo de API US${" "}
        {(data.custoIaMesMicrosUsd / 1e6).toFixed(2)}
      </p>
      {p && data.noPatio > p.carrosNoPatio && <p className="mt-1 text-xs text-amber-400">O estoque está acima do limite do plano: entradas novas ficam bloqueadas até sair carro.</p>}
      {total > 0 && <p className="mt-1 text-xs text-neutral-300">Total da tabela: {brl(total)}/mês (confira com o valor da assinatura na cobrança).</p>}
      <div className="mt-3 flex items-center gap-3">
        <button onClick={salvar} disabled={salvando} className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50">
          {salvando ? "Salvando…" : "Salvar plano da revenda"}
        </button>
        {aviso && <span className="text-xs text-neutral-400">{aviso}</span>}
      </div>
    </section>
  );
}
