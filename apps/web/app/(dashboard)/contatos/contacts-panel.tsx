"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Avatar } from "@/components/avatar";
import {
  contactLabel,
  formatDate,
  formatPhone,
  PIPELINE_STAGES,
  type ContactRef,
  type PipelineStage,
} from "@/lib/contact";

type Contact = ContactRef & {
  pipelineStage: PipelineStage;
  tags: string[];
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STAGE_LABEL = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.key, s.label])) as Record<
  PipelineStage,
  string
>;

export function ContactsPanel() {
  const router = useRouter();
  const { data: contacts, mutate } = useSWR<Contact[]>("/api/contacts", fetcher, {
    refreshInterval: 8000,
  });
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");
  const [dupeOnly, setDupeOnly] = useState(false);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Duas pistas fracas, mas úteis juntas: mesmo número digitado (pega
  // reimportação por engano) e mesmo nome (pega o caso de um contato com
  // privacidade de número — @lid — cadastrado com o nome que já existia).
  // Nenhuma das duas pega TODO caso real, mas cobrem a maioria.
  const duplicateReasons = useMemo(() => {
    const reasons = new Map<string, string>();
    if (!contacts) return reasons;

    const byDigits = new Map<string, Contact[]>();
    const byName = new Map<string, Contact[]>();

    for (const c of contacts) {
      const digits = c.waJid.split("@")[0];
      byDigits.set(digits, [...(byDigits.get(digits) ?? []), c]);

      if (c.name) {
        const normalized = c.name.trim().toLowerCase();
        byName.set(normalized, [...(byName.get(normalized) ?? []), c]);
      }
    }

    for (const group of byDigits.values()) {
      if (group.length < 2) continue;
      for (const c of group) reasons.set(c.id, "mesmo número");
    }
    for (const group of byName.values()) {
      if (group.length < 2) continue;
      for (const c of group) {
        const existing = reasons.get(c.id);
        reasons.set(c.id, existing ? "mesmo número e nome" : "nome igual a outro contato");
      }
    }

    return reasons;
  }, [contacts]);

  const filtered = useMemo(() => {
    if (!contacts) return undefined;
    const term = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (dupeOnly && !duplicateReasons.has(c.id)) return false;
      if (stageFilter && c.pipelineStage !== stageFilter) return false;
      if (!term) return true;
      return (
        contactLabel(c).toLowerCase().includes(term) || formatPhone(c.waJid).includes(term)
      );
    });
  }, [contacts, search, stageFilter, dupeOnly, duplicateReasons]);

  async function handleStartConversation(contact: Contact) {
    const res = await fetch(`/api/contacts/${contact.id}/start-conversation`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json();
      alert(typeof body.error === "string" ? body.error : "não deu pra iniciar a conversa");
      return;
    }
    const conversation = await res.json();
    router.push(`/inbox?open=${conversation.id}`);
  }

  async function handleBlock(contact: Contact) {
    if (!confirm(`Bloquear ${contactLabel(contact)}? Ele para de receber qualquer mensagem.`)) return;
    await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ waJid: contact.waJid, reason: "Bloqueado pela lista de contatos" }),
    });
  }

  async function handleDelete(contact: Contact) {
    if (!confirm(`Excluir ${contactLabel(contact)}? Isso apaga o histórico de conversas dele também.`))
      return;
    await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    mutate();
  }

  function handleExport() {
    window.open("/api/contacts/export", "_blank");
  }

  async function handleImportFile(file: File) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return;

    const header = rows[0].map((h) => h.trim().toLowerCase());
    const nameIdx = header.findIndex((h) => h === "nome" || h === "name");
    const phoneIdx = header.findIndex((h) => h === "telefone" || h === "phone" || h === "número" || h === "numero");
    if (phoneIdx === -1) {
      alert('O CSV precisa de uma coluna "telefone" (ou "phone").');
      return;
    }

    const parsedRows = rows.slice(1).map((r) => ({
      name: nameIdx >= 0 ? r[nameIdx] : undefined,
      phone: r[phoneIdx] ?? "",
    }));

    const res = await fetch("/api/contacts/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: parsedRows }),
    });
    const summary = await res.json();
    setImportSummary(
      `${summary.created} criados, ${summary.updated} já existiam, ${summary.skipped} ignorados (sem telefone válido).`
    );
    mutate();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold">Contatos</h1>
          <span className="text-xs font-mono rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">
            {contacts?.length ?? "…"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
          >
            Exportar
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
          >
            Importar
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => setEditing("new")}
            className="text-xs rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90"
          >
            + Novo contato
          </button>
        </div>
      </div>

      {importSummary && (
        <div className="mb-4 text-xs rounded-md bg-accent/10 text-accent px-3 py-2 flex items-center justify-between">
          <span>{importSummary}</span>
          <button onClick={() => setImportSummary(null)} className="hover:opacity-70">
            ×
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou número..."
          className="flex-1 max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value as PipelineStage | "")}
          className="text-sm rounded-md border border-neutral-300 px-2 py-2"
        >
          <option value="">Status do lead: todos</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
        {duplicateReasons.size > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-amber-700">
            <input type="checkbox" checked={dupeOnly} onChange={(e) => setDupeOnly(e.target.checked)} />
            Só possíveis duplicatas ({duplicateReasons.size})
          </label>
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Contato</th>
              <th className="text-left px-4 py-2 font-medium">Número</th>
              <th className="text-left px-4 py-2 font-medium">Status lead</th>
              <th className="text-left px-4 py-2 font-medium">Tags</th>
              <th className="text-left px-4 py-2 font-medium">Criado em</th>
              <th className="text-left px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
            {filtered?.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar contact={c} size={28} />
                    <div>
                      <span className="font-medium">{contactLabel(c)}</span>
                      {duplicateReasons.has(c.id) && (
                        <p className="text-[10px] text-amber-700" title="Confira se não é o mesmo contato duas vezes">
                          ⚠ possível duplicata — {duplicateReasons.get(c.id)}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-neutral-600">{formatPhone(c.waJid)}</td>
                <td className="px-4 py-2.5">
                  <span className="text-xs rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600">
                    {STAGE_LABEL[c.pipelineStage]}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1 flex-wrap">
                    {c.tags.map((tag) => (
                      <span key={tag} className="text-[10px] rounded-full bg-accent/10 text-accent px-2 py-0.5">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-neutral-500">{formatDate(c.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => setEditing(c)} className="text-neutral-600 hover:text-accent">
                      Editar
                    </button>
                    <button onClick={() => handleStartConversation(c)} className="text-accent hover:underline">
                      Conversar
                    </button>
                    <button onClick={() => handleBlock(c)} className="text-neutral-600 hover:text-red-600">
                      Bloquear
                    </button>
                    <button onClick={() => handleDelete(c)} className="text-red-600 hover:underline">
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <ContactFormModal
          contact={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function ContactFormModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: Contact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(contact?.name ?? "");
  const [phone, setPhone] = useState(contact ? formatPhone(contact.waJid) : "");
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>(contact?.pipelineStage ?? "NOVO_LEAD");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (contact) {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || null, pipelineStage }),
      });
    } else {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined, phone }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(typeof body.error === "string" ? body.error : "não deu pra salvar");
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-sm font-semibold mb-4">{contact ? "Editar contato" : "Novo contato"}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Telefone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={!!contact}
              placeholder="5511999999999"
              required
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Status do lead</label>
            <select
              value={pipelineStage}
              onChange={(e) => setPipelineStage(e.target.value as PipelineStage)}
              className="w-full text-sm rounded-md border border-neutral-300 px-2 py-2"
            >
              {PIPELINE_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="text-xs rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="text-xs rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Parser de CSV simples com suporte a campos entre aspas (pra nome com vírgula).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}
