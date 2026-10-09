"use client";

import { useState } from "react";
import { centsToBRL } from "@/lib/billing";
import { formatarTaxa, type Indicadores } from "@/lib/funil-indicadores";

type Motivo = { id: string; nome: string };

function Cartao({ titulo, valor, detalhe, alerta }: { titulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface px-3 py-2.5 min-w-[140px]">
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className={`text-base font-semibold tabular-nums ${alerta ? "text-amber-600" : ""}`}>{valor}</p>
      {detalhe && <p className="text-[11px] text-neutral-400 tabular-nums">{detalhe}</p>}
    </div>
  );
}

/**
 * Faixa de indicadores do funil filtrado. Os números vêm prontos do servidor
 * (lib/funil-indicadores) — esta tela só apresenta, nunca recalcula.
 */
export function IndicadoresFunil({ ind, motivos }: { ind: Indicadores; motivos: Motivo[] }) {
  const [aberto, setAberto] = useState(false);
  const nomeDoMotivo = new Map(motivos.map((m) => [m.id, m.nome]));
  const maior = Math.max(1, ...ind.porEtapa.map((e) => e.chegaram));

  return (
    <div className="mb-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Cartao titulo="Em andamento" valor={String(ind.abertas)} detalhe={centsToBRL(ind.valorAbertoCents)} />
        <Cartao
          titulo="Previsão ponderada"
          valor={centsToBRL(ind.previsaoPonderadaCents)}
          detalhe="valor × chance da etapa"
        />
        <Cartao
          titulo="Ganhas"
          valor={String(ind.ganhas)}
          detalhe={`${centsToBRL(ind.valorGanhoCents)} · ${formatarTaxa(ind.taxaDeGanho)} de ganho`}
        />
        <Cartao
          titulo="Ticket médio"
          valor={ind.ticketMedioCents === null ? "—" : centsToBRL(ind.ticketMedioCents)}
          detalhe={ind.cicloMedioDias === null ? undefined : `ciclo de ${ind.cicloMedioDias} dia(s)`}
        />
        <Cartao titulo="Novo MRR" valor={centsToBRL(ind.novoMrrCents)} detalhe="ganhas mensais" />
        <Cartao
          titulo="Paradas"
          valor={String(ind.paradas)}
          detalhe="há mais de 14 dias na etapa"
          alerta={ind.paradas > 0}
        />
        <Cartao titulo="Perdidas" valor={String(ind.perdidas)} />
      </div>

      <button onClick={() => setAberto((v) => !v)} className="mt-2 text-xs text-accent hover:underline">
        {aberto ? "Ocultar conversão por etapa" : "Ver conversão por etapa e motivos de perda"}
      </button>

      {aberto && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-200 bg-surface p-4">
            <h3 className="text-sm font-semibold mb-1">Conversão por etapa</h3>
            <p className="text-[11px] text-neutral-500 mb-3">
              Das negociações criadas no período, quantas já passaram por cada etapa.
            </p>
            <div className="flex flex-col gap-2">
              {ind.porEtapa.map((e) => (
                <div key={e.etapaId}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium truncate">{e.nome}</span>
                    <span className="tabular-nums text-neutral-500 shrink-0">
                      {e.chegaram}
                      {e.taxaDaAnterior !== null && ` · ${formatarTaxa(e.taxaDaAnterior)} da anterior`}
                      {e.taxaDesdeOInicio !== null && ` · ${formatarTaxa(e.taxaDesdeOInicio)} do início`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 mt-1">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${(e.chegaram / maior) * 100}%` }} />
                  </div>
                </div>
              ))}
              {ind.porEtapa.length === 0 && <p className="text-xs text-neutral-400">Este funil ainda não tem etapas.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-neutral-200 bg-surface p-4">
            <h3 className="text-sm font-semibold mb-3">Por que perdemos</h3>
            {ind.perdasPorMotivo.length === 0 ? (
              <p className="text-xs text-neutral-400">Nenhuma negociação perdida no período.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-xs">
                {ind.perdasPorMotivo.map((p) => (
                  <li key={p.motivoId ?? "sem"} className="flex items-center justify-between gap-2">
                    <span className="truncate">{(p.motivoId && nomeDoMotivo.get(p.motivoId)) || "Sem motivo"}</span>
                    <span className="tabular-nums text-neutral-500 shrink-0">
                      {p.quantidade} · {centsToBRL(p.valorCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
