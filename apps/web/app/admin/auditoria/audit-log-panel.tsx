"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatDate, formatTime } from "@/lib/contact";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type AuditEntry = {
  id: string;
  actorName: string;
  actorEmail: string;
  targetTenantName: string;
  action: string;
  metadata: unknown;
  createdAt: string;
};

type AuditResponse = {
  logs: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
  actions: string[];
  tenants: { id: string; name: string }[];
};

export function AuditLogPanel() {
  const [tenantId, setTenantId] = useState("");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const params = new URLSearchParams({ page: String(page) });
  if (tenantId) params.set("tenantId", tenantId);
  if (action) params.set("action", action);

  const { data } = useSWR<AuditResponse>(`/api/admin/audit?${params.toString()}`, fetcher, { refreshInterval: 15000 });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="p-8 max-w-5xl">
      <h1 className="text-lg font-semibold text-neutral-100 mb-1">Auditoria</h1>
      <p className="text-sm text-neutral-400 mb-6">Login e ações relevantes em todas as empresas.</p>

      <div className="flex gap-3 mb-4">
        <select
          value={tenantId}
          onChange={(e) => {
            setTenantId(e.target.value);
            setPage(1);
          }}
          className="text-sm rounded-md border border-neutral-700 bg-neutral-900 text-neutral-200 px-2 py-2"
        >
          <option value="">Todas as empresas</option>
          {data?.tenants.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          className="text-sm rounded-md border border-neutral-700 bg-neutral-900 text-neutral-200 px-2 py-2"
        >
          <option value="">Todas as ações</option>
          {data?.actions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950/60 text-xs text-neutral-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Quando</th>
              <th className="text-left px-4 py-2 font-medium">Empresa</th>
              <th className="text-left px-4 py-2 font-medium">Quem</th>
              <th className="text-left px-4 py-2 font-medium">Ação</th>
              <th className="text-left px-4 py-2 font-medium">Detalhe</th>
            </tr>
          </thead>
          <tbody className="text-neutral-200">
            {data?.logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  Nenhum registro encontrado.
                </td>
              </tr>
            )}
            {data?.logs.map((log) => (
              <tr key={log.id} className="border-t border-neutral-800">
                <td className="px-4 py-2 text-neutral-400 whitespace-nowrap">
                  {formatDate(log.createdAt)} {formatTime(log.createdAt)}
                </td>
                <td className="px-4 py-2">{log.targetTenantName}</td>
                <td className="px-4 py-2">
                  <span className="text-neutral-200">{log.actorName}</span>{" "}
                  <span className="text-neutral-500 text-xs">{log.actorEmail}</span>
                </td>
                <td className="px-4 py-2">
                  <span className="font-mono text-xs text-emerald-400">{log.action}</span>
                </td>
                <td className="px-4 py-2 text-xs text-neutral-500 max-w-xs truncate">
                  {log.metadata ? JSON.stringify(log.metadata) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-between mt-3 text-sm text-neutral-400">
          <span>
            Página {data.page} de {totalPages} · {data.total} registros
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-neutral-700 px-3 py-1 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-neutral-700 px-3 py-1 disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
