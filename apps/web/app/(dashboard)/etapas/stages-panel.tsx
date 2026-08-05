"use client";

import { useState } from "react";
import useSWR from "swr";
import { readableTextColor } from "@/lib/tags";

type Stage = { id: string; name: string; color: string; position: number; createdAt: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function StagesPanel() {
  const { data: stages, mutate } = useSWR<Stage[]>("/api/stages", fetcher);
  const [editing, setEditing] = useState<Stage | "new" | null>(null);

  async function handleMove(stage: Stage, move: "up" | "down") {
    await fetch(`/api/stages/${stage.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move }),
    });
    mutate();
  }

  async function handleDelete(stage: Stage) {
    if (
      !confirm(
        `Excluir a etapa "${stage.name}"? Contatos nela voltam pra "Sem etapa" — nenhum contato é apagado.`
      )
    )
      return;
    await fetch(`/api/stages/${stage.id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-neutral-600 mb-6">
        As colunas do <span className="font-medium">Funil</span> vêm daqui — cada empresa define o próprio
        processo de vendas/atendimento. A ordem abaixo é a ordem das colunas no kanban.
      </p>

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setEditing("new")}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + Nova etapa
        </button>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Ordem</th>
              <th className="text-left px-4 py-2 font-medium">Etapa</th>
              <th className="text-left px-4 py-2 font-medium">Cor</th>
              <th className="text-left px-4 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {stages?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma etapa cadastrada ainda.
                </td>
              </tr>
            )}
            {stages?.map((stage, i) => (
              <tr key={stage.id} className="border-t border-neutral-100">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleMove(stage, "up")}
                      disabled={i === 0}
                      title="Mover pra cima"
                      className="text-neutral-500 hover:text-accent disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMove(stage, "down")}
                      disabled={i === stages.length - 1}
                      title="Mover pra baixo"
                      className="text-neutral-500 hover:text-accent disabled:opacity-30"
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td className="px-4 py-2.5 flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="font-medium">{stage.name}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="text-xs rounded-full px-2 py-0.5 font-mono"
                    style={{ backgroundColor: stage.color, color: readableTextColor(stage.color) }}
                  >
                    {stage.color.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => setEditing(stage)} className="text-neutral-600 hover:text-accent">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(stage)} className="text-red-600 hover:underline">
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
        <StageFormModal
          stage={editing === "new" ? null : editing}
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

function StageFormModal({
  stage,
  onClose,
  onSaved,
}: {
  stage: Stage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState(stage?.color ?? "#0000F5");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch(stage ? `/api/stages/${stage.id}` : "/api/stages", {
      method: stage ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "não deu pra salvar a etapa");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-4">{stage ? "Editar etapa" : "Nova etapa"}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Nome</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: (1) Primeiro contato"
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
