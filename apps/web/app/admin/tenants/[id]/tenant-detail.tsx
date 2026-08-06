"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { formatDate, formatTime } from "@/lib/contact";
import { centsToBRL, effectiveInvoiceStatus } from "@/lib/billing";

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

type Subscription = {
  id: string;
  amountCents: number;
  cycleDay: number;
  status: "ACTIVE" | "PAUSED" | "CANCELED";
  notes: string | null;
};

type Invoice = {
  id: string;
  amountCents: number;
  dueDate: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELED";
  paidAt: string | null;
};

type TenantDetailResponse = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    users: User[];
    sessions: Session[];
    subscription: Subscription | null;
    invoices: Invoice[];
    _count: { contacts: number; conversations: number };
  };
  recentAudit: AuditEntry[];
};

export function TenantDetail({ tenantId }: { tenantId: string }) {
  const { data, mutate } = useSWR<TenantDetailResponse>(`/api/admin/tenants/${tenantId}`, fetcher);
  const [addingUser, setAddingUser] = useState(false);
  const [newUserPassword, setNewUserPassword] = useState<{ email: string; password: string } | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);

  async function handleResetPassword(userId: string) {
    setResettingId(userId);
    const res = await fetch(`/api/admin/users/${userId}/reset-password`, { method: "POST" });
    setResettingId(null);
    if (!res.ok) return;
    const data = await res.json();
    setNewUserPassword({ email: data.email, password: data.password });
  }

  if (!data) return <div className="p-4 md:p-8 text-neutral-400">Carregando...</div>;
  const { tenant, recentAudit } = data;

  return (
    <div className="p-4 md:p-8 max-w-4xl">
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
            <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap text-sm">
              <span className="text-neutral-200">{s.phoneNumber ?? s.label}</span>
              <span className="text-neutral-400">
                {STATUS_LABEL[s.status] ?? s.status}
                {s.lastConnectedAt && ` · conectado em ${formatDate(s.lastConnectedAt)} ${formatTime(s.lastConnectedAt)}`}
              </span>
            </div>
          ))}
        </div>
      </section>

      <BillingSection tenantId={tenant.id} subscription={tenant.subscription} invoices={tenant.invoices} onChanged={mutate} />

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
            <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-2 flex-wrap text-sm">
              <div>
                <span className="text-neutral-200 font-medium">{u.name}</span>{" "}
                <span className="text-neutral-500">{u.email}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs rounded-full bg-neutral-800 px-2 py-0.5 text-neutral-300">{u.role}</span>
                <button
                  onClick={() => handleResetPassword(u.id)}
                  disabled={resettingId === u.id}
                  className="text-xs text-emerald-400 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  {resettingId === u.id ? "Redefinindo..." : "Redefinir senha"}
                </button>
              </div>
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
            <div key={a.id} className="px-4 py-2.5 text-sm flex items-center justify-between gap-2 flex-wrap">
              <span className="text-neutral-200">
                <span className="font-mono text-xs text-emerald-400">{a.action}</span> — {a.actorName}
              </span>
              <span className="text-xs text-neutral-500 shrink-0">
                {formatDate(a.createdAt)} {formatTime(a.createdAt)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

const SUB_STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-900/60 text-emerald-300",
  PAUSED: "bg-amber-900/60 text-amber-300",
  CANCELED: "bg-neutral-800 text-neutral-400",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  PENDING: "Aguardando pagamento",
  OVERDUE: "Atrasada",
  PAID: "Paga",
  CANCELED: "Cancelada",
};

const INVOICE_STATUS_COLOR: Record<string, string> = {
  PENDING: "bg-amber-900/60 text-amber-300",
  OVERDUE: "bg-red-900/60 text-red-300",
  PAID: "bg-emerald-900/60 text-emerald-300",
  CANCELED: "bg-neutral-800 text-neutral-400",
};

function BillingSection({
  tenantId,
  subscription,
  invoices,
  onChanged,
}: {
  tenantId: string;
  subscription: Subscription | null;
  invoices: Invoice[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerateInvoice() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}/invoices`, { method: "POST" });
    setGenerating(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "não deu pra gerar a cobrança");
      return;
    }
    onChanged();
  }

  async function handleMarkPaid(invoiceId: string) {
    await fetch(`/api/admin/invoices/${invoiceId}/pay`, { method: "POST" });
    onChanged();
  }

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-medium text-neutral-200">Cobrança</h2>
        <button onClick={() => setEditing(true)} className="text-xs text-emerald-400 hover:underline">
          {subscription ? "Editar plano" : "+ Configurar plano"}
        </button>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        {!subscription && <p className="text-sm text-neutral-500">Nenhum plano configurado ainda.</p>}
        {subscription && (
          <div className="flex items-center justify-between gap-3 flex-wrap text-sm mb-3">
            <div>
              <span className="text-neutral-100 font-medium">{centsToBRL(subscription.amountCents)}</span>
              <span className="text-neutral-500"> / mês · vence todo dia {subscription.cycleDay}</span>
              {subscription.notes && <p className="text-xs text-neutral-500 mt-1">{subscription.notes}</p>}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`text-xs rounded-full px-2 py-0.5 ${SUB_STATUS_COLOR[subscription.status]}`}>
                {subscription.status}
              </span>
              <button
                onClick={handleGenerateInvoice}
                disabled={generating || subscription.status !== "ACTIVE"}
                className="text-xs text-emerald-400 hover:underline disabled:opacity-40 disabled:no-underline"
              >
                {generating ? "Gerando..." : "+ Gerar próxima cobrança"}
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-red-400 mb-2">{error}</p>}

        {invoices.length > 0 && (
          <div className="divide-y divide-neutral-800 border-t border-neutral-800 -mx-4 mt-3">
            {invoices.map((inv) => {
              const status = effectiveInvoiceStatus(inv);
              return (
                <div key={inv.id} className="px-4 py-2.5 flex items-center justify-between gap-2 flex-wrap text-sm">
                  <span className="text-neutral-300">
                    {centsToBRL(inv.amountCents)} · vence {formatDate(inv.dueDate)}
                  </span>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${INVOICE_STATUS_COLOR[status]}`}>
                      {INVOICE_STATUS_LABEL[status]}
                    </span>
                    {(status === "PENDING" || status === "OVERDUE") && (
                      <button onClick={() => handleMarkPaid(inv.id)} className="text-xs text-emerald-400 hover:underline">
                        Marcar como paga
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <SubscriptionForm
          tenantId={tenantId}
          subscription={subscription}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function SubscriptionForm({
  tenantId,
  subscription,
  onClose,
  onSaved,
}: {
  tenantId: string;
  subscription: Subscription | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(subscription ? (subscription.amountCents / 100).toFixed(2) : "");
  const [cycleDay, setCycleDay] = useState(subscription?.cycleDay ?? 5);
  const [status, setStatus] = useState<"ACTIVE" | "PAUSED" | "CANCELED">(subscription?.status ?? "ACTIVE");
  const [notes, setNotes] = useState(subscription?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const amountCents = Math.round(parseFloat(amount.replace(",", ".")) * 100);
    if (!Number.isFinite(amountCents) || amountCents < 0) {
      setSaving(false);
      setError("valor inválido");
      return;
    }

    const res = await fetch(`/api/admin/tenants/${tenantId}/subscription`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents, cycleDay, status, notes: notes || undefined }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "não deu pra salvar o plano");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 w-full max-w-sm text-neutral-100">
        <h2 className="text-base font-semibold mb-4">Plano da empresa</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Valor mensal (R$)</label>
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="ex: 197.00"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Dia do vencimento</label>
            <input
              required
              type="number"
              min={1}
              max={28}
              value={cycleDay}
              onChange={(e) => setCycleDay(Number(e.target.value))}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "ACTIVE" | "PAUSED" | "CANCELED")}
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm"
            >
              <option value="ACTIVE">Ativo</option>
              <option value="PAUSED">Pausado</option>
              <option value="CANCELED">Cancelado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">Observações (opcional)</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
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
      <div className="flex flex-col sm:flex-row gap-3">
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
