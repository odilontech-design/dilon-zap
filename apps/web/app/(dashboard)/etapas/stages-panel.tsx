"use client";

import { useState } from "react";
import useSWR from "swr";
import { readableTextColor } from "@/lib/tags";

type Stage = { id: string; name: string; color: string; position: number; probabilidade: number };
type Funil = { id: string; nome: string; padrao: boolean; tarefaLigarAuto: boolean; etapas: number; abertas: number };
type Motivo = { id: string; nome: string };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

async function erroDe(res: Response, padrao: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : padrao;
}

export function StagesPanel({ podeGerir, funilInicial }: { podeGerir: boolean; funilInicial: string }) {
  const { data: funis, mutate: recarregarFunis } = useSWR<Funil[]>("/api/funis", fetcher);
  const [escolhido, setEscolhido] = useState(funilInicial);
  // O funil mostrado: o escolhido, se ainda existe; senão o padrão.
  const funil = funis?.find((f) => f.id === escolhido) ?? funis?.find((f) => f.padrao) ?? funis?.[0];

  const { data: stages, mutate } = useSWR<Stage[]>(funil ? `/api/stages?funilId=${funil.id}` : null, fetcher);
  const [editing, setEditing] = useState<Stage | "new" | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function chamar(url: string, init: RequestInit, falha: string): Promise<boolean> {
    setAviso(null);
    const res = await fetch(url, init);
    if (!res.ok) {
      setAviso(await erroDe(res, falha));
      return false;
    }
    return true;
  }

  const json = { "Content-Type": "application/json" };

  async function handleMove(stage: Stage, move: "up" | "down") {
    await chamar(`/api/stages/${stage.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ move }) }, "não deu pra mover");
    mutate();
  }

  async function handleDelete(stage: Stage) {
    if (!confirm(`Excluir a etapa "${stage.name}"?`)) return;
    await chamar(`/api/stages/${stage.id}`, { method: "DELETE" }, "não deu pra excluir");
    mutate();
    recarregarFunis();
  }

  async function renomearFunil() {
    if (!funil) return;
    const nome = prompt("Novo nome do funil:", funil.nome)?.trim();
    if (!nome || nome === funil.nome) return;
    await chamar(`/api/funis/${funil.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ nome }) }, "não deu pra renomear");
    recarregarFunis();
  }

  async function tornarPadrao() {
    if (!funil) return;
    await chamar(`/api/funis/${funil.id}`, { method: "PATCH", headers: json, body: JSON.stringify({ padrao: true }) }, "não deu pra alterar");
    recarregarFunis();
  }

  async function alternarLigarAuto() {
    if (!funil) return;
    await chamar(
      `/api/funis/${funil.id}`,
      { method: "PATCH", headers: json, body: JSON.stringify({ tarefaLigarAuto: !funil.tarefaLigarAuto }) },
      "não deu pra alterar"
    );
    recarregarFunis();
  }

  async function arquivarFunil() {
    if (!funil) return;
    if (!confirm(`Arquivar o funil "${funil.nome}"? As negociações ganhas e perdidas dele continuam no histórico.`)) return;
    if (await chamar(`/api/funis/${funil.id}`, { method: "DELETE" }, "não deu pra arquivar")) {
      setEscolhido("");
      recarregarFunis();
    }
  }

  if (!funis || !funil) return <p className="text-sm text-neutral-400">Carregando...</p>;

  return (
    <div className="max-w-3xl">
      <p className="text-sm text-neutral-600 mb-6">
        Cada funil tem as próprias etapas — as colunas do quadro. A <span className="font-medium">chance</span> de cada etapa
        alimenta a previsão de vendas: valor em aberto × chance.
      </p>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={funil.id}
          onChange={(e) => setEscolhido(e.target.value)}
          className="text-sm rounded-md border border-neutral-300 px-2 py-1.5 font-medium"
        >
          {funis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
              {f.padrao ? " (padrão)" : ""}
            </option>
          ))}
        </select>
        {podeGerir && (
          <div className="flex gap-3 text-xs">
            <button onClick={renomearFunil} className="text-neutral-600 hover:text-accent">
              Renomear
            </button>
            {!funil.padrao && (
              <button onClick={tornarPadrao} className="text-neutral-600 hover:text-accent">
                Tornar padrão
              </button>
            )}
            {!funil.padrao && (
              <button onClick={arquivarFunil} className="text-red-600 hover:underline">
                Arquivar funil
              </button>
            )}
          </div>
        )}
        <div className="flex-1" />
        {podeGerir && (
          <button
            onClick={() => setEditing("new")}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Nova etapa
          </button>
        )}
      </div>

      {podeGerir && (
        <label className="flex items-start gap-2 text-sm mb-4">
          <input type="checkbox" checked={funil.tarefaLigarAuto} onChange={alternarLigarAuto} className="mt-1" />
          <span>
            Criar a tarefa <span className="font-medium">Ligar para o cliente</span> automaticamente em toda negociação nova deste
            funil (para o dia seguinte, às 9h, com o responsável da negociação).
          </span>
        </label>
      )}

      {aviso && <p className="text-sm text-red-600 mb-3">{aviso}</p>}
      {!podeGerir && (
        <p className="text-xs text-neutral-500 mb-3">Só o responsável da conta e o financeiro alteram as etapas.</p>
      )}

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Ordem</th>
              <th className="text-left px-4 py-2 font-medium">Etapa</th>
              <th className="text-left px-4 py-2 font-medium">Chance</th>
              <th className="text-left px-4 py-2 font-medium">Cor</th>
              {podeGerir && <th className="text-left px-4 py-2 font-medium">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {stages?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-400">
                  Este funil ainda não tem etapas.
                </td>
              </tr>
            )}
            {stages?.map((stage, i) => (
              <tr key={stage.id} className="border-t border-neutral-100">
                <td className="px-4 py-2.5">
                  {podeGerir && (
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
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <span className="font-medium">{stage.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 tabular-nums">{stage.probabilidade}%</td>
                <td className="px-4 py-2.5">
                  <span
                    className="text-xs rounded-full px-2 py-0.5 font-mono"
                    style={{ backgroundColor: stage.color, color: readableTextColor(stage.color) }}
                  >
                    {stage.color.toUpperCase()}
                  </span>
                </td>
                {podeGerir && (
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
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MotivosDePerda podeGerir={podeGerir} />

      {editing && (
        <StageFormModal
          funilId={funil.id}
          stage={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            mutate();
            recarregarFunis();
          }}
        />
      )}
    </div>
  );
}

function MotivosDePerda({ podeGerir }: { podeGerir: boolean }) {
  const { data: motivos, mutate } = useSWR<Motivo[]>("/api/motivos-perda", fetcher);
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function adicionar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.trim()) return;
    setErro(null);
    const res = await fetch("/api/motivos-perda", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novo.trim() }),
    });
    if (!res.ok) return setErro(await erroDe(res, "não deu pra adicionar"));
    setNovo("");
    mutate();
  }

  async function remover(m: Motivo) {
    if (!confirm(`Remover "${m.nome}" da lista? Negociações já perdidas por esse motivo continuam com ele no histórico.`)) return;
    await fetch(`/api/motivos-perda/${m.id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="mt-10">
      <h2 className="text-base font-semibold mb-1">Motivos de perda</h2>
      <p className="text-sm text-neutral-600 mb-4">
        Quem marca uma negociação como perdida escolhe um destes. É a lista que responde &ldquo;por que estamos perdendo?&rdquo;.
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        {motivos?.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-neutral-300 px-3 py-1 text-xs">
            {m.nome}
            {podeGerir && (
              <button onClick={() => remover(m)} className="text-neutral-400 hover:text-red-600" aria-label={`Remover ${m.nome}`}>
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {podeGerir && (
        <form onSubmit={adicionar} className="flex gap-2 max-w-sm">
          <input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Novo motivo"
            maxLength={60}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-50">
            Adicionar
          </button>
        </form>
      )}
      {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
    </div>
  );
}

function StageFormModal({
  funilId,
  stage,
  onClose,
  onSaved,
}: {
  funilId: string;
  stage: Stage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState(stage?.color ?? "#0000F5");
  const [probabilidade, setProbabilidade] = useState(String(stage?.probabilidade ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const chance = Number(probabilidade);
    if (!Number.isInteger(chance) || chance < 0 || chance > 100) {
      setError("a chance é um número de 0 a 100");
      return;
    }
    setSaving(true);
    setError(null);

    const res = await fetch(stage ? `/api/stages/${stage.id}` : "/api/stages", {
      method: stage ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color, probabilidade: chance, ...(stage ? {} : { funilId }) }),
    });
    setSaving(false);

    if (!res.ok) {
      setError(await erroDe(res, "não deu pra salvar a etapa"));
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-4">{stage ? "Editar etapa" : "Nova etapa"}</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Nome</label>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Demonstração"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Chance de fechar nesta etapa (%)</label>
            <input
              value={probabilidade}
              onChange={(e) => setProbabilidade(e.target.value)}
              inputMode="numeric"
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
