"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

type FunilDoContato = {
  id: string;
  nome: string;
  padrao: boolean;
  etapas: { id: string; name: string; color: string }[];
  negociacao: { id: string; funilId: string; stageId: string } | null;
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("não foi possível carregar");
    return r.json();
  });

/**
 * A etapa do contato em CADA funil da empresa — uma linha por funil.
 *
 * Escolher uma etapa num funil em que o contato ainda não está abre a
 * negociação ali; num em que já está, move. Não há "Sem etapa" para quem já
 * tem negociação: tirar alguém do funil é ganhar ou perder, com motivo, na
 * página da negociação (o link "abrir" leva até lá).
 */
export function EtapasPorFunil({
  contactId,
  onSalvo,
  compacto = false,
}: {
  contactId: string;
  onSalvo?: () => void;
  compacto?: boolean;
}) {
  const { data: funis, mutate } = useSWR<FunilDoContato[]>(`/api/contacts/${contactId}/funis`, fetcher);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function escolher(funilId: string, stageId: string) {
    if (!stageId) return;
    setErro(null);
    setSalvando(funilId);
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    setSalvando(null);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra salvar a etapa");
    }
    await mutate();
    onSalvo?.();
  }

  if (!funis) return <p className="text-xs text-neutral-400">Carregando funis...</p>;

  const varios = funis.length > 1;
  const campo = `w-full rounded-md border border-neutral-300 bg-surface ${compacto ? "text-sm px-2 py-1.5" : "px-2 py-1.5"} disabled:opacity-60`;

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
            value={f.negociacao?.stageId ?? ""}
            disabled={salvando === f.id}
            onChange={(e) => escolher(f.id, e.target.value)}
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
        </div>
      ))}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
