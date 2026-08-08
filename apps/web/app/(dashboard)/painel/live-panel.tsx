"use client";

import useSWR from "swr";
import { DASHBOARD_INTERVAL } from "@/lib/polling";

type Summary = {
  statusCounts: { OPEN: number; PENDING: number; RESOLVED: number };
  messages24h: number;
  messages7d: number;
  avgFirstResponseMinutes: number | null;
  agentWorkload: { id: string; name: string; active: number; resolved: number }[];
  session: { status: string; phoneNumber: string | null } | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const SESSION_LABEL: Record<string, string> = {
  CONNECTED: "Conectado",
  PENDING_QR: "Aguardando QR Code",
  DISCONNECTED: "Desconectado",
  LOGGED_OUT: "Deslogado",
};

function Tile({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p className={`text-2xl font-semibold ${tone === "warn" ? "text-amber-600" : "text-neutral-900"}`}>
        {value}
      </p>
    </div>
  );
}

export function LivePanel() {
  const { data } = useSWR<Summary>("/api/reports/summary", fetcher, { refreshInterval: DASHBOARD_INTERVAL });

  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const sessionConnected = data.session?.status === "CONNECTED";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Tile
          label="WhatsApp"
          value={data.session ? SESSION_LABEL[data.session.status] ?? data.session.status : "Não conectado"}
          tone={sessionConnected ? "ok" : "warn"}
        />
        <Tile label="Ativos" value={data.statusCounts.OPEN} />
        <Tile label="Pendentes" value={data.statusCounts.PENDING} />
        <Tile label="Resolvidos" value={data.statusCounts.RESOLVED} />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-3">Carga por atendente</h2>
        <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Atendente</th>
                <th className="text-left px-4 py-2 font-medium">Em andamento</th>
                <th className="text-left px-4 py-2 font-medium">Resolvidas</th>
              </tr>
            </thead>
            <tbody>
              {data.agentWorkload.map((agent) => (
                <tr key={agent.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2">{agent.name}</td>
                  <td className="px-4 py-2">{agent.active}</td>
                  <td className="px-4 py-2">{agent.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
