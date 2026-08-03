"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatDate } from "@/lib/contact";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_LABEL: Record<string, string> = {
  PENDING_QR: "Aguardando QR",
  CONNECTED: "Conectado",
  DISCONNECTED: "Caiu — reconectando",
  LOGGED_OUT: "Desconectado",
};

const STATUS_COLOR: Record<string, string> = {
  PENDING_QR: "bg-amber-100 text-amber-700",
  CONNECTED: "bg-emerald-100 text-emerald-700",
  DISCONNECTED: "bg-red-100 text-red-700",
  LOGGED_OUT: "bg-neutral-200 text-neutral-600",
};

type TenantSession = {
  id: string;
  label: string;
  phoneNumber: string | null;
  status: string;
  lastConnectedAt: string | null;
};

type Tenant = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  _count: { users: number; contacts: number; conversations: number };
  sessions: TenantSession[];
};

export function AdminDashboard() {
  const { data: tenants, mutate } = useSWR<Tenant[]>("/api/admin/tenants", fetcher, { refreshInterval: 15000 });
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ ownerEmail: string; ownerPassword: string; tenantName: string } | null>(
    null
  );

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Empresas na plataforma</h1>
          <p className="text-sm text-neutral-400">{tenants?.length ?? "—"} empresas usando o Dilon Zap</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:opacity-90"
        >
          + Nova empresa
        </button>
      </div>

      {credentials && (
        <div className="mb-6 rounded-lg border border-emerald-800 bg-emerald-950/50 p-4 text-sm text-emerald-100">
          <p className="font-medium mb-1">"{credentials.tenantName}" criada. Login inicial (mostrado só uma vez):</p>
          <p className="font-mono">{credentials.ownerEmail} / {credentials.ownerPassword}</p>
          <button onClick={() => setCredentials(null)} className="mt-2 text-xs text-emerald-300 hover:underline">
            Fechar
          </button>
        </div>
      )}

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-950/60 text-xs text-neutral-400">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Empresa</th>
              <th className="text-left px-4 py-2 font-medium">Número WhatsApp</th>
              <th className="text-left px-4 py-2 font-medium">Usuários</th>
              <th className="text-left px-4 py-2 font-medium">Contatos</th>
              <th className="text-left px-4 py-2 font-medium">Criada em</th>
              <th className="text-left px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="text-neutral-200">
            {tenants?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  Nenhuma empresa cadastrada ainda.
                </td>
              </tr>
            )}
            {tenants?.map((t) => {
              const session = t.sessions[0];
              return (
                <tr key={t.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2.5 font-medium">{t.name}</td>
                  <td className="px-4 py-2.5">
                    {session ? (
                      <span className="flex items-center gap-2">
                        <span className={`text-xs rounded-full px-2 py-0.5 ${STATUS_COLOR[session.status]}`}>
                          {STATUS_LABEL[session.status]}
                        </span>
                        <span className="text-neutral-400">{session.phoneNumber ?? session.label}</span>
                      </span>
                    ) : (
                      <span className="text-neutral-500">sem sessão</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{t._count.users}</td>
                  <td className="px-4 py-2.5">{t._count.contacts}</td>
                  <td className="px-4 py-2.5 text-neutral-400">{formatDate(t.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/tenants/${t.id}`} className="text-emerald-400 hover:underline text-xs">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {creating && (
        <NewTenantModal
          onClose={() => setCreating(false)}
          onCreated={(result) => {
            setCreating(false);
            setCredentials(result);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function NewTenantModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (result: { ownerEmail: string; ownerPassword: string; tenantName: string }) => void;
}) {
  const [tenantName, setTenantName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [whatsappLabel, setWhatsappLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantName, ownerName, ownerEmail, whatsappLabel: whatsappLabel || undefined }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "não deu pra criar a empresa");
      return;
    }

    const data = await res.json();
    onCreated({ ownerEmail: data.ownerEmail, ownerPassword: data.ownerPassword, tenantName });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-md text-neutral-100">
        <h2 className="text-base font-semibold mb-4">Nova empresa</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Nome da empresa</label>
            <input
              required
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Nome do dono (login inicial)</label>
            <input
              required
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">E-mail do dono</label>
            <input
              required
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Número de WhatsApp a conectar (opcional, só rótulo)
            </label>
            <input
              value={whatsappLabel}
              onChange={(e) => setWhatsappLabel(e.target.value)}
              placeholder="ex: 21 96741-1481"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar empresa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
