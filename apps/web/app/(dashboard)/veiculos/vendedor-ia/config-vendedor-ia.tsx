"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { botaoPrimario, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";

type Dados = {
  config: {
    ativo: boolean;
    nomeAssistente: string;
    instrucoes: string | null;
    modelo: string;
    esforco: "low" | "medium" | "high";
    setorTransferenciaId: string | null;
    limiteLeadsMes: number;
    limiteCustoMesCents: number | null;
    leadsContratados: number | null;
  };
  setores: { id: string; nome: string }[];
  estimativas: { id: string; nome: string; aproximado: boolean; usdPorLead: number }[];
  painel: {
    leads: number;
    transferidas: number;
    custoMicrosUsd: number;
    custoMedioMicrosUsd: number | null;
    porMotivo: { motivo: string; total: number }[];
    ultimas: { conversationId: string; contato: string; status: "ATIVA" | "TRANSFERIDA"; motivo: string | null; resumo: string | null; turnos: number; atualizadaEm: string; custoMicrosUsd: number }[];
  };
};

const ROTULO_ESFORCO = { low: "Baixo (respostas rápidas, recomendado para conversa)", medium: "Médio", high: "Alto (mais raciocínio, mais caro)" };

const usd = (micros: number) => (micros / 1_000_000).toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const EXEMPLO = `Endereço: Av. Brasil, 1000, Centro. Abrimos de segunda a sexta das 8h às 18h e sábado das 8h às 12h.
Aceitamos carro na troca (avaliação na loja) e financiamos em até 60x com os principais bancos.
Todos os carros são revisados e têm 3 meses de garantia de motor e câmbio.`;

/** Configuração do Vendedor IA e o painel do mês (leads, transferências, custo real). */
export function ConfigVendedorIa() {
  const { data, error, mutate } = useSWR<Dados>("/api/vendedor-ia/config", fetcher, { refreshInterval: 30_000 });
  const [f, setF] = useState<Dados["config"] | null>(null);
  const [cambio, setCambio] = useState("5,50");
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (data && !f) setF(data.config);
  }, [data, f]);

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data || !f) return <p className="text-sm text-neutral-500">Carregando…</p>;
  const taxa = Number(cambio.replace(",", ".")) || 0;
  const p = data.painel;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    setSalvando(true);
    const r = await fetch("/api/vendedor-ia/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setSalvando(false);
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    setAviso({ texto: f!.ativo ? "Vendedor IA ligado. Ele atende as próximas mensagens de clientes no número geral." : "Configuração salva. O Vendedor IA está desligado." });
    mutate();
  }

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <section className={secao}>
        <h2 className="text-sm font-semibold">Este mês</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ["Leads atendidos", String(p.leads)],
            ["Passados a vendedor", String(p.transferidas)],
            ["Custo da IA", `${usd(p.custoMicrosUsd)} · ${brl((p.custoMicrosUsd / 1e6) * taxa)}`],
            ["Custo médio por lead", p.custoMedioMicrosUsd === null ? "—" : `${usd(p.custoMedioMicrosUsd)} · ${brl((p.custoMedioMicrosUsd / 1e6) * taxa)}`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs text-neutral-500">{k}</p>
              <p className="text-sm font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
        {p.porMotivo.length > 0 && <p className="text-xs text-neutral-500">Motivos das transferências: {p.porMotivo.map((m) => `${m.motivo} (${m.total})`).join(", ")}.</p>}
        {p.ultimas.length > 0 && (
          <ul className="divide-y divide-neutral-100 text-sm">
            {p.ultimas.map((u) => (
              <li key={u.conversationId} className="flex flex-col gap-0.5 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/inbox?open=${u.conversationId}`} className="font-medium hover:text-accent">
                    {u.contato}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    {u.status === "ATIVA" ? "IA atendendo" : `passado a vendedor${u.motivo ? ` · ${u.motivo}` : ""}`} · {u.turnos} resposta(s) · {usd(u.custoMicrosUsd)}
                  </span>
                </div>
                {u.resumo && <p className="whitespace-pre-line text-xs text-neutral-600">{u.resumo}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={salvar} className="flex flex-col gap-4">
        <section className={secao}>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} />
            Vendedor IA ligado
          </label>
          <p className="text-xs text-neutral-500">
            Responde as mensagens de clientes no número geral, busca no estoque, manda fotos e fichas e passa para um vendedor quando o cliente quer negociar, financiar, dar
            carro na troca ou visitar a loja. Assim que alguém da equipe responde na conversa, a IA sai dela. Ligado, a saudação, o menu de triagem e o aviso de ausência do
            número geral ficam desligados (voltam ao desligar a IA).
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Nome do assistente</span>
              <input id="ia-nome" value={f.nomeAssistente} onChange={(e) => setF({ ...f, nomeAssistente: e.target.value })} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Passar para o setor</span>
              <select id="ia-setor" value={f.setorTransferenciaId ?? ""} onChange={(e) => setF({ ...f, setorTransferenciaId: e.target.value || null })} className={campo}>
                <option value="">Fila geral (Pendentes)</option>
                {data.setores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>O que a IA precisa saber da loja</span>
            <textarea id="ia-instrucoes" rows={6} value={f.instrucoes ?? ""} onChange={(e) => setF({ ...f, instrucoes: e.target.value })} placeholder={EXEMPLO} className={campo} />
            <span className="text-xs text-neutral-500">Endereço, horário, formas de pagamento, garantia, o que não prometer. Os carros ela consulta sozinha no estoque.</span>
          </label>
        </section>

        <section className={secao}>
          <h2 className="text-sm font-semibold">Modelo e custo</h2>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            Câmbio para a conversão:
            <input aria-label="Câmbio" value={cambio} onChange={(e) => setCambio(e.target.value)} className="w-20 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-sm" />
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-neutral-500">
                <th className="py-1 font-normal" />
                <th className="py-1 font-normal">Modelo</th>
                <th className="py-1 text-right font-normal">Estimado por lead</th>
                <th className="py-1 text-right font-normal">300 leads/mês</th>
                <th className="py-1 text-right font-normal">1.000 leads/mês</th>
              </tr>
            </thead>
            <tbody>
              {data.estimativas.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="py-1.5">
                    <input type="radio" name="modelo" aria-label={m.nome} checked={f.modelo === m.id} onChange={() => setF({ ...f, modelo: m.id })} />
                  </td>
                  <td className="py-1.5">
                    {m.nome}
                    {m.aproximado ? " *" : ""}
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{brl(m.usdPorLead * taxa)}</td>
                  <td className="py-1.5 text-right tabular-nums">{brl(m.usdPorLead * taxa * 300)}</td>
                  <td className="py-1.5 text-right tabular-nums">{brl(m.usdPorLead * taxa * 1000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-neutral-500">
            Estimativa para um lead típico (6 respostas da IA, consulta ao estoque em 60% delas). O custo real de cada conversa aparece no painel acima e é o que vale.
            {data.estimativas.some((m) => m.aproximado) ? " * preço de cache aproximado." : ""}
          </p>
          <label className="flex max-w-md flex-col gap-1">
            <span className={rotulo}>Esforço de raciocínio</span>
            <select id="ia-esforco" value={f.esforco} onChange={(e) => setF({ ...f, esforco: e.target.value as Dados["config"]["esforco"] })} className={campo}>
              {(Object.keys(ROTULO_ESFORCO) as (keyof typeof ROTULO_ESFORCO)[]).map((k) => (
                <option key={k} value={k}>
                  {ROTULO_ESFORCO[k]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Limite de leads novos por mês{data.config.leadsContratados !== null ? ` (contratado: até ${data.config.leadsContratados})` : ""}</span>
              <input id="ia-limite-leads" inputMode="numeric" value={f.limiteLeadsMes} onChange={(e) => setF({ ...f, limiteLeadsMes: Number(e.target.value.replace(/\D/g, "")) || 1 })} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Limite de custo por mês (US$, vazio = sem limite)</span>
              <input
                id="ia-limite-custo"
                inputMode="decimal"
                value={f.limiteCustoMesCents === null ? "" : String(f.limiteCustoMesCents / 100)}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(",", "."));
                  setF({ ...f, limiteCustoMesCents: e.target.value.trim() && Number.isFinite(n) ? Math.max(100, Math.round(n * 100)) : null });
                }}
                className={campo}
              />
            </label>
          </div>
          <p className="text-xs text-neutral-500">Passou de um limite, a IA para de assumir conversas novas no mês; as que já está atendendo seguem até passar para um vendedor.</p>
        </section>

        {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
        <div>
          <button disabled={salvando} className={botaoPrimario}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
