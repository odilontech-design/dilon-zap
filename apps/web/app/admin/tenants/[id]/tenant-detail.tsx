"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatDate, formatTime } from "@/lib/contact";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STATUS_LABEL: Record<string, string> = {
  PENDING_QR: "Aguardando QR",
  CONNECTED: "Conectado",
  DISCONNECTED: "Caiu — reconectando",
  LOGGED_OUT: "Desconectado",
};

type User = { id: string; name: string; email: string; role: string; createdAt: string };
type Session = {
  id: string;
  label: string;
  phoneNumber: string | null;
  status: string;
  lastConnectedAt: string | null;
  createdAt: string;
};
type AuditEntry = {
  id: string;
  actorName: string;
  actorEmail: string;
  action: string;
  metadata: unknown;
  createdAt: string;
};

type TenantDetailResponse = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    users: User[];
    sessions: Session[];
    _count: { contacts: number; conversations: number };
  };
  recentAudit: AuditEntry[];
};

export function TenantDetail({ tenantId }: { tenantId: string }) {
  const { data, mutate } = useSWR<TenantDetailResponse>(`/api/admin/tenants/${tenantId}`, fetcher);
  const [addingUser, setAddingUser] = useState(false);
  const [newUserPassword, setNewUserPassword] = useState<{ email: string; password: string } | null>(null);

  if (!data) return <div className="p-8 text-neutral-400">Carregando...</div>;
  const { tenant, recentAudit } = data;

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/admin" className="text-xs text-emerald-400 hover:underline">
        ← Empresas
      </Link>
      <h1 className="text-lg font-semibold text-neutral-100 mt-2">{tenant.name}</h1>
      <p className="text-sm text-neutral-400 mb-6">
        {tenant.slug} · criada em {formatDate(tenant.createdAt)} · {tenant._count.contacts} contatos ·{" "}
        {tenant._count.conversations} conversas
      </p>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-neutral-200 mb-2">Sessões WhatsApp</h2>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
          {tenant.sessions.length === 0 && <p className="px-4 py-3 text-sm text-neutral-500">Nenhuma sessão.</p>}
          {tenant.sessions.map((s) => (
            <div key={s.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-neutral-200">{s.phoneNumber ?? s.label}</span>
              <span className="text-neutral-400">
                {STATUS_LABEL[s.status] ?? s.status}
                {s.lastConnectedAt && ` · conectado em ${formatDate(s.lastConnectedAt)} ${formatTime(s.lastConnectedAt)}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-medium text-neutral-200">Usuários</h2>
          <button onClick={() => setAddingUser(true)} className="text-xs text-emerald-400 hover:underline">
            + Novo usuário
          </button>
        </div>

        {newUserPassword && (
          <div className="mb-3 rounded-lg border border-emerald-800 bg-emerald-950/50 p-3 text-sm text-emerald-100">
            <p className="font-mono">
              {newUserPassword.email} / {newUserPassword.password}
            </p>
            <button onClick={() => setNewUserPassword(null)} className="mt-1 text-xs text-emerald-300 hover:underline">
              Fechar
            </button>
          </div>
        )}

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
          {tenant.users.map((u) => (
            <div key={u.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div>
                <span className="text-neutral-200 font-medium">{u.name}</span>{" "}
                <span className="text-neutral-500">{u.email}</span>
              </div>
              <span className="text-xs rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">{u.role}</span>
            </div>
          ))}
        </div>

        {addingUser && (
          <NewUserForm
            tenantId={tenant.id}
            onClose={() => setAddingUser(false)}
            onCreated={(email, password) => {
              setAddingUser(false);
              setNewUserPassword({ email, password });
              mutate();
            }}
          />
        )}
      </section>

      <section>
        <h2 className="text-sm font-medium text-neutral-200 mb-2">Últimas ações (auditoria)</h2>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 divide-y divide-neutral-800">
          {recentAudit.length === 0 && <p className="px-4 py-3 text-sm text-neutral-500">Nenhuma ação registrada ainda.</p>}
          {recentAudit.map((a) => (
            <div key={a.id} className="px-4 py-2.5 text-sm flex items-center justify-between">
              <span className="text-neutral-200">
                <span className="font-mono text-xs text-emerald-400">{a.action}</span> — {a.actorName}
              </span>
              <span className="text-xs text-neutral-500">
                {formatDate(a.createdAt)} {formatTime(a.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function NewUserForm({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (email: string, password: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"OWNER" | "AGENT">("AGENT");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(`/api/admin/tenants/${tenantId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, role }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "não deu pra criar o usuário");
      return;
    }

    const data = await res.json();
    onCreated(email.toLowerCase().trim(), data.password);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4 flex flex-col gap-3"
    >
      <div className="flex gap-3">
        <input
          required
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <input
          required
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "OWNER" | "AGENT")}
          className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm"
        >
          <option value="AGENT">Atendente</option>
          <option value="OWNER">Proprietário</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-neutral-950 hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Criando..." : "Criar usuário"}
        </button>
      </div>
    </form>
  );
}
