"use client";

import { useState } from "react";
import useSWR from "swr";

/**
 * A conexão do Vendedor IA com a Anthropic (a mesma para todas as lojas). O worker confere a cada 15 minutos e quando
 * se clica em "Testar agora"; aqui só se lê o resultado.
 */

type Estado = {
  conferido: boolean;
  chaveConfigurada: boolean;
  ok: boolean;
  resultados: {
    modelo: string;
    ok: boolean;
    ms: number | null;
    erro: string | null;
  }[];
  verificadoEm: string | null;
  emAndamento: boolean;
};

const fetcher = (u: string) => fetch(u).then((r) => (r.ok ? r.json() : null));

export function ConexaoIa() {
  const [pedindo, setPedindo] = useState(false);
  const { data, mutate } = useSWR<Estado | null>(
    "/api/admin/vendedor-ia/saude",
    fetcher,
    {
      // Enquanto espera o worker responder, olha de 2 em 2 segundos; parado, de minuto em minuto.
      refreshInterval: (d) => (d?.emAndamento ? 2_000 : 60_000),
    },
  );
  if (!data) return null;

  async function testar() {
    setPedindo(true);
    await fetch("/api/admin/vendedor-ia/saude", { method: "POST" });
    setPedindo(false);
    mutate();
  }

  let rotulo: string;
  let cor: string;
  let ajuda: string | null = null;
  if (!data.conferido) {
    rotulo = "Ainda não conferida";
    cor = "text-neutral-300";
    ajuda =
      "O worker do Vendedor IA confere sozinho em poucos minutos depois de subir. Se não aparecer nada, ele não está no ar.";
  } else if (!data.chaveConfigurada) {
    rotulo = "Sem chave da Anthropic";
    cor = "text-amber-400";
    ajuda =
      "Falta a ANTHROPIC_API_KEY no .env do servidor. Depois de colocar, reinicie o vendedor-ia-worker e clique em Testar agora.";
  } else if (data.ok) {
    rotulo = "Conectada";
    cor = "text-emerald-400";
  } else {
    rotulo = "Com problema";
    cor = "text-red-400";
    ajuda =
      "A IA não responde enquanto isso: conversas novas passam para a equipe com um aviso ao cliente.";
  }

  return (
    <section
      className="mb-8 rounded-lg border border-neutral-800 p-4"
      data-testid="conexao-ia"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-neutral-100">
          Conexão do Vendedor IA com a Anthropic
        </h2>
        <span className={`text-sm font-medium ${cor}`}>
          {data.emAndamento ? "Testando…" : rotulo}
        </span>
        <button
          onClick={testar}
          disabled={pedindo || data.emAndamento}
          className="ml-auto rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          Testar agora
        </button>
      </div>
      {ajuda && !data.emAndamento && (
        <p className="mt-2 text-xs text-neutral-400">{ajuda}</p>
      )}
      {data.resultados.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {data.resultados.map((r) => (
            <li
              key={r.modelo}
              className={r.ok ? "text-neutral-300" : "text-red-300"}
            >
              {r.ok ? "✓" : "✗"} {r.modelo}
              {r.ok && r.ms !== null
                ? ` · respondeu em ${(r.ms / 1000).toFixed(1)} s`
                : ""}
              {r.erro ? ` · ${r.erro}` : ""}
            </li>
          ))}
        </ul>
      )}
      {data.verificadoEm && (
        <p className="mt-2 text-[11px] text-neutral-500">
          Última conferência:{" "}
          {new Date(data.verificadoEm).toLocaleString("pt-BR")}
        </p>
      )}
    </section>
  );
}
