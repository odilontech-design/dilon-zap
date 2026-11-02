"use client";

import { useState } from "react";
import useSWR from "swr";
import { chamar, fetcher } from "../receber/formatos";
import { botaoPrimario, campo, dataHora, rotulo } from "./formatos-sdr";

type Preco = { entradaMicroPorMilTokens: number; saidaMicroPorMilTokens: number };
type Config = {
  ativa: boolean;
  orcamentoDiarioMicro: number | null;
  orcamentoMensalMicro: number | null;
  limiteTokensEntrada: number;
  limiteTokensSaida: number;
  cacheHoras: number;
  modelos: Record<string, { principal: string; reserva?: string }>;
  precos: Record<string, Preco>;
};
type Uso = {
  gastoHojeMicro: number;
  gastoMesMicro: number;
  porStatus: Record<string, number>;
  recentes: { id: string; createdAt: string; tarefa: string; provedor: string; modelo: string; status: string; custoMicro: number; erro: string | null }[];
};

const TAREFA = "abordagem_comercial";
const dolar = (micro: number | null) => (micro === null ? "—" : `US$ ${(micro / 1_000_000).toFixed(micro < 10_000 ? 4 : 2)}`);
/** US$ por milhão de tokens (como os provedores publicam) ⇄ micro-dólar por mil tokens (como o sistema guarda). */
const paraMicroPorMil = (usdPorMilhao: string) => Math.round(Number(usdPorMilhao.replace(",", ".")) * 1000);
const paraUsdPorMilhao = (micro: number | undefined) => (micro === undefined ? "" : String(micro / 1000));
const separar = (ref: string | undefined) => {
  const [prov, ...resto] = (ref ?? "").split(":");
  return { prov: prov || "anthropic", modelo: resto.join(":") };
};

const input = "w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm";

/** Liga a IA e define o limite de gasto. Sem isto, a ferramenta segue funcionando: abordagem manual e modelos neutros. */
export function IaPanel({ podeEscrever }: { podeEscrever: boolean }) {
  const { data, error, mutate } = useSWR<{ configuracao: Config; uso: Uso }>("/api/sdr/ia", fetcher);
  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-neutral-400">Carregando...</p>;
  return <Formulario key={JSON.stringify(data.configuracao)} c={data.configuracao} uso={data.uso} podeEscrever={podeEscrever} aoSalvar={() => mutate()} />;
}

function Formulario({ c, uso, podeEscrever, aoSalvar }: { c: Config; uso: Uso; podeEscrever: boolean; aoSalvar: () => void }) {
  const principal = separar(c.modelos[TAREFA]?.principal);
  const reserva = separar(c.modelos[TAREFA]?.reserva);
  const [ativa, setAtiva] = useState(c.ativa);
  const [diario, setDiario] = useState(c.orcamentoDiarioMicro === null ? "" : String(c.orcamentoDiarioMicro / 1_000_000));
  const [mensal, setMensal] = useState(c.orcamentoMensalMicro === null ? "" : String(c.orcamentoMensalMicro / 1_000_000));
  const [provP, setProvP] = useState(principal.prov);
  const [modP, setModP] = useState(principal.modelo);
  const [entP, setEntP] = useState(paraUsdPorMilhao(c.precos[c.modelos[TAREFA]?.principal ?? ""]?.entradaMicroPorMilTokens));
  const [saiP, setSaiP] = useState(paraUsdPorMilhao(c.precos[c.modelos[TAREFA]?.principal ?? ""]?.saidaMicroPorMilTokens));
  const [provR, setProvR] = useState(reserva.prov === "anthropic" && !reserva.modelo ? "gemini" : reserva.prov);
  const [modR, setModR] = useState(reserva.modelo);
  const [entR, setEntR] = useState(paraUsdPorMilhao(c.precos[c.modelos[TAREFA]?.reserva ?? ""]?.entradaMicroPorMilTokens));
  const [saiR, setSaiR] = useState(paraUsdPorMilhao(c.precos[c.modelos[TAREFA]?.reserva ?? ""]?.saidaMicroPorMilTokens));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const micro = (v: string) => (v.trim() === "" ? null : Math.round(Number(v.replace(",", ".")) * 1_000_000));
    const refP = modP.trim() ? `${provP}:${modP.trim()}` : null;
    const refR = modR.trim() ? `${provR}:${modR.trim()}` : null;
    const modelos = { ...c.modelos };
    const precos = { ...c.precos };
    if (refP) {
      modelos[TAREFA] = { principal: refP, ...(refR && refR !== refP ? { reserva: refR } : {}) };
      precos[refP] = { entradaMicroPorMilTokens: paraMicroPorMil(entP || "0"), saidaMicroPorMilTokens: paraMicroPorMil(saiP || "0") };
      if (refR && refR !== refP) precos[refR] = { entradaMicroPorMilTokens: paraMicroPorMil(entR || "0"), saidaMicroPorMilTokens: paraMicroPorMil(saiR || "0") };
    } else delete modelos[TAREFA];
    const r = await chamar("/api/sdr/ia", "PUT", { ...c, ativa, orcamentoDiarioMicro: micro(diario), orcamentoMensalMicro: micro(mensal), modelos, precos });
    setMsg(r.ok ? { ok: true, texto: "Configuração salva." } : { ok: false, texto: r.erro ?? "confira os valores" });
    if (r.ok) aoSalvar();
  }

  const provedores = (id: string, valor: string, set: (v: string) => void) => (
    <select id={id} disabled={!podeEscrever} value={valor} onChange={(e) => set(e.target.value)} className={input}>
      <option value="anthropic">Claude (Anthropic)</option>
      <option value="gemini">Gemini (Google)</option>
    </select>
  );

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
        <p>A IA é opcional: só escreve rascunhos de abordagem. Nada é enviado, e tudo passa pela sua aprovação. Desligada ou sem orçamento, você continua usando modelos neutros e escrevendo à mão.</p>
        <p className="mt-1">A chave do provedor (<code>ANTHROPIC_API_KEY</code> ou <code>GEMINI_API_KEY</code>) fica no servidor e nunca é digitada aqui. Os preços são os da tabela do provedor, em US$ por 1 milhão de tokens: sem eles o modelo não roda.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-neutral-200 p-3">
          <p className="text-[11px] text-neutral-500">Gasto hoje</p>
          <p className="text-lg font-semibold tabular-nums">{dolar(uso.gastoHojeMicro)}</p>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <p className="text-[11px] text-neutral-500">Gasto no mês</p>
          <p className="text-lg font-semibold tabular-nums">{dolar(uso.gastoMesMicro)}</p>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <p className="text-[11px] text-neutral-500">Chamadas ok / recusadas</p>
          <p className="text-lg font-semibold tabular-nums">
            {uso.porStatus.OK ?? 0} / {(uso.porStatus.BLOQUEADO ?? 0) + (uso.porStatus.ERRO ?? 0) + (uso.porStatus.RESPOSTA_INVALIDA ?? 0)}
          </p>
        </div>
        <div className="rounded-md border border-neutral-200 p-3">
          <p className="text-[11px] text-neutral-500">Respostas do cache</p>
          <p className="text-lg font-semibold tabular-nums">{uso.porStatus.CACHE ?? 0}</p>
        </div>
      </div>

      <form onSubmit={salvar} className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input id="ia-ativa" type="checkbox" disabled={!podeEscrever} checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          Usar IA para gerar abordagens
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={rotulo}>Orçamento diário (US$)</span>
            <input id="ia-diario" disabled={!podeEscrever} inputMode="decimal" value={diario} onChange={(e) => setDiario(e.target.value)} placeholder="Ex.: 2" className={input} />
          </label>
          <label>
            <span className={rotulo}>Orçamento mensal (US$)</span>
            <input id="ia-mensal" disabled={!podeEscrever} inputMode="decimal" value={mensal} onChange={(e) => setMensal(e.target.value)} placeholder="Ex.: 30" className={input} />
          </label>
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className={rotulo}>Modelo principal</legend>
          <label>
            <span className="text-[11px] text-neutral-500">Provedor</span>
            {provedores("ia-prov-principal", provP, setProvP)}
          </label>
          <label>
            <span className="text-[11px] text-neutral-500">Nome do modelo</span>
            <input id="ia-modelo-principal" disabled={!podeEscrever} value={modP} onChange={(e) => setModP(e.target.value)} className={input} />
          </label>
          <label>
            <span className="text-[11px] text-neutral-500">Preço entrada (US$/1M)</span>
            <input id="ia-ent-principal" disabled={!podeEscrever} inputMode="decimal" value={entP} onChange={(e) => setEntP(e.target.value)} className={input} />
          </label>
          <label>
            <span className="text-[11px] text-neutral-500">Preço saída (US$/1M)</span>
            <input id="ia-sai-principal" disabled={!podeEscrever} inputMode="decimal" value={saiP} onChange={(e) => setSaiP(e.target.value)} className={input} />
          </label>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-4">
          <legend className={rotulo}>Modelo de reserva (opcional: entra se o principal falhar)</legend>
          <label>
            <span className="text-[11px] text-neutral-500">Provedor</span>
            {provedores("ia-prov-reserva", provR, setProvR)}
          </label>
          <label>
            <span className="text-[11px] text-neutral-500">Nome do modelo</span>
            <input id="ia-modelo-reserva" disabled={!podeEscrever} value={modR} onChange={(e) => setModR(e.target.value)} className={input} />
          </label>
          <label>
            <span className="text-[11px] text-neutral-500">Preço entrada (US$/1M)</span>
            <input id="ia-ent-reserva" disabled={!podeEscrever} inputMode="decimal" value={entR} onChange={(e) => setEntR(e.target.value)} className={input} />
          </label>
          <label>
            <span className="text-[11px] text-neutral-500">Preço saída (US$/1M)</span>
            <input id="ia-sai-reserva" disabled={!podeEscrever} inputMode="decimal" value={saiR} onChange={(e) => setSaiR(e.target.value)} className={input} />
          </label>
        </fieldset>

        {msg && <p className={`text-sm ${msg.ok ? "text-accent" : "text-red-600"}`}>{msg.texto}</p>}
        {podeEscrever && (
          <button id="ia-salvar" type="submit" className={`${botaoPrimario} self-start`}>
            Salvar
          </button>
        )}
      </form>

      <section>
        <h3 className="mb-2 text-sm font-semibold">Últimas chamadas</h3>
        {uso.recentes.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma chamada de IA ainda.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
            <table className="w-full text-xs">
              <tbody>
                {uso.recentes.map((r) => (
                  <tr key={r.id} className="border-t border-neutral-100 first:border-t-0">
                    <td className="px-3 py-1.5 text-neutral-500">{dataHora(r.createdAt)}</td>
                    <td className="px-3 py-1.5">{r.tarefa}</td>
                    <td className="px-3 py-1.5 text-neutral-500">
                      {r.provedor}:{r.modelo}
                    </td>
                    <td className="px-3 py-1.5">{r.status}</td>
                    <td className="px-3 py-1.5 tabular-nums">{dolar(r.custoMicro)}</td>
                    <td className="px-3 py-1.5 text-neutral-500">{r.erro ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
