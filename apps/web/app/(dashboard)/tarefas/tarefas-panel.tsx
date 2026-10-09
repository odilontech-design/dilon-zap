"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { LISTING_INTERVAL } from "@/lib/polling";
import { ConcluirTarefa, ROTULO_RESULTADO, type ResultadoLigacao } from "../funil/concluir-tarefa";
import { fetcher, ROTULO_TAREFA, type TipoTarefa } from "../funil/tipos";

type Quando = "atrasadas" | "hoje" | "proximas" | "concluidas";

type Tarefa = {
  id: string;
  tipo: TipoTarefa;
  titulo: string;
  venceEm: string;
  concluidaEm: string | null;
  resultado: ResultadoLigacao | null;
  anotacao: string | null;
  responsavel: { id: string; name: string } | null;
  negociacao: { id: string; titulo: string; funil: string };
  contato: { id: string; nome: string | null; telefone: string | null };
};

type Resposta = {
  contagens: { atrasadas: number; hoje: number; proximas: number };
  usuarios: { id: string; name: string }[];
  tarefas: Tarefa[];
};

const quandoBR = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Telefone para exibir: (21) 99999-9999 quando é número brasileiro. */
function formatarTelefone(digitos: string): string {
  const d = digitos.replace(/\D/g, "");
  const local = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `+${d}`;
}

/**
 * A agenda do time: o que ligar, mandar e fazer hoje. Padrão é a fila da
 * própria pessoa — quem abre esta tela quer saber o que é dele.
 */
export function TarefasPanel({ meuId }: { meuId: string }) {
  const router = useRouter();
  const [quando, setQuando] = useState<Quando>("hoje");
  const [responsavel, setResponsavel] = useState(meuId);
  const [tipo, setTipo] = useState("");
  const [concluindo, setConcluindo] = useState<Tarefa | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const q = new URLSearchParams({ quando });
  if (responsavel) q.set("responsavelId", responsavel);
  if (tipo) q.set("tipo", tipo);

  const { data, mutate } = useSWR<Resposta>(`/api/tarefas?${q}`, fetcher, {
    refreshInterval: LISTING_INTERVAL,
    keepPreviousData: true,
  });

  async function abrirConversa(t: Tarefa) {
    setErro(null);
    const res = await fetch(`/api/contacts/${t.contato.id}/start-conversation`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setErro(typeof body.error === "string" ? body.error : "não deu pra abrir a conversa");
    router.push(`/inbox?open=${body.id}`);
  }

  async function reabrir(t: Tarefa) {
    await fetch(`/api/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concluida: false }),
    });
    mutate();
  }

  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";
  const abas: [Quando, string, number | null][] = [
    ["atrasadas", "Atrasadas", data?.contagens.atrasadas ?? null],
    ["hoje", "Hoje", data?.contagens.hoje ?? null],
    ["proximas", "Próximas", data?.contagens.proximas ?? null],
    ["concluidas", "Concluídas", null],
  ];
  const agora = Date.now();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
          <option value={meuId}>Minhas tarefas</option>
          <option value="">Todos</option>
          <option value="sem">Sem responsável</option>
          {data?.usuarios
            .filter((u) => u.id !== meuId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
          <option value="">Todos os tipos</option>
          {Object.entries(ROTULO_TAREFA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 mb-4 border-b border-neutral-200">
        {abas.map(([id, rotulo, n]) => (
          <button
            key={id}
            onClick={() => setQuando(id)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              quando === id ? "border-accent text-accent font-medium" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {rotulo}{" "}
            {n !== null && (
              <span className={`text-xs tabular-nums ${id === "atrasadas" && n > 0 ? "text-red-600 font-semibold" : "text-neutral-400"}`}>{n}</span>
            )}
          </button>
        ))}
      </div>

      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}

      {!data ? (
        <p className="text-sm text-neutral-400">Carregando...</p>
      ) : data.tarefas.length === 0 ? (
        <p className="text-sm text-neutral-400 py-10 text-center">
          {quando === "atrasadas" ? "Nada atrasado. 👏" : quando === "concluidas" ? "Nenhuma tarefa concluída neste filtro." : "Nenhuma tarefa neste filtro."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.tarefas.map((t) => {
            const atrasada = !t.concluidaEm && new Date(t.venceEm).getTime() < agora;
            const fone = t.contato.telefone;
            return (
              <li key={t.id} className="rounded-lg border border-neutral-200 bg-surface p-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className={`text-sm font-medium ${t.concluidaEm ? "line-through text-neutral-400" : ""}`}>{t.titulo}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {t.contato.nome || "Sem nome"}
                    {fone && <> · {formatarTelefone(fone)}</>} · {t.negociacao.titulo}
                  </p>
                  <p className={`text-[11px] ${atrasada ? "text-red-600 font-medium" : "text-neutral-400"}`}>
                    {ROTULO_TAREFA[t.tipo]} · {quandoBR(t.venceEm)}
                    {atrasada && " · atrasada"}
                    {t.responsavel && ` · ${t.responsavel.name}`}
                    {t.concluidaEm && t.resultado && ` · ${ROTULO_RESULTADO[t.resultado]}`}
                  </p>
                  {t.anotacao && <p className="text-[11px] text-neutral-500 mt-0.5">“{t.anotacao}”</p>}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!t.concluidaEm && t.tipo === "LIGACAO" && fone && (
                    // tel: abre o discador do celular ou o app de ligação do
                    // computador. O sistema não faz a chamada — registra o resultado.
                    <a
                      href={`tel:+${fone.replace(/\D/g, "")}`}
                      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
                    >
                      Ligar
                    </a>
                  )}
                  <button onClick={() => abrirConversa(t)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                    WhatsApp
                  </button>
                  {t.concluidaEm ? (
                    <button onClick={() => reabrir(t)} className="text-xs text-neutral-500 hover:text-accent">
                      Reabrir
                    </button>
                  ) : (
                    <button
                      onClick={() => setConcluindo(t)}
                      className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Concluir
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {concluindo && (
        <ConcluirTarefa
          tarefa={{
            id: concluindo.id,
            tipo: concluindo.tipo,
            titulo: concluindo.titulo,
            negociacaoId: concluindo.negociacao.id,
            responsavelId: concluindo.responsavel?.id ?? null,
          }}
          onFechar={() => setConcluindo(null)}
          onConcluida={() => {
            setConcluindo(null);
            mutate();
          }}
        />
      )}
    </div>
  );
}
