"use client";

import { useState } from "react";
import { ROTULO_TAREFA, type TipoTarefa } from "./tipos";

export type ResultadoLigacao = "ATENDEU" | "NAO_ATENDEU" | "RECADO" | "NUMERO_INVALIDO";

export const ROTULO_RESULTADO: Record<ResultadoLigacao, string> = {
  ATENDEU: "Atendeu",
  NAO_ATENDEU: "Não atendeu",
  RECADO: "Deixei recado",
  NUMERO_INVALIDO: "Número inválido",
};

/** Resultados que pedem uma nova tentativa: marcados por padrão para reagendar. */
const PEDE_NOVA_TENTATIVA: ResultadoLigacao[] = ["NAO_ATENDEU", "RECADO"];

const DIAS = [
  { dias: 1, rotulo: "amanhã" },
  { dias: 3, rotulo: "em 3 dias" },
  { dias: 7, rotulo: "em 1 semana" },
];

/** Dia daqui a `dias`, às 9h de Brasília (12h UTC), em ISO. */
function proximaData(dias: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + dias);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

/**
 * Conclui uma tarefa. Em ligação, pergunta o que aconteceu — é o registro que
 * depois responde "quantas tentativas até falar com o cliente?" — e, se não
 * deu certo, já oferece a próxima tentativa, porque ligação não atendida sem
 * nova tentativa agendada é negócio esquecido.
 */
export function ConcluirTarefa({
  tarefa,
  onFechar,
  onConcluida,
}: {
  tarefa: { id: string; tipo: TipoTarefa; titulo: string; negociacaoId: string; responsavelId: string | null };
  onFechar: () => void;
  onConcluida: () => void;
}) {
  const ligacao = tarefa.tipo === "LIGACAO";
  const [resultado, setResultado] = useState<ResultadoLigacao | "">("");
  const [anotacao, setAnotacao] = useState("");
  const [reagendar, setReagendar] = useState(false);
  const [dias, setDias] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function escolher(r: ResultadoLigacao) {
    setResultado(r);
    setReagendar(PEDE_NOVA_TENTATIVA.includes(r));
  }

  async function concluir() {
    if (ligacao && !resultado) return setErro("escolha o que aconteceu na ligação");
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/tarefas/${tarefa.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concluida: true,
          ...(ligacao ? { resultado } : {}),
          ...(anotacao.trim() ? { anotacao: anotacao.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return setErro(typeof body.error === "string" ? body.error : "não deu pra concluir");
      }

      if (reagendar) {
        await fetch(`/api/negociacoes/${tarefa.negociacaoId}/tarefas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tipo: tarefa.tipo,
            titulo: tarefa.titulo,
            venceEm: proximaData(dias),
            ...(tarefa.responsavelId ? { responsavelId: tarefa.responsavelId } : {}),
          }),
        });
      }
      onConcluida();
    } finally {
      setSalvando(false);
    }
  }

  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent";
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onFechar}>
      <div className="bg-surface rounded-lg p-6 w-full max-w-sm shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-1">Concluir {ROTULO_TAREFA[tarefa.tipo].toLowerCase()}</h2>
        <p className="text-xs text-neutral-500 mb-4 break-words">{tarefa.titulo}</p>

        {ligacao && (
          <div className="mb-3">
            <p className="text-xs font-medium text-neutral-700 mb-1.5">O que aconteceu?</p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(ROTULO_RESULTADO) as ResultadoLigacao[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => escolher(r)}
                  className={`rounded-md border px-3 py-2 text-sm ${
                    resultado === r ? "border-accent bg-accent/10 text-accent font-medium" : "border-neutral-300 hover:bg-neutral-50"
                  }`}
                >
                  {ROTULO_RESULTADO[r]}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          value={anotacao}
          onChange={(e) => setAnotacao(e.target.value)}
          placeholder="Anotação (opcional)"
          rows={2}
          className={campo}
        />

        <label className="flex items-center gap-2 text-sm mt-3">
          <input type="checkbox" checked={reagendar} onChange={(e) => setReagendar(e.target.checked)} />
          Agendar nova tentativa
          <select
            value={dias}
            onChange={(e) => setDias(Number(e.target.value))}
            disabled={!reagendar}
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-40"
          >
            {DIAS.map((d) => (
              <option key={d.dias} value={d.dias}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </label>

        {erro && <p className="text-sm text-red-600 mt-3">{erro}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onFechar} className="px-3 py-2 text-sm text-neutral-500 hover:text-neutral-800">
            Cancelar
          </button>
          <button
            onClick={concluir}
            disabled={salvando}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Concluir"}
          </button>
        </div>
      </div>
    </div>
  );
}
