"use client";

import { useState } from "react";
import useSWR from "swr";

type AutoReply = {
  id: string;
  keyword: string;
  response: string;
  isDefault: boolean;
  createdAt: string;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function AutomationsPanel() {
  const { data: rules, mutate } = useSWR<AutoReply[]>("/api/autoreplies", fetcher);
  const [keyword, setKeyword] = useState("");
  const [response, setResponse] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/autoreplies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, response, isDefault }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "não deu pra criar a regra");
      return;
    }
    setKeyword("");
    setResponse("");
    setIsDefault(false);
    mutate();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/autoreplies/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-neutral-600 mb-6">
        Quando chega mensagem de alguém sem atendente atribuído, o sistema procura uma regra cuja
        palavra-chave apareça no texto e responde sozinho. Se nenhuma bater, usa a regra marcada
        como padrão (se existir). Assim que um atendente assume a conversa, a automação para.
      </p>

      <form onSubmit={handleCreate} className="rounded-lg border border-neutral-200 bg-white p-4 mb-6 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-xs font-medium text-neutral-700 mb-1">Palavra-chave</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              disabled={isDefault}
              placeholder={isDefault ? "não se aplica à resposta padrão" : "ex: horário"}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm disabled:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-neutral-600 sm:pt-5">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Resposta padrão (fallback)
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">Resposta</label>
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            required
            rows={2}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button
          type="submit"
          className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Adicionar regra
        </button>
      </form>

      <div className="flex flex-col gap-2">
        {rules?.length === 0 && (
          <p className="text-sm text-neutral-500">Nenhuma automação criada ainda.</p>
        )}
        {rules?.map((rule) => (
          <div
            key={rule.id}
            className="rounded-lg border border-neutral-200 bg-white p-4 flex items-start justify-between gap-4"
          >
            <div>
              <p className="text-xs font-mono text-accent mb-1">
                {rule.isDefault ? "PADRÃO" : `"${rule.keyword}"`}
              </p>
              <p className="text-sm text-neutral-800">{rule.response}</p>
            </div>
            <button onClick={() => handleDelete(rule.id)} className="text-xs text-red-600 hover:underline shrink-0">
              Remover
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
