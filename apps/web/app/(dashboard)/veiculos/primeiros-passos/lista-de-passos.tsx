"use client";

import Link from "next/link";
import useSWR from "swr";
import { fetcher } from "../comum";

export type Passo = {
  id: string;
  titulo: string;
  estado: "feito" | "parcial" | "pendente";
  detalhe: string;
  href: string;
  obrigatorio: boolean;
  porQue: string;
  comoFazer: string;
};
export type Dados = { passos: Passo[]; feitos: number; total: number; percentual: number; concluido: boolean };

const ROTULO = { feito: "Feito", parcial: "Em andamento", pendente: "A fazer" } as const;
const COR = {
  feito: "bg-emerald-500/10 text-emerald-700",
  parcial: "bg-amber-500/10 text-amber-700",
  pendente: "bg-neutral-100 text-neutral-600",
} as const;

export function Barra({ percentual }: { percentual: number }) {
  return (
    <span className="block h-2 flex-1 rounded-full bg-neutral-100" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}>
      <span className={`block h-2 rounded-full ${percentual === 100 ? "bg-emerald-500" : "bg-accent"}`} style={{ width: `${percentual}%` }} />
    </span>
  );
}

/** A página completa: cada passo com o que o sistema viu, por que importa e como fazer (também serve de treinamento). */
export function PrimeirosPassos() {
  const { data } = useSWR<Dados>("/api/veiculos/primeiros-passos", fetcher, { refreshInterval: 30_000 });
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4" data-testid="primeiros-passos">
      <div>
        <h2 className="text-xl font-semibold">Primeiros passos</h2>
        <p className="text-sm text-neutral-500">O caminho para a sua revenda rodar por inteiro no Dilon Motors. Cada passo se marca sozinho quando o sistema vê o resultado.</p>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-surface p-4">
        <Barra percentual={data.percentual} />
        <span className="text-sm font-semibold">{data.feitos} de {data.total}</span>
      </div>
      {data.concluido && <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">Implantação concluída. Falta só acompanhar os números em Relatórios.</p>}
      <ol className="flex flex-col gap-3">
        {data.passos.map((p, i) => (
          <li key={p.id} className="rounded-lg border border-neutral-200 bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{i + 1}. {p.titulo}{!p.obrigatorio && <span className="ml-2 text-xs font-normal text-neutral-500">(opcional)</span>}</p>
                <p className="mt-0.5 text-sm text-neutral-600">{p.detalhe}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${COR[p.estado]}`}>{ROTULO[p.estado]}</span>
            </div>
            <details className="mt-2 text-sm" open={p.estado !== "feito"}>
              <summary className="cursor-pointer text-xs font-medium text-accent">Por que e como</summary>
              <p className="mt-2 text-neutral-700"><strong>Por que importa:</strong> {p.porQue}</p>
              <p className="mt-1 text-neutral-700"><strong>Como fazer:</strong> {p.comoFazer}</p>
            </details>
            {p.estado !== "feito" && (
              <Link href={p.href} className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">Resolver agora</Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** O cartão resumido no topo do Estoque: some quando a implantação termina. */
export function CartaoPrimeirosPassos() {
  const { data } = useSWR<Dados | null>("/api/veiculos/primeiros-passos", (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null)), { refreshInterval: 60_000, shouldRetryOnError: false });
  if (!data || data.concluido) return null;
  const proximo = data.passos.find((p) => p.obrigatorio && p.estado !== "feito");
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm" data-testid="cartao-primeiros-passos">
      <span className="font-semibold">Implantação {data.percentual}%</span>
      <Barra percentual={data.percentual} />
      {proximo && <span className="text-neutral-700">Próximo: <strong>{proximo.titulo}</strong></span>}
      <Link href="/veiculos/primeiros-passos" className="ml-auto text-xs font-medium text-accent hover:underline">Ver o passo a passo →</Link>
    </div>
  );
}
