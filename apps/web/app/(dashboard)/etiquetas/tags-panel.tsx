"use client";

import { useState } from "react";
import useSWR from "swr";
import { readableTextColor } from "@/lib/tags";

type Tag = { id: string; name: string; color: string; isActive: boolean; createdAt: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function TagsPanel() {
  const { data: tags, mutate } = useSWR<Tag[]>("/api/tags", fetcher);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Tag | "new" | null>(null);

  const filtered = tags?.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));

  async function handleDelete(tag: Tag) {
    if (
      !confirm(
        `Excluir a etiqueta "${tag.name}"? Conversas já marcadas com ela mantêm o texto, só some da lista de seleção.`
      )
    )
      return;
    await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar etiqueta..."
          className="flex-1 max-w-xs rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={() => setEditing("new")}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 shrink-0"
        >
          + Nova Etiqueta
        </button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Etiqueta</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="text-left px-4 py-2 font-medium">Cor</th>
              <th className="text-left px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma etiqueta encontrada.
                </td>
              </tr>
            )}
            {filtered?.map((tag) => (
              <tr key={tag.id} className="border-t border-neutral-100">
                <td className="px-4 py-2.5 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                  <span className="font-medium">{tag.name}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 border ${
                      tag.isActive ? "border-emerald-300 text-emerald-700" : "border-neutral-300 text-neutral-400"
                    }`}
                  >
                    {tag.isActive ? "Ativo" : "Inativo"}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="text-xs rounded-full px-2 py-0.5 font-mono"
                    style={{ backgroundColor: tag.color, color: readableTextColor(tag.color) }}
                  >
                    {tag.color.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => setEditing(tag)} className="text-neutral-600 hover:text-accent">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(tag)} className="text-red-600 hover:underline">
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
        <TagFormModal
          tag={editing === "new" ? null : editing}
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

function TagFormModal({
  tag,
  onClose,
  onSaved,
}: {
  tag: Tag | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? "");
  const [color, setColor] = useState(tag?.color ?? "#0000F5");
  const [isActive, setIsActive] = useState(tag?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(tag ? `/api/tags/${tag.id}` : "/api/tags", {
      method: tag ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color, isActive }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "não deu pra salvar a etiqueta");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-4">{tag ? "Editar etiqueta" : "Nova etiqueta"}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Nome</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Cor</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-10 h-9 rounded-md border border-neutral-300 cursor-pointer shrink-0"
              />
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                pattern="^#[0-9A-Fa-f]{6}$"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Ativa (aparece pra seleção nas conversas)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
