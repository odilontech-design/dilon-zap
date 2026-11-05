"use client";

import { useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { intervaloDoPeriodo, ROTULO_PERIODO, type Periodo } from "@/lib/periodo";
import type { Faixa, LinhaComissao } from "@/lib/comissao";

type Resposta = {
  linhas: LinhaComissao[];
  usuarios: { id: string; name: string }[];
  faixas: Faixa[];
  gestao: boolean;
  meuId: string;
  totalVendidoCents: number;
  totalComissaoCents: number;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "erro");
  return body;
};

/** 130 → "1,3%". */
const pct = (bp: number) => `${(bp / 100).toString().replace(".", ",")}%`;
const reais = (cents: number) => centsToBRL(cents);

function Cartao({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface px-4 py-3 min-w-[170px]">
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-[11px] text-neutral-400">{nota}</p>}
    </div>
  );
}

/**
 * Barra até a próxima faixa. O texto diz o que falta; a barra é só reforço,
 * então a leitura nunca depende da cor.
 */
function Progresso({ l }: { l: LinhaComissao }) {
  if (!l.proxima) return <span className="text-xs text-emerald-700">Faixa máxima</span>;
  const base = l.faixa?.minCents ?? 0;
  const alvo = l.proxima.minCents;
  const parte = Math.min(100, Math.max(0, ((l.vendidoCents - base) / (alvo - base)) * 100));
  return (
    <div className="min-w-[180px]">
      <div className="h-1.5 rounded-full bg-neutral-200 overflow-hidden">
        <div className="h-full rounded-full bg-accent" style={{ width: `${parte}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-neutral-500">
        Faltam {reais(l.proxima.faltaCents)} para {pct(l.proxima.taxaBp)}
      </p>
    </div>
  );
}

export function ComissaoPanel() {
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";

  const { desde, ate: fim } = intervaloDoPeriodo(periodo, de, ate);
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (fim) q.set("ate", fim);
  const { data, error } = useSWR<Resposta>(`/api/crm-relatorios/comissao?${q}`, fetcher, { keepPreviousData: true });

  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const nome = (id: string | null) => (id ? (data.usuarios.find((u) => u.id === id)?.name ?? "Usuário removido") : "Sem consultora");
  // Quem só atende e ainda não vendeu nada no período vê a própria linha zerada,
  // em vez de uma tela vazia que parece defeito.
  const linhas =
    !data.gestao && data.linhas.length === 0
      ? [{ usuarioId: data.meuId, pedidos: 0, vendidoCents: 0, faixa: null, taxaBp: 0, comissaoCents: 0, proxima: null } as LinhaComissao]
      : data.linhas;

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={campo}>
          {(Object.keys(ROTULO_PERIODO) as Periodo[]).map((p) => (
            <option key={p} value={p}>
              {ROTULO_PERIODO[p]}
            </option>
          ))}
        </select>
        {periodo === "custom" && (
          <>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={campo} aria-label="De" />
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} aria-label="Até" />
          </>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Cartao titulo={data.gestao ? "Vendido pela equipe" : "Você vendeu"} valor={reais(data.totalVendidoCents)} nota="pedidos fechados, com desconto" />
        <Cartao titulo={data.gestao ? "Comissões a pagar" : "Sua comissão"} valor={reais(data.totalComissaoCents)} nota="faixa de cada pessoa" />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-neutral-500 border-b border-neutral-200">
              <th className="px-4 py-2 font-medium">Consultora</th>
              <th className="px-4 py-2 font-medium text-right">Pedidos</th>
              <th className="px-4 py-2 font-medium text-right">Vendido</th>
              <th className="px-4 py-2 font-medium text-right">Faixa</th>
              <th className="px-4 py-2 font-medium text-right">Comissão</th>
              <th className="px-4 py-2 font-medium">Próxima faixa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.usuarioId ?? "sem"} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-2.5">{nome(l.usuarioId)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.pedidos}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{reais(l.vendidoCents)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{l.faixa ? pct(l.taxaBp) : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-semibold">{reais(l.comissaoCents)}</td>
                <td className="px-4 py-2.5">
                  <Progresso l={l} />
                </td>
              </tr>
            ))}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-xs text-neutral-400">
                  Nenhum pedido fechado no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface p-4">
        <h2 className="text-sm font-semibold mb-2">Como é calculado</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600 mb-2">
          {data.faixas.map((f) => (
            <li key={f.minCents} className="tabular-nums">
              a partir de {reais(f.minCents)}: <strong>{pct(f.taxaBp)}</strong>
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500">
          Conta o total dos pedidos <strong>fechados</strong> no período (cancelados ficam de fora), atribuído a quem criou o
          pedido. A faixa atingida vale sobre o total vendido, não só sobre o que passa do degrau. Abaixo da primeira faixa não há
          comissão.
        </p>
      </div>
    </div>
  );
}
