"use client";

import { useState } from "react";
import useSWR from "swr";
import { secao, botaoSecundario, fetcher } from "../comum";

type Painel = {
  dias: number;
  recebidos: number;
  recebidosAnterior: number;
  variacaoRecebidos: number | null;
  semTelefone: number;
  nuncaAtendidos: number;
  medianaMin: number | null;
  medianaAnteriorMin: number | null;
  percentualAte15Min: number | null;
  tempo: { excelente: number; atencao: number; critico: number; aguardando: number; respondidos: number };
  paraAtender: { id: string; nome: string; portal: string; carro: string | null; recebidoEm: string; esperaMin: number; semTelefone: boolean; negociacaoId: string | null; conversaId: string | null; vendedor: string | null }[];
  origem: { portal: string; nome: string; leads: number; percentual: number; respondidos: number; medianaMin: number | null; vendas: number }[];
  vendedores: { id: string | null; nome: string; leads: number; semRespostaAgora: number; medianaMin: number | null }[];
  porDia: { dia: string; leads: number }[];
};

/** "12 min", "3 h", "2 dias": o tempo como a equipe fala. */
export function duracao(min: number | null): string {
  if (min === null) return "—";
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

const PERIODOS = [7, 30, 90];

function Cartao({ titulo, valor, detalhe, destaque }: { titulo: string; valor: string; detalhe?: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${destaque ? "border-red-200 bg-red-50" : "border-neutral-200 bg-surface"}`}>
      <p className="text-xs text-neutral-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${destaque ? "text-red-700" : ""}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-neutral-500">{detalhe}</p>}
    </div>
  );
}

/** Veículos > Leads: quem precisa de atenção agora e quão rápido a loja responde os leads dos portais. */
export function PainelDeLeads() {
  const [dias, setDias] = useState(30);
  const { data, mutate } = useSWR<Painel>(`/api/veiculos/leads/painel?dias=${dias}`, fetcher, { refreshInterval: 60_000 });
  const [marcando, setMarcando] = useState<string | null>(null);

  async function jaRespondi(id: string) {
    setMarcando(id);
    await fetch(`/api/leads/${id}/respondido`, { method: "POST" });
    setMarcando(null);
    mutate();
  }

  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;
  const t = data.tempo;
  const totalBarra = t.excelente + t.atencao + t.critico + t.aguardando;
  const maxDia = Math.max(1, ...data.porDia.map((d) => d.leads));
  const sinal = (n: number | null) => (n === null ? "" : `${n > 0 ? "+" : ""}${n}% sobre o período anterior`);

  return (
    <div className="flex flex-col gap-4" data-testid="painel-de-leads">
      <div className="flex items-center justify-end gap-1 text-sm">
        {PERIODOS.map((d) => (
          <button key={d} type="button" onClick={() => setDias(d)} className={`rounded-md px-3 py-1.5 ${dias === d ? "bg-neutral-100 font-semibold" : "text-neutral-500 hover:text-neutral-800"}`}>
            {d} dias
          </button>
        ))}
      </div>

      {data.nuncaAtendidos > 0 ? (
        <section className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4" data-testid="precisa-de-atencao">
          <h2 className="text-sm font-semibold text-red-800">
            Precisa de atenção: {data.nuncaAtendidos} {data.nuncaAtendidos === 1 ? "lead sem resposta" : "leads sem resposta"} (últimos 30 dias)
          </h2>
          <ul className="flex flex-col divide-y divide-red-100">
            {data.paraAtender.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium">{l.nome}</span>
                <span className="text-neutral-600">
                  {l.portal}
                  {l.carro ? ` · ${l.carro}` : ""}
                </span>
                <span className="text-xs text-red-700">há {duracao(l.esperaMin)}</span>
                {l.vendedor && <span className="text-xs text-neutral-500">com {l.vendedor}</span>}
                {l.semTelefone && <span className="text-xs text-amber-700">sem telefone</span>}
                <span className="ml-auto flex gap-2">
                  {l.conversaId && (
                    <a href={`/inbox?open=${l.conversaId}`} className={botaoSecundario}>
                      Abrir conversa
                    </a>
                  )}
                  <button type="button" onClick={() => jaRespondi(l.id)} disabled={marcando === l.id} className={botaoSecundario} title="Use quando você respondeu por ligação ou fora do sistema">
                    Já respondi
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {data.nuncaAtendidos > data.paraAtender.length && <p className="text-xs text-neutral-600">Mostrando os {data.paraAtender.length} mais recentes.</p>}
        </section>
      ) : (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" data-testid="tudo-respondido">
          Nenhum lead sem resposta nos últimos 30 dias.
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo={`Leads recebidos (${data.dias} dias)`} valor={String(data.recebidos)} detalhe={sinal(data.variacaoRecebidos)} />
        <Cartao titulo="Sem resposta agora" valor={String(data.nuncaAtendidos)} detalhe="últimos 30 dias" destaque={data.nuncaAtendidos > 0} />
        <Cartao titulo="Tempo típico da 1ª resposta" valor={duracao(data.medianaMin)} detalhe={data.medianaAnteriorMin !== null ? `período anterior: ${duracao(data.medianaAnteriorMin)}` : "o meio da fila: metade respondeu mais rápido"} />
        <Cartao titulo="Respondidos em até 15 min" valor={data.percentualAte15Min === null ? "—" : `${data.percentualAte15Min}%`} detalhe={`${t.respondidos} respondido${t.respondidos === 1 ? "" : "s"} no período`} />
      </div>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Tempo de resposta</h2>
        {totalBarra === 0 ? (
          <p className="text-sm text-neutral-500">Sem leads no período.</p>
        ) : (
          <>
            <div className="flex h-3 overflow-hidden rounded-full bg-neutral-100" role="img" aria-label="Distribuição do tempo de resposta">
              <div className="bg-emerald-500" style={{ width: `${(t.excelente / totalBarra) * 100}%` }} />
              <div className="bg-amber-400" style={{ width: `${(t.atencao / totalBarra) * 100}%` }} />
              <div className="bg-red-500" style={{ width: `${(t.critico / totalBarra) * 100}%` }} />
              <div className="bg-neutral-300" style={{ width: `${(t.aguardando / totalBarra) * 100}%` }} />
            </div>
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-500" />Excelente (até 15 min): <b>{t.excelente}</b></li>
              <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-400" />Atenção (15 a 30 min): <b>{t.atencao}</b></li>
              <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-red-500" />Crítico (mais de 30 min ou sem resposta): <b>{t.critico}</b></li>
              <li><span className="mr-2 inline-block h-2 w-2 rounded-full bg-neutral-300" />Aguardando (chegou agora): <b>{t.aguardando}</b></li>
            </ul>
          </>
        )}
      </section>

      <section className={secao}>
        <h2 className="text-sm font-semibold">Leads por dia (últimos 14 dias)</h2>
        <div className="flex h-28 items-end gap-1.5" role="img" aria-label="Leads por dia">
          {data.porDia.map((d) => (
            <div key={d.dia} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${d.dia.split("-").reverse().join("/")}: ${d.leads}`}>
              <span className="text-[10px] tabular-nums text-neutral-500">{d.leads || ""}</span>
              <div className="w-full rounded-t bg-accent/70" style={{ height: `${Math.max(2, (d.leads / maxDia) * 72)}px` }} />
              <span className="text-[10px] text-neutral-400">{d.dia.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={secao}>
          <h2 className="text-sm font-semibold">Origem dos leads</h2>
          {data.origem.length === 0 ? (
            <p className="text-sm text-neutral-500">Sem leads no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr><th className="py-1 pr-2 font-normal">Portal</th><th className="px-2 text-right font-normal">Leads</th><th className="px-2 text-right font-normal">%</th><th className="px-2 text-right font-normal">Tempo típico</th><th className="pl-2 text-right font-normal">Vendas</th></tr>
                </thead>
                <tbody>
                  {data.origem.map((o) => (
                    <tr key={o.portal} className="border-t border-neutral-100">
                      <td className="py-1.5 pr-2">{o.nome}</td>
                      <td className="px-2 text-right tabular-nums">{o.leads}</td>
                      <td className="px-2 text-right tabular-nums">{o.percentual.toLocaleString("pt-BR")}%</td>
                      <td className="px-2 text-right tabular-nums">{duracao(o.medianaMin)}</td>
                      <td className="pl-2 text-right tabular-nums">{o.vendas || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={secao}>
          <h2 className="text-sm font-semibold">Vendedores</h2>
          {data.vendedores.length === 0 ? (
            <p className="text-sm text-neutral-500">Sem leads no período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-neutral-500">
                  <tr><th className="py-1 pr-2 font-normal">Vendedor</th><th className="px-2 text-right font-normal">Leads</th><th className="px-2 text-right font-normal">Sem resposta</th><th className="pl-2 text-right font-normal">Tempo típico</th></tr>
                </thead>
                <tbody>
                  {data.vendedores.map((v) => (
                    <tr key={v.id ?? "sem"} className="border-t border-neutral-100">
                      <td className="py-1.5 pr-2">{v.nome}</td>
                      <td className="px-2 text-right tabular-nums">{v.leads}</td>
                      <td className={`px-2 text-right tabular-nums ${v.semRespostaAgora ? "font-semibold text-red-700" : ""}`}>{v.semRespostaAgora || "—"}</td>
                      <td className="pl-2 text-right tabular-nums">{duracao(v.medianaMin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <p className="text-xs text-neutral-500">
        Como contamos: o lead é considerado respondido quando uma pessoa da loja (pelo Inbox ou pelo celular) ou o Vendedor IA manda mensagem no WhatsApp depois que ele chegou, ou quando alguém clica em &quot;Já respondi&quot; (ligação, por exemplo). Mensagem automática de menu ou saudação não conta.
        {data.semTelefone > 0 ? ` ${data.semTelefone} lead(s) do período vieram sem telefone: só dá para responder por e-mail ou pelo portal.` : ""}
      </p>
    </div>
  );
}
