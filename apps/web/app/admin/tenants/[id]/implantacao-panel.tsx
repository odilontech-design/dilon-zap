"use client";

import useSWR from "swr";

type Passo = { id: string; titulo: string; estado: "feito" | "parcial" | "pendente"; detalhe: string; obrigatorio: boolean };
type Resp = {
  passos: Passo[];
  feitos: number;
  total: number;
  percentual: number;
  concluido: boolean;
  resumo: { diasDesdeAEntrada: number; noPatio: number; semKm: number; semFoto: number; semPreco: number; portaisConectados: string[]; anunciosNoAr: number; usouOInbox: boolean };
};

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null));
const MARCA = { feito: "✓", parcial: "◐", pendente: "○" } as const;
const COR = { feito: "text-emerald-400", parcial: "text-amber-400", pendente: "text-neutral-500" } as const;

/** Implantação da revenda na ficha da empresa (Super Admin): os mesmos passos que a loja vê. */
export function ImplantacaoPanel({ tenantId }: { tenantId: string }) {
  const { data } = useSWR<Resp | null>(`/api/admin/tenants/${tenantId}/implantacao`, fetcher, { refreshInterval: 60_000 });
  if (!data) return null;
  const r = data.resumo;
  return (
    <section className="mb-8 rounded-lg border border-neutral-800 p-4" data-testid="implantacao-panel">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-neutral-100">Implantação da revenda</h2>
        <span className="text-xs text-neutral-400">{data.feitos} de {data.total} · {data.percentual}% · há {r.diasDesdeAEntrada} dia(s)</span>
      </div>
      <div className="mb-3 h-2 rounded-full bg-neutral-800"><div className={`h-2 rounded-full ${data.concluido ? "bg-emerald-500" : "bg-sky-500"}`} style={{ width: `${data.percentual}%` }} /></div>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {data.passos.map((p) => (
          <li key={p.id} className="flex gap-2 text-neutral-300">
            <span className={COR[p.estado]} aria-hidden>{MARCA[p.estado]}</span>
            <span><span className="font-medium">{p.titulo}</span>{!p.obrigatorio && <span className="text-neutral-500"> (opcional)</span>}<span className="block text-xs text-neutral-500">{p.detalhe}</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">
        {r.noPatio} carro(s) no pátio · sem km: {r.semKm} · sem foto: {r.semFoto} · sem preço: {r.semPreco} · {r.anunciosNoAr} anúncio(s) no ar · {r.usouOInbox ? "equipe já usou o Inbox" : "equipe ainda não usou o Inbox"}
      </p>
    </section>
  );
}
