"use client";

import useSWR from "swr";
import { LISTING_INTERVAL } from "@/lib/polling";

type Summary = {
  messages24h: number;
  messages7d: number;
  avgFirstResponseMinutes: number | null;
  firstResponseSampleSize: number;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatMinutes(minutes: number) {
  if (minutes < 1) return "menos de 1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

export function ReportsPanel() {
  const { data } = useSWR<Summary>("/api/reports/summary", fetcher, { refreshInterval: LISTING_INTERVAL });

  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <p className="text-xs text-neutral-500 mb-1">Mensagens (24h)</p>
          <p className="text-2xl font-semibold">{data.messages24h}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <p className="text-xs text-neutral-500 mb-1">Mensagens (7 dias)</p>
          <p className="text-2xl font-semibold">{data.messages7d}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <p className="text-xs text-neutral-500 mb-1">Tempo médio até 1ª resposta</p>
          <p className="text-2xl font-semibold">
            {data.avgFirstResponseMinutes !== null ? formatMinutes(data.avgFirstResponseMinutes) : "—"}
          </p>
        </div>
      </div>
      <p className="text-xs text-neutral-400">
        Tempo de resposta calculado sobre as últimas {data.firstResponseSampleSize} conversas com
        resposta registrada.
      </p>
    </div>
  );
}
