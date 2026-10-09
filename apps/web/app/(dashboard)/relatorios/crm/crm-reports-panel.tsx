"use client";

import { useState } from "react";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { formatarTaxa } from "@/lib/funil-indicadores";
import { intervaloDoPeriodo, ROTULO_PERIODO, type Periodo } from "@/lib/periodo";
import type { LinhaDeOrigem } from "@/lib/relatorio-origem";
import type { RelatorioLigacoes } from "@/lib/relatorio-ligacoes";

type Aba = "ligacoes" | "origens";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "erro");
  return body;
};

const formatarDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Cartao({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface px-4 py-3 min-w-[150px]">
      <p className="text-[11px] text-neutral-500">{titulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-[11px] text-neutral-400">{nota}</p>}
    </div>
  );
}

export function CrmReportsPanel() {
  const [aba, setAba] = useState<Aba>("ligacoes");
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";
  const { desde, ate: fim } = intervaloDoPeriodo(periodo, de, ate);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 border-b border-neutral-200 mr-2">
          {(
            [
              ["ligacoes", "Ligações"],
              ["origens", "Origem dos leads"],
            ] as [Aba, string][]
          ).map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`px-3 py-2 text-sm -mb-px border-b-2 ${
                aba === id ? "border-accent text-accent font-medium" : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

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

      {aba === "ligacoes" ? <Ligacoes desde={desde} ate={fim} campo={campo} /> : <Origens desde={desde} ate={fim} campo={campo} />}
    </div>
  );
}

/* ------------------------------------------------------------------ Ligações */

type RespLigacoes = RelatorioLigacoes & { usuarios: { id: string; name: string }[] };

const ROTULO_RESULTADO = { ATENDEU: "Atendeu", NAO_ATENDEU: "Não atendeu", RECADO: "Deixei recado", NUMERO_INVALIDO: "Número inválido" } as const;

function Ligacoes({ desde, ate, campo }: { desde?: string; ate?: string; campo: string }) {
  const [responsavel, setResponsavel] = useState("");
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (ate) q.set("ate", ate);
  if (responsavel) q.set("responsavelId", responsavel);

  const { data, error } = useSWR<RespLigacoes>(`/api/crm-relatorios/ligacoes?${q}`, fetcher, { keepPreviousData: true });
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const nome = (id: string | null) => (id ? (data.usuarios.find((u) => u.id === id)?.name ?? "—") : "Sem responsável");
  const maiorDia = Math.max(1, ...data.porDia.map((d) => d.feitas));
  const maiorTent = Math.max(1, ...data.distribuicaoTentativas.map((t) => t.negociacoes));
  const r = data.porResultado;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
          <option value="">Toda a equipe</option>
          <option value="sem">Sem responsável</option>
          {data.usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Cartao titulo="Ligações feitas" valor={String(data.feitas)} />
        <Cartao
          titulo="Taxa de atendimento"
          valor={formatarTaxa(data.taxaAtendimento)}
          nota="atendeu / (atendeu + não atendeu + recado)"
        />
        <Cartao
          titulo="Tentativas até o contato"
          valor={data.tentativasMedias === null ? "—" : data.tentativasMedias.toFixed(1).replace(".", ",")}
          nota="média de ligações até o 1º atendimento"
        />
        <Cartao titulo="Feitas no prazo" valor={formatarTaxa(data.taxaNoPrazo)} nota="até o fim do dia combinado" />
        <Cartao titulo="Atrasadas agora" valor={String(data.pendentesAtrasadas)} nota="pendentes já vencidas" />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <h2 className="text-sm font-semibold mb-3">O que aconteceu</h2>
          {data.feitas === 0 ? (
            <p className="text-xs text-neutral-400">Nenhuma ligação concluída no período.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(Object.keys(ROTULO_RESULTADO) as (keyof typeof ROTULO_RESULTADO)[]).map((k) => (
                <li key={k}>
                  <div className="flex justify-between text-xs">
                    <span>{ROTULO_RESULTADO[k]}</span>
                    <span className="tabular-nums text-neutral-500">
                      {r[k]} · {formatarTaxa(r[k] / data.feitas)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-100 mt-1">
                    <div className="h-2 rounded-full bg-accent" style={{ width: `${(r[k] / data.feitas) * 100}%` }} />
                  </div>
                </li>
              ))}
              {r.semResultado > 0 && (
                <li className="text-[11px] text-neutral-400">{r.semResultado} concluída(s) sem resultado registrado.</li>
              )}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <h2 className="text-sm font-semibold mb-1">Quantas ligações até falar com o cliente</h2>
          <p className="text-[11px] text-neutral-500 mb-3">Negociações cujo primeiro atendimento foi no período.</p>
          <ul className="flex flex-col gap-2">
            {data.distribuicaoTentativas.map((t) => (
              <li key={t.tentativas}>
                <div className="flex justify-between text-xs">
                  <span>{t.tentativas === 5 ? "5 ou mais" : t.tentativas === 1 ? "1 ligação" : `${t.tentativas} ligações`}</span>
                  <span className="tabular-nums text-neutral-500">{t.negociacoes}</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 mt-1">
                  <div className="h-2 rounded-full bg-accent" style={{ width: `${(t.negociacoes / maiorTent) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Pessoa</th>
              <th className="text-right px-4 py-2 font-medium">Feitas</th>
              <th className="text-right px-4 py-2 font-medium">Atendidas</th>
              <th className="text-right px-4 py-2 font-medium">Taxa de atendimento</th>
              <th className="text-right px-4 py-2 font-medium">No prazo</th>
              <th className="text-right px-4 py-2 font-medium">Atrasadas</th>
            </tr>
          </thead>
          <tbody>
            {data.porPessoa.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma ligação no período.
                </td>
              </tr>
            )}
            {data.porPessoa.map((p) => (
              <tr key={p.responsavelId ?? "sem"} className="border-t border-neutral-100">
                <td className="px-4 py-2.5 font-medium">{nome(p.responsavelId)}</td>
                <td className="px-4 py-2.5 text-right">{p.feitas}</td>
                <td className="px-4 py-2.5 text-right">{p.atendeu}</td>
                <td className="px-4 py-2.5 text-right">{formatarTaxa(p.taxaAtendimento)}</td>
                <td className="px-4 py-2.5 text-right">{p.noPrazo}</td>
                <td className={`px-4 py-2.5 text-right ${p.atrasadas > 0 ? "text-red-600 font-medium" : ""}`}>{p.atrasadas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.porDia.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-surface p-4">
          <h2 className="text-sm font-semibold mb-3">Ligações por dia</h2>
          <div className="flex items-end gap-1 h-28 overflow-x-auto">
            {data.porDia.map((d) => (
              <div key={d.dia} className="flex flex-col items-center justify-end gap-1 h-full min-w-[22px] flex-1" title={`${formatarDia(d.dia)}: ${d.feitas} feitas, ${d.atendeu} atendidas`}>
                <span className="text-[10px] text-neutral-500 tabular-nums">{d.feitas}</span>
                <div className="w-full flex flex-col justify-end rounded-t overflow-hidden" style={{ height: `${Math.max(4, (d.feitas / maiorDia) * 70)}%` }}>
                  <div className="bg-accent/30" style={{ flex: d.feitas - d.atendeu || 0 }} />
                  <div className="bg-accent" style={{ flex: d.atendeu || 0 }} />
                </div>
                <span className="text-[10px] text-neutral-400">{formatarDia(d.dia)}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400 mt-2">Parte escura: atendidas.</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- Origens */

type RespOrigens = {
  linhas: LinhaDeOrigem[];
  total: { leads: number; ganhas: number; valorGanhoCents: number; conversaoLeadCliente: number | null };
  funis: { id: string; nome: string }[];
  funilId: string;
  temSql: boolean;
};

function Origens({ desde, ate, campo }: { desde?: string; ate?: string; campo: string }) {
  const [funilId, setFunilId] = useState("");
  const q = new URLSearchParams();
  if (desde) q.set("desde", desde);
  if (ate) q.set("ate", ate);
  if (funilId) q.set("funilId", funilId);

  const { data, error } = useSWR<RespOrigens>(`/api/crm-relatorios/origens?${q}`, fetcher, { keepPreviousData: true });
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const melhor = data.linhas
    .filter((l) => l.leads >= 5 && l.conversaoLeadCliente !== null)
    .sort((a, b) => b.conversaoLeadCliente! - a.conversaoLeadCliente!)[0];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <select value={data.funilId} onChange={(e) => setFunilId(e.target.value)} className={campo}>
          {data.funis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
          <option value="todos">Todos os funis</option>
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Cartao titulo="Leads no período" valor={String(data.total.leads)} nota="negociações criadas" />
        <Cartao titulo="Viraram cliente" valor={String(data.total.ganhas)} nota={formatarTaxa(data.total.conversaoLeadCliente)} />
        <Cartao titulo="Valor ganho" valor={centsToBRL(data.total.valorGanhoCents)} />
        {melhor && (
          <Cartao
            titulo="Melhor conversão"
            valor={melhor.origem}
            nota={`${formatarTaxa(melhor.conversaoLeadCliente)} de ${melhor.leads} leads`}
          />
        )}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Origem</th>
              <th className="text-right px-4 py-2 font-medium">Leads</th>
              <th className="text-right px-4 py-2 font-medium">% dos leads</th>
              {data.temSql && <th className="text-right px-4 py-2 font-medium">SQLs</th>}
              <th className="text-right px-4 py-2 font-medium">Em andamento</th>
              <th className="text-right px-4 py-2 font-medium">Ganhas</th>
              <th className="text-right px-4 py-2 font-medium">Perdidas</th>
              <th className="text-right px-4 py-2 font-medium">Lead → cliente</th>
              <th className="text-right px-4 py-2 font-medium">Taxa de ganho</th>
              <th className="text-right px-4 py-2 font-medium">Valor ganho</th>
              <th className="text-right px-4 py-2 font-medium">Ticket</th>
              <th className="text-right px-4 py-2 font-medium">MRR novo</th>
              <th className="text-right px-4 py-2 font-medium">Ciclo</th>
            </tr>
          </thead>
          <tbody>
            {data.linhas.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma negociação criada no período.
                </td>
              </tr>
            )}
            {data.linhas.map((l) => (
              <tr key={l.origem} className="border-t border-neutral-100">
                <td className="px-4 py-2.5 font-medium">{l.origem}</td>
                <td className="px-4 py-2.5 text-right">{l.leads}</td>
                <td className="px-4 py-2.5 text-right">{formatarTaxa(l.participacao)}</td>
                {data.temSql && <td className="px-4 py-2.5 text-right">{l.sqls}</td>}
                <td className="px-4 py-2.5 text-right">{l.abertas}</td>
                <td className="px-4 py-2.5 text-right">{l.ganhas}</td>
                <td className="px-4 py-2.5 text-right">{l.perdidas}</td>
                <td className="px-4 py-2.5 text-right font-medium">{formatarTaxa(l.conversaoLeadCliente)}</td>
                <td className="px-4 py-2.5 text-right">{formatarTaxa(l.taxaDeGanho)}</td>
                <td className="px-4 py-2.5 text-right">{centsToBRL(l.valorGanhoCents)}</td>
                <td className="px-4 py-2.5 text-right">{l.ticketMedioCents === null ? "—" : centsToBRL(l.ticketMedioCents)}</td>
                <td className="px-4 py-2.5 text-right">{centsToBRL(l.novoMrrCents)}</td>
                <td className="px-4 py-2.5 text-right">{l.cicloMedioDias === null ? "—" : `${l.cicloMedioDias} d`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400">
        O período é o da criação da negociação: &ldquo;dos leads que chegaram nele, quantos já fecharam&rdquo;. Variações como
        &ldquo;Instagram&rdquo; e &ldquo;instagram&rdquo; são somadas. &ldquo;Sem origem&rdquo; mostra quanto do funil ninguém sabe de onde veio —
        preencha a origem ao criar a negociação.
      </p>
    </div>
  );
}
