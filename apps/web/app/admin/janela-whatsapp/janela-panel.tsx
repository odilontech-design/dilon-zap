"use client";

import { useState } from "react";
import useSWR from "swr";
import { DIAS_PERMITIDOS, PRECOS_PADRAO, estimarCusto, fora, percentualFora, sugerirTetos, type LinhaDaJanela } from "@/lib/janela-whatsapp-regras";

/**
 * Janela de 24 horas do WhatsApp por cliente: o que hoje sai pela conexão não oficial e quanto disso seria grátis ou
 * pago na API oficial da Meta, mais o teto de envio por hora sugerido para cada número. Só leitura. Paleta escura do admin.
 */

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const n = (v: number) => v.toLocaleString("pt-BR");
const usd = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Kpi({ rotulo, valor, sub, tom }: { rotulo: string; valor: string; sub?: string; tom?: "alerta" }) {
  return (
    <div className={`rounded-lg border p-4 ${tom === "alerta" ? "border-amber-800 bg-amber-950/30" : "border-neutral-800 bg-neutral-900"}`}>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{rotulo}</div>
      <div className="mt-1 text-2xl font-semibold text-neutral-100">{valor}</div>
      {sub && <div className="mt-0.5 text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

/** Barra com as três fatias: dentro da janela (grátis), reabertura e sem resposta prévia (exigem modelo). */
function Barra({ l }: { l: LinhaDaJanela }) {
  if (l.enviadas === 0) return null;
  const p = (v: number) => `${(100 * v) / l.enviadas}%`;
  return (
    <div className="flex h-2 w-40 overflow-hidden rounded bg-neutral-800" title={`dentro ${n(l.dentro)} · reabertura ${n(l.reabertura)} · sem resposta prévia ${n(l.semPrevia)}`}>
      <div className="bg-emerald-600" style={{ width: p(l.dentro) }} />
      <div className="bg-amber-500" style={{ width: p(l.reabertura) }} />
      <div className="bg-red-500" style={{ width: p(l.semPrevia) }} />
    </div>
  );
}

export function JanelaWhatsappPanel() {
  const [dias, setDias] = useState<number>(30);
  const [preco, setPreco] = useState({ ...PRECOS_PADRAO });
  const { data, isLoading, error } = useSWR<{ linhas: LinhaDaJanela[] }>(`/api/admin/janela-whatsapp?dias=${dias}`, fetcher, { revalidateOnFocus: false });
  const linhas = data?.linhas ?? [];

  const totalEnviadas = linhas.reduce((s, l) => s + l.enviadas, 0);
  const totalDentro = linhas.reduce((s, l) => s + l.dentro, 0);
  const totalFora = linhas.reduce((s, l) => s + fora(l), 0);
  const custo = estimarCusto(totalFora, preco);
  const campo = "w-24 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100";

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-100">Janela do WhatsApp</h1>
          <p className="max-w-3xl text-xs text-neutral-500">
            Cada mensagem enviada é classificada pelo que havia antes na conversa. Na API oficial da Meta, responder em até 24 horas ao cliente é
            grátis; iniciar a conversa, ou voltar depois de 24 horas sem resposta, exige modelo aprovado e é cobrado por mensagem. É uma estimativa
            do que hoje sai pela conexão não oficial.
          </p>
        </div>
        <label className="text-xs text-neutral-400">
          Período
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="ml-2 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-neutral-100">
            {DIAS_PERMITIDOS.map((d) => <option key={d} value={d}>últimos {d} dias</option>)}
          </select>
        </label>
      </div>

      {error && <p className="rounded-md bg-red-950/50 p-3 text-xs text-red-300">Não foi possível calcular agora.</p>}
      {isLoading || !data ? (
        <div className="text-sm text-neutral-400">Calculando… (leva alguns segundos)</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi rotulo="Mensagens enviadas" valor={n(totalEnviadas)} sub={`${linhas.length} cliente(s) com envio`} />
            <Kpi rotulo="Dentro da janela" valor={n(totalDentro)} sub={totalEnviadas ? `${Math.round((1000 * totalDentro) / totalEnviadas) / 10}% · grátis na API oficial` : undefined} />
            <Kpi rotulo="Exigiriam modelo" valor={n(totalFora)} sub={totalEnviadas ? `${Math.round((1000 * totalFora) / totalEnviadas) / 10}% do total` : undefined} tom={totalFora ? "alerta" : undefined} />
            <Kpi rotulo="Custo estimado (Meta)" valor={`${usd(custo.pisoUsd)} a ${usd(custo.tetoUsd)}`} sub={`${brl(custo.pisoBrl)} a ${brl(custo.tetoBrl)} · se tudo fosse utilidade ou tudo marketing`} />
          </div>

          <section className="flex flex-wrap items-end gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-xs text-neutral-400">
            <span className="w-full text-neutral-300">Preços de referência (ajuste conforme a tabela atual da Meta para o Brasil; não ficam salvos)</span>
            <label>Utilidade (US$/msg)<br /><input type="number" step="0.0001" min="0" value={preco.utilidadeUsd} onChange={(e) => setPreco({ ...preco, utilidadeUsd: Number(e.target.value) })} className={campo} /></label>
            <label>Marketing (US$/msg)<br /><input type="number" step="0.0001" min="0" value={preco.marketingUsd} onChange={(e) => setPreco({ ...preco, marketingUsd: Number(e.target.value) })} className={campo} /></label>
            <label>Cotação (R$/US$)<br /><input type="number" step="0.01" min="0" value={preco.cotacao} onChange={(e) => setPreco({ ...preco, cotacao: Number(e.target.value) })} className={campo} /></label>
          </section>

          <section className="overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="border-b border-neutral-800 text-neutral-500">
                <tr>
                  <th className="p-3">Cliente</th><th className="p-3">Números</th><th className="p-3">Enviadas</th><th className="p-3">Distribuição</th>
                  <th className="p-3">Fora da janela</th><th className="p-3">Custo estimado</th><th className="p-3">Pico por hora</th><th className="p-3">Teto sugerido por número</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const f = fora(l);
                  const c = estimarCusto(f, preco);
                  const t = sugerirTetos(l);
                  return (
                    <tr key={l.tenantId} className="border-t border-neutral-800 align-top">
                      <td className="p-3"><div className="font-medium text-neutral-100">{l.nome}</div><div className="text-neutral-500">código {l.slug}</div></td>
                      <td className="p-3">{l.conectados} de {l.numeros}<div className="text-neutral-500">conectado(s)</div></td>
                      <td className="p-3">{n(l.enviadas)}<div className="text-neutral-500">{n(Math.round(l.enviadas / dias))}/dia</div></td>
                      <td className="p-3"><Barra l={l} /><div className="mt-1 text-neutral-500">{n(l.dentro)} dentro · {n(l.reabertura)} reabertura · {n(l.semPrevia)} sem resposta prévia</div></td>
                      <td className="p-3"><span className={percentualFora(l) >= 30 ? "text-amber-300" : ""}>{percentualFora(l).toLocaleString("pt-BR")}%</span><div className="text-neutral-500">{n(f)} mensagens</div></td>
                      <td className="p-3">{usd(c.pisoUsd)} a {usd(c.tetoUsd)}<div className="text-neutral-500">{brl(c.pisoBrl)} a {brl(c.tetoBrl)}</div></td>
                      <td className="p-3">{n(l.picoPorHora)}<div className="text-neutral-500">p95 {n(l.p95PorHora)} · fora da janela: pico {n(l.picoForaPorHora)}</div></td>
                      <td className="p-3"><strong className="text-neutral-100">{t.totalPorHora}/h</strong> no total<div className="text-neutral-500">{t.foraPorHora}/h iniciando conversa</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <p className="text-[11px] text-neutral-500">
            Verde: dentro das 24 horas (grátis). Amarelo: o cliente já escreveu antes, mas há mais de 24 horas. Vermelho: a loja abriu a conversa. O teto
            sugerido fica 30% acima do p95 das horas movimentadas (mínimo 40) e, para conversas iniciadas pela loja, 50% acima do p95 (entre 10 e 40).
            É uma sugestão para análise: nada é limitado por esta tela.
          </p>
        </>
      )}
    </div>
  );
}
