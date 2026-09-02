"use client";

import { useState } from "react";
import useSWR from "swr";

type AutoReply = {
  id: string;
  keyword: string;
  response: string;
  isDefault: boolean;
  isGreeting: boolean;
  createdAt: string;
};

// Os três tipos são mutuamente exclusivos: uma regra dispara por palavra, ou
// no primeiro contato, ou como último recurso. Dois checkboxes soltos
// deixariam marcar "saudação" e "padrão" ao mesmo tempo, que não quer dizer
// nada — e o comportamento resultante teria que ser adivinhado pela pessoa.
type Tipo = "palavra" | "saudacao" | "padrao";

const TIPOS: { valor: Tipo; rotulo: string; ajuda: string }[] = [
  {
    valor: "palavra",
    rotulo: "Quando a mensagem tiver uma palavra",
    ajuda: "Responde sempre que o texto do cliente contiver a palavra-chave.",
  },
  {
    valor: "saudacao",
    rotulo: "No primeiro contato do cliente",
    ajuda:
      'Responde a quem nunca falou com a empresa, seja lá o que a pessoa escreva. Um "bom dia" já basta. Cada cliente recebe uma vez só, nunca de novo.',
  },
  {
    valor: "padrao",
    rotulo: "Quando nada mais se aplicar",
    ajuda: "Último recurso: vale para toda mensagem que não caiu em nenhuma regra acima.",
  },
];

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function etiqueta(rule: AutoReply) {
  if (rule.isGreeting) return "1º CONTATO";
  if (rule.isDefault) return "PADRÃO";
  return `"${rule.keyword}"`;
}

export function AutomationsPanel() {
  const { data: rules, mutate } = useSWR<AutoReply[]>("/api/autoreplies", fetcher);
  const [tipo, setTipo] = useState<Tipo>("palavra");
  const [keyword, setKeyword] = useState("");
  const [response, setResponse] = useState("");
  const [error, setError] = useState<string | null>(null);

  const jaTemSaudacao = rules?.some((r) => r.isGreeting) ?? false;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/autoreplies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword: tipo === "palavra" ? keyword : "",
        response,
        isDefault: tipo === "padrao",
        isGreeting: tipo === "saudacao",
      }),
    });
    if (!res.ok) {
      const body = await res.json();
      setError(typeof body.error === "string" ? body.error : "não deu pra criar a regra");
      return;
    }
    setKeyword("");
    setResponse("");
    setTipo("palavra");
    mutate();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/autoreplies/${id}`, { method: "DELETE" });
    mutate();
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-neutral-600 mb-2">
        Quando chega mensagem de alguém sem atendente atribuído, o sistema responde sozinho. Assim
        que um atendente assume a conversa, a automação para.
      </p>
      <p className="text-sm text-neutral-600 mb-6">
        Cada mensagem recebida gera no máximo uma resposta. A ordem é: palavra-chave, aviso de fora
        do horário, saudação de primeiro contato e, por último, a resposta padrão.
      </p>

      <form onSubmit={handleCreate} className="rounded-lg border border-neutral-200 bg-surface p-4 mb-6 flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-xs font-medium text-neutral-700 mb-1">Quando responder</legend>
          {TIPOS.map((t) => {
            const bloqueado = t.valor === "saudacao" && jaTemSaudacao;
            return (
              <label
                key={t.valor}
                className={`flex gap-2 text-sm ${bloqueado ? "opacity-50" : "cursor-pointer"}`}
              >
                <input
                  type="radio"
                  name="tipo"
                  className="mt-1 shrink-0"
                  checked={tipo === t.valor}
                  disabled={bloqueado}
                  onChange={() => setTipo(t.valor)}
                />
                <span>
                  <span className="text-neutral-800">{t.rotulo}</span>
                  <span className="block text-xs text-neutral-500">
                    {bloqueado ? "Já existe uma saudação. Remova a atual para criar outra." : t.ajuda}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {tipo === "palavra" && (
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Palavra-chave</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
              placeholder="ex: horário"
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        )}

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
            className="rounded-lg border border-neutral-200 bg-surface p-4 flex items-start justify-between gap-4"
          >
            <div>
              <p className="text-xs font-mono text-accent mb-1">{etiqueta(rule)}</p>
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
