"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher, ROTULO_TAREFA, type TipoTarefa, type Usuario } from "./tipos";

type Tarefa = {
  id: string;
  tipo: TipoTarefa;
  titulo: string;
  venceEm: string;
  concluidaEm: string | null;
  responsavel: { id: string; name: string } | null;
};

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Valor padrão do campo de data: amanhã às 09:00, no formato do datetime-local. */
function amanhaDeManha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Próximos passos de uma negociação. A pergunta que esta lista responde é
 * "o que acontece a seguir, e quando?" — negociação sem resposta pra isso é
 * a que esfria.
 */
export function TarefasNegociacao({
  negociacaoId,
  usuarios,
  somenteLeitura,
  onMudou,
}: {
  negociacaoId: string;
  usuarios: Usuario[];
  somenteLeitura: boolean;
  onMudou: () => void;
}) {
  const { data: tarefas, mutate } = useSWR<Tarefa[]>(`/api/negociacoes/${negociacaoId}/tarefas`, fetcher);
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoTarefa>("LIGACAO");
  const [venceEm, setVenceEm] = useState(amanhaDeManha);
  const [responsavelId, setResponsavelId] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return;
    setErro(null);
    const res = await fetch(`/api/negociacoes/${negociacaoId}/tarefas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        titulo: titulo.trim(),
        venceEm: new Date(venceEm).toISOString(),
        ...(responsavelId ? { responsavelId } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErro(typeof body.error === "string" ? body.error : "não deu pra criar a tarefa");
    }
    setTitulo("");
    setVenceEm(amanhaDeManha());
    mutate();
    onMudou();
  }

  async function alternar(t: Tarefa) {
    await fetch(`/api/tarefas/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ concluida: !t.concluidaEm }),
    });
    mutate();
    onMudou();
  }

  async function apagar(t: Tarefa) {
    await fetch(`/api/tarefas/${t.id}`, { method: "DELETE" });
    mutate();
    onMudou();
  }

  const agora = Date.now();
  const campo = "rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent";

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">Próximos passos</h3>

      {!somenteLeitura && (
        <form onSubmit={criar} className="flex flex-col gap-2 mb-3">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="ex: Ligar para fechar a proposta"
            className={`${campo} w-full`}
          />
          <div className="flex flex-wrap gap-2">
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTarefa)} className={campo}>
              {Object.entries(ROTULO_TAREFA).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input type="datetime-local" value={venceEm} onChange={(e) => setVenceEm(e.target.value)} className={campo} />
            <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={campo}>
              <option value="">Eu</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
              Agendar
            </button>
          </div>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
        </form>
      )}

      {!tarefas ? (
        <p className="text-xs text-neutral-400">Carregando...</p>
      ) : tarefas.length === 0 ? (
        <p className="text-xs text-neutral-400">Nenhum passo agendado.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tarefas.map((t) => {
            const atrasada = !t.concluidaEm && new Date(t.venceEm).getTime() < agora;
            return (
              <li key={t.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!t.concluidaEm}
                  onChange={() => alternar(t)}
                  disabled={somenteLeitura}
                  className="mt-1"
                  aria-label={`Concluir ${t.titulo}`}
                />
                <div className="min-w-0 flex-1">
                  <p className={t.concluidaEm ? "line-through text-neutral-400" : ""}>{t.titulo}</p>
                  <p className={`text-[11px] ${atrasada ? "text-red-600 font-medium" : "text-neutral-400"}`}>
                    {ROTULO_TAREFA[t.tipo]} · {quando(t.venceEm)}
                    {atrasada && " · atrasada"}
                    {t.responsavel && ` · ${t.responsavel.name}`}
                  </p>
                </div>
                {!somenteLeitura && (
                  <button onClick={() => apagar(t)} className="text-neutral-300 hover:text-red-600 text-sm" aria-label="Apagar tarefa">
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
