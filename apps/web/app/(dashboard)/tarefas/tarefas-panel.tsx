"use client";

import { useState } from "react";
import Link from "next/link";
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
  /** Nulos na tarefa geral, sem cliente. */
  negociacao: { id: string; titulo: string; funil: string } | null;
  contato: { id: string; nome: string | null; telefone: string | null } | null;
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
  const [nova, setNova] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const q = new URLSearchParams({ quando });
  if (responsavel) q.set("responsavelId", responsavel);
  if (tipo) q.set("tipo", tipo);

  const { data, mutate } = useSWR<Resposta>(`/api/tarefas?${q}`, fetcher, {
    refreshInterval: LISTING_INTERVAL,
    keepPreviousData: true,
  });

  async function abrirConversa(t: Tarefa) {
    if (!t.contato) return;
    setErro(null);
    const res = await fetch(`/api/contacts/${t.contato.id}/start-conversation?assumir=0`, { method: "POST" });
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
        <button
          onClick={() => setNova(true)}
          className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          Nova tarefa
        </button>
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
            const fone = t.contato?.telefone ?? null;
            return (
              <li key={t.id} className="rounded-lg border border-neutral-200 bg-surface p-3 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1 basis-64">
                  <p className={`text-sm font-medium ${t.concluidaEm ? "line-through text-neutral-400" : ""}`}>{t.titulo}</p>
                  {t.negociacao && t.contato ? (
                    <p className="text-xs text-neutral-500 truncate">
                      {t.contato.nome || "Sem nome"}
                      {fone && <> · {formatarTelefone(fone)}</>} ·{" "}
                      <Link href={`/funil/${t.negociacao.id}`} className="hover:text-accent hover:underline">
                        {t.negociacao.titulo}
                      </Link>
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-400">Tarefa geral</p>
                  )}
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
                  {t.contato && (
                    <button onClick={() => abrirConversa(t)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50">
                      WhatsApp
                    </button>
                  )}
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
            negociacaoId: concluindo.negociacao?.id ?? null,
            responsavelId: concluindo.responsavel?.id ?? null,
          }}
          onFechar={() => setConcluindo(null)}
          onConcluida={() => {
            setConcluindo(null);
            mutate();
          }}
        />
      )}

      {nova && data && (
        <NovaTarefaGeral
          meuId={meuId}
          usuarios={data.usuarios}
          onFechar={() => setNova(false)}
          onCriada={() => {
            setNova(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

/** Valor padrão do campo de data: amanhã às 09:00, no formato do datetime-local. */
function amanhaDeManha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Tarefa sem cliente (reunião Believe, 29/10): "conferir o estoque", "mandar
 * os boletos ao contador". As de cliente continuam nascendo na negociação.
 */
function NovaTarefaGeral({
  meuId,
  usuarios,
  onFechar,
  onCriada,
}: {
  meuId: string;
  usuarios: { id: string; name: string }[];
  onFechar: () => void;
  onCriada: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<TipoTarefa>("TAREFA");
  const [venceEm, setVenceEm] = useState(amanhaDeManha());
  const [responsavelId, setResponsavelId] = useState(meuId);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) return setErro("descreva a tarefa");
    if (!venceEm) return setErro("escolha a data");
    setErro(null);
    setSalvando(true);
    const res = await fetch("/api/tarefas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titulo: titulo.trim(), tipo, venceEm: new Date(venceEm).toISOString(), responsavelId: responsavelId || null }),
    });
    setSalvando(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErro(typeof body.error === "string" ? body.error : "não deu pra criar a tarefa");
    }
    onCriada();
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-semibold mb-1">Nova tarefa</h2>
        <p className="text-xs text-neutral-500 mb-4">Tarefa da equipe, sem cliente. A de cliente se cria dentro da negociação.</p>
        <div className="flex flex-col gap-3">
          <label className="text-xs font-medium text-neutral-700">
            O que fazer
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus placeholder="ex: Conferir o estoque" className={`${campo} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-neutral-700">
              Tipo
              <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoTarefa)} className={`${campo} mt-1`}>
                {Object.entries(ROTULO_TAREFA).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-neutral-700">
              Responsável
              <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={`${campo} mt-1`}>
                <option value="">Sem responsável</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === meuId ? `${u.name} (eu)` : u.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="text-xs font-medium text-neutral-700">
            Quando
            <input type="datetime-local" value={venceEm} onChange={(e) => setVenceEm(e.target.value)} className={`${campo} mt-1`} />
          </label>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            Criar tarefa
          </button>
        </div>
      </form>
    </div>
  );
}

