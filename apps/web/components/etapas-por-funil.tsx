"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { TarefasNegociacao } from "@/app/(dashboard)/funil/tarefas-negociacao";

type FunilDoContato = {
  id: string;
  nome: string;
  padrao: boolean;
  etapas: { id: string; name: string; color: string }[];
  negociacao: { id: string; funilId: string; stageId: string } | null;
};

type Opcoes = {
  exigirDados: boolean;
  origens: string[];
  usuarios: { id: string; name: string }[];
  meuId: string;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("não foi possível carregar");
    return r.json();
  });

/** "1.234,56" / "1234.56" / "150" → centavos; vazio ou inválido → null. */
function centavos(texto: string): number | null {
  const limpo = texto.trim().replace(/\s|R\$/g, "");
  if (!limpo) return null;
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/**
 * A etapa do contato em CADA funil da empresa — uma linha por funil.
 *
 * Escolher uma etapa num funil em que o contato ainda não está abre a
 * negociação ali; num em que já está, move. Não há "Sem etapa" para quem já
 * tem negociação: tirar alguém do funil é ganhar ou perder, com motivo, na
 * página da negociação (o link "abrir" leva até lá).
 *
 * Na empresa que exige responsável, valor e origem (Believe, 23/10), abrir
 * negociação por aqui pede os três antes — era por aqui que nasciam as
 * negociações em branco. Com `comTarefas`, mostra também os próximos passos
 * da negociação aberta: a tarefa se cria dentro da conversa com a cliente.
 */
export function EtapasPorFunil({
  contactId,
  onSalvo,
  compacto = false,
  comTarefas = false,
}: {
  contactId: string;
  onSalvo?: () => void;
  compacto?: boolean;
  comTarefas?: boolean;
}) {
  const { data: funis, mutate } = useSWR<FunilDoContato[]>(`/api/contacts/${contactId}/funis`, fetcher);
  const { data: opcoes } = useSWR<Opcoes>("/api/negociacoes/opcoes", fetcher);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // Etapa que exige o valor (a partir do orçamento) e ainda não tem: pede aqui.
  const [abrindo, setAbrindo] = useState<{ funilId: string; stageId: string; aviso: string } | null>(null);
  const [valor, setValor] = useState("");

  async function enviar(funilId: string, corpo: Record<string, unknown>): Promise<boolean | "valor"> {
    setErro(null);
    setSalvando(funilId);
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setSalvando(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      const msg = typeof b.error === "string" ? b.error : "não deu pra salvar a etapa";
      if (res.status === 422 && /valor/i.test(msg)) {
        setAbrindo({ funilId, stageId: String(corpo.stageId), aviso: msg });
        setValor("");
        return "valor";
      }
      setErro(msg);
      return false;
    }
    await mutate();
    onSalvo?.();
    return true;
  }

  async function escolher(f: FunilDoContato, stageId: string) {
    if (!stageId) return;
    setAbrindo(null);
    await enviar(f.id, { stageId, ...(!f.negociacao && opcoes ? { responsavelId: opcoes.meuId } : {}) });
  }

  async function abrirNegociacao(e: React.FormEvent) {
    e.preventDefault();
    if (!abrindo) return;
    const valorCents = centavos(valor);
    if (!valorCents) return setErro("Informe o valor.");
    const f = funis?.find((x) => x.id === abrindo.funilId);
    const ok = await enviar(abrindo.funilId, { stageId: abrindo.stageId, dealValueCents: valorCents, ...(f && !f.negociacao && opcoes ? { responsavelId: opcoes.meuId } : {}) });
    if (ok === true) setAbrindo(null);
  }

  if (!funis) return <p className="text-xs text-neutral-400">Carregando funis...</p>;

  const varios = funis.length > 1;
  const campo = `w-full rounded-md border border-neutral-300 bg-surface ${compacto ? "text-sm px-2 py-1.5" : "px-2 py-1.5"} disabled:opacity-60`;
  // Os próximos passos são da negociação aberta do funil principal (o de vendas).
  const principal = funis.find((f) => f.padrao && f.negociacao) ?? funis.find((f) => f.negociacao);

  return (
    <div className="flex flex-col gap-2">
      {funis.map((f) => (
        <div key={f.id}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-medium text-neutral-700 truncate">
              {varios ? f.nome : "Etapa do funil"}
            </span>
            {f.negociacao && (
              <Link href={`/funil/${f.negociacao.id}`} className="text-[11px] text-accent hover:underline shrink-0">
                abrir negociação
              </Link>
            )}
          </div>
          <select
            value={abrindo?.funilId === f.id ? abrindo.stageId : (f.negociacao?.stageId ?? "")}
            disabled={salvando === f.id}
            onChange={(e) => escolher(f, e.target.value)}
            aria-label={`Etapa no funil ${f.nome}`}
            className={campo}
          >
            {!f.negociacao && <option value="">Fora deste funil</option>}
            {f.etapas.map((et) => (
              <option key={et.id} value={et.id}>
                {et.name}
              </option>
            ))}
          </select>
          {abrindo?.funilId === f.id && opcoes && (
            <form onSubmit={abrirNegociacao} className="mt-2 flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/5 p-2">
              <p className="text-[11px] text-neutral-600">{abrindo.aviso}</p>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                inputMode="decimal"
                placeholder="Valor (R$) *"
                aria-label="Valor"
                className={campo}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAbrindo(null)} className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-800">
                  Cancelar
                </button>
                <button type="submit" disabled={salvando === f.id} className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
                  Salvar e mover
                </button>
              </div>
            </form>
          )}
        </div>
      ))}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {comTarefas && principal?.negociacao && opcoes && (
        <div className="mt-2">
          <p className="text-xs font-medium text-neutral-700 mb-1">Próximos passos</p>
          <TarefasNegociacao
            negociacaoId={principal.negociacao.id}
            usuarios={opcoes.usuarios}
            somenteLeitura={false}
            onMudou={() => onSalvo?.()}
          />
        </div>
      )}
    </div>
  );
}
