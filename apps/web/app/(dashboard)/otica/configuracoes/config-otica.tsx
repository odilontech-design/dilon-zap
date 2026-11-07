"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ROTULO_ETAPA, montarAviso, numeroOS, type Etapa } from "@/lib/otica-regras";
import { erroDaResposta, fetcher } from "../formatos";

type Lab = { id: string; nome: string; telefone: string | null; contato: string | null; prazoDias: number | null; ativo: boolean };
type AvisoCfg = { ativo: boolean; texto: string; padrao: string };
type Config = { proximoNumeroOS: number; validadeReceitaMeses: number; avisos: Record<string, AvisoCfg> };

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const EXEMPLO = { nome: "Marilene", os: numeroOS(499), previsao: "18/11 a partir das 16h", saldoCents: 72500, loja: "Ótica Visuallis" };

/** Laboratórios, mensagens ao cliente e numeração das OS. Só a gestão chega aqui. */
export function ConfigOtica() {
  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <Laboratorios />
      <Avisos />
    </div>
  );
}

function Laboratorios() {
  const { data, mutate } = useSWR<Lab[]>("/api/otica/laboratorios", fetcher);
  const [novo, setNovo] = useState({ nome: "", telefone: "", contato: "", prazoDias: "" });
  const [erro, setErro] = useState<string | null>(null);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const r = await fetch("/api/otica/laboratorios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: novo.nome, telefone: novo.telefone, contato: novo.contato, prazoDias: novo.prazoDias ? Number(novo.prazoDias) : null }),
    });
    if (!r.ok) return setErro(await erroDaResposta(r));
    setNovo({ nome: "", telefone: "", contato: "", prazoDias: "" });
    mutate();
  }

  async function alternar(l: Lab) {
    await fetch(`/api/otica/laboratorios/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativo: !l.ativo }) });
    mutate();
  }

  async function mudarPrazo(l: Lab, prazo: string) {
    const n = prazo ? Number(prazo) : null;
    if (n !== null && (!Number.isInteger(n) || n < 0)) return;
    await fetch(`/api/otica/laboratorios/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prazoDias: n }) });
    mutate();
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">Laboratórios</h2>
        <p className="text-xs text-neutral-500">O prazo sugere a previsão de entrega quando a OS é aberta.</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-neutral-500">
            <th className="py-1 font-medium">Nome</th>
            <th className="py-1 font-medium">Telefone</th>
            <th className="py-1 font-medium">Prazo (dias)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((l) => (
            <tr key={l.id} className={`border-t border-neutral-100 ${l.ativo ? "" : "text-neutral-400"}`}>
              <td className="py-2">{l.nome}{l.contato ? <span className="text-xs text-neutral-500"> · {l.contato}</span> : null}</td>
              <td className="py-2">{l.telefone}</td>
              <td className="py-2">
                <input
                  id={`lab-prazo-${l.id}`}
                  aria-label={`Prazo de ${l.nome}`}
                  defaultValue={l.prazoDias ?? ""}
                  onBlur={(e) => e.target.value !== String(l.prazoDias ?? "") && mudarPrazo(l, e.target.value)}
                  inputMode="numeric"
                  className="w-16 rounded border border-neutral-300 bg-surface px-2 py-1 text-sm"
                />
              </td>
              <td className="py-2 text-right">
                <button onClick={() => alternar(l)} className="text-xs text-neutral-500 hover:text-accent">{l.ativo ? "Arquivar" : "Reativar"}</button>
              </td>
            </tr>
          ))}
          {data?.length === 0 && (
            <tr><td colSpan={4} className="py-3 text-xs text-neutral-500">Nenhum laboratório ainda. Cadastre o primeiro abaixo.</td></tr>
          )}
        </tbody>
      </table>
      <form onSubmit={criar} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
        <input id="lab-nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} placeholder="Nome (ex.: Forla)" className={`${campo} col-span-2`} required />
        <input id="lab-tel" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} placeholder="Telefone" className={campo} />
        <input id="lab-prazo" value={novo.prazoDias} onChange={(e) => setNovo({ ...novo, prazoDias: e.target.value })} placeholder="Prazo (dias)" inputMode="numeric" className={campo} />
        <button className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90">Adicionar</button>
      </form>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </section>
  );
}

function Avisos() {
  const { data, mutate } = useSWR<Config>("/api/otica/config", fetcher);
  const [avisos, setAvisos] = useState<Record<string, AvisoCfg>>({});
  const [proximo, setProximo] = useState("");
  const [validade, setValidade] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ texto: string; erro?: boolean } | null>(null);

  useEffect(() => {
    if (!data) return;
    setAvisos(data.avisos);
    setProximo(String(data.proximoNumeroOS));
    setValidade(String(data.validadeReceitaMeses));
  }, [data]);

  async function salvar() {
    setSalvando(true);
    setMsg(null);
    const r = await fetch("/api/otica/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proximoNumeroOS: Number(proximo) !== data?.proximoNumeroOS ? Number(proximo) : undefined,
        validadeReceitaMeses: Number(validade),
        avisos: Object.fromEntries(Object.entries(avisos).map(([k, a]) => [k, { ativo: a.ativo, texto: a.texto }])),
      }),
    });
    setSalvando(false);
    if (!r.ok) return setMsg({ texto: await erroDaResposta(r), erro: true });
    setMsg({ texto: "Configurações salvas." });
    mutate();
  }

  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-4">
      <div>
        <h2 className="text-sm font-semibold">Mensagens ao cliente</h2>
        <p className="text-xs text-neutral-500">
          Saem pelo WhatsApp da loja quando a OS muda de etapa. Variáveis: {"{nome}"}, {"{os}"}, {"{previsao}"}, {"{saldo_linha}"} (só aparece se houver saldo), {"{loja}"}.
        </p>
      </div>
      {Object.entries(avisos).map(([etapa, a]) => (
        <div key={etapa} className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={a.ativo} onChange={(e) => setAvisos({ ...avisos, [etapa]: { ...a, ativo: e.target.checked } })} className="accent-[rgb(var(--accent))]" />
              {ROTULO_ETAPA[etapa as Etapa]}
            </label>
            {a.texto !== a.padrao && (
              <button type="button" onClick={() => setAvisos({ ...avisos, [etapa]: { ...a, texto: a.padrao } })} className="text-xs text-neutral-500 hover:text-accent">Voltar ao texto padrão</button>
            )}
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <textarea id={`aviso-${etapa}`} aria-label={`Mensagem de ${ROTULO_ETAPA[etapa as Etapa]}`} value={a.texto} onChange={(e) => setAvisos({ ...avisos, [etapa]: { ...a, texto: e.target.value } })} rows={4} className={campo} disabled={!a.ativo} />
            <div className={`rounded-lg bg-accent/10 px-3 py-2 text-sm whitespace-pre-wrap ${a.ativo ? "" : "opacity-40"}`}>
              <span className="block text-[10px] uppercase tracking-wide text-neutral-500 mb-1">Prévia</span>
              {montarAviso(a.texto, EXEMPLO)}
            </div>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-3 border-t border-neutral-100 pt-3 max-w-md">
        <label className="text-xs font-medium text-neutral-700">
          Próximo número de OS
          <input id="cfg-proximo" value={proximo} onChange={(e) => setProximo(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
          <span className="text-[11px] text-neutral-500 font-normal">Continue a numeração do talão de papel.</span>
        </label>
        <label className="text-xs font-medium text-neutral-700">
          Validade da receita (meses)
          <input id="cfg-validade" value={validade} onChange={(e) => setValidade(e.target.value)} inputMode="numeric" className={`${campo} mt-1`} />
        </label>
      </div>
      {msg && <p role="status" className={`text-sm ${msg.erro ? "text-red-600" : "text-accent"}`}>{msg.texto}</p>}
      <button onClick={salvar} disabled={salvando} className="self-start rounded-md bg-accent px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {salvando ? "Salvando…" : "Salvar configurações"}
      </button>
    </section>
  );
}
