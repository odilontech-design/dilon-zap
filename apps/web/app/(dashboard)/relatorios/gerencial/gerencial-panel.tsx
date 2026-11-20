"use client";

import { useState, type ReactNode } from "react";
import useSWR from "swr";
import type { Gerencial } from "@/lib/relatorio-gerencial";

/**
 * Painel gerencial (Believe, 20/11): o mês da empresa num lugar só — vendas e
 * meta, financeiro, funil e estoque/site. Só a gestão chega aqui.
 *
 * Cada quadro vem com o número e o texto que o explica; cor nenhuma carrega
 * sozinha o sentido (atraso, meta fora do ritmo). Quadro que falhou ao
 * carregar avisa, em vez de sumir.
 */

const fetcher = async (url: string): Promise<Gerencial> => {
  const res = await fetch(url);
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("sua sessão expirou — entre de novo");
  const corpo = await res.json();
  if (!res.ok) throw new Error(typeof corpo.error === "string" ? corpo.error : "não foi possível carregar");
  return corpo;
};

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function rotuloDoMes(mes: string) {
  const [ano, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} de ${ano}`;
}

function lerReais(texto: string): number | null | undefined {
  const t = texto.replace(/[R$\s]/g, "");
  if (!t) return null;
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
}

function Cartao({ rotulo, valor, nota, destaque = false }: { rotulo: string; valor: string; nota?: ReactNode; destaque?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4">
      <p className="text-xs text-neutral-500 mb-1">{rotulo}</p>
      <p className={`text-2xl font-semibold tabular-nums ${destaque ? "text-red-700" : ""}`}>{valor}</p>
      {nota && <p className="mt-0.5 text-xs text-neutral-500">{nota}</p>}
    </div>
  );
}

function Quadro({ titulo, children, falhou }: { titulo: string; children: ReactNode; falhou: boolean }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-neutral-800">{titulo}</h2>
      {falhou ? (
        <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Não foi possível carregar este quadro agora. Os outros continuam valendo; tente atualizar a página em instantes.
        </p>
      ) : (
        children
      )}
    </section>
  );
}

function Tabela({ colunas, linhas, vazio }: { colunas: string[]; linhas: ReactNode[][]; vazio: string }) {
  if (linhas.length === 0) return <p className="text-sm text-neutral-500">{vazio}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
            {colunas.map((c, i) => (
              <th key={c} className={`px-4 py-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-neutral-100 last:border-0">
              {l.map((cel, j) => (
                <td key={j} className={`px-4 py-2 ${j > 0 ? "text-right tabular-nums" : ""}`}>
                  {cel}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MetaDeVendas({ d, onSalvou }: { d: Gerencial; onSalvou: () => void }) {
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const meta = d.vendas?.meta ?? null;

  async function salvar() {
    if (texto === null) return;
    const valor = lerReais(texto);
    if (valor === undefined) return setErro("valor inválido — use números, como 50000 ou 50.000,00");
    setErro(null);
    setSalvando(true);
    const res = await fetch("/api/relatorios/gerencial", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metaVendasMesCents: valor }),
    });
    setSalvando(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return setErro(typeof b.error === "string" ? b.error : "não foi possível salvar a meta");
    }
    setTexto(null);
    onSalvou();
  }

  const cor = !meta ? "" : meta.percentual >= 100 ? "bg-emerald-500" : meta.noRitmo ? "bg-emerald-500" : "bg-amber-500";

  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs text-neutral-500">Meta de vendas do mês</p>
        {meta && (
          <span
            className={`text-xs font-medium rounded-full px-2 py-0.5 ${
              meta.percentual >= 100
                ? "bg-emerald-100 text-emerald-800"
                : meta.noRitmo
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-900"
            }`}
          >
            {meta.percentual >= 100 ? "Meta batida" : meta.noRitmo ? "No ritmo" : "Abaixo do ritmo"}
          </span>
        )}
      </div>
      {meta ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, meta.percentual)}
            aria-label="Meta de vendas realizada"
            className="h-2.5 rounded-full bg-neutral-200 overflow-hidden"
          >
            <div className={`h-full ${cor}`} style={{ width: `${Math.min(100, meta.percentual)}%` }} />
          </div>
          <p className="text-sm">
            <span className="font-semibold tabular-nums">{meta.percentual}%</span> de {brl(meta.metaCents)}
            {meta.faltaCents > 0 ? ` · faltam ${brl(meta.faltaCents)}` : ""}
            <span className="block text-xs text-neutral-500 mt-0.5">
              No ritmo de hoje (dia {d.diaDoMes} de {d.diasNoMes}), o mês fecha em {brl(meta.projecaoCents)}.
            </span>
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-500">Sem meta definida. Defina abaixo para acompanhar o ritmo do mês.</p>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs flex-1 min-w-[160px]">
          <span className="block font-medium text-neutral-700">{meta ? "Alterar meta (R$)" : "Definir meta (R$)"}</span>
          <input
            value={texto ?? (d.metaCents ? (d.metaCents / 100).toFixed(2).replace(".", ",") : "")}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") salvar();
            }}
            inputMode="decimal"
            placeholder="Em branco = sem meta"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm tabular-nums"
          />
        </label>
        <button
          onClick={salvar}
          disabled={salvando || texto === null}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-40"
        >
          {salvando ? "Salvando..." : "Salvar meta"}
        </button>
      </div>
      {erro && (
        <p role="alert" className="text-xs text-red-700">
          {erro}
        </p>
      )}
    </div>
  );
}

export function GerencialPanel() {
  const { data: d, error, mutate } = useSWR<Gerencial>("/api/relatorios/gerencial", fetcher, {
    // São várias consultas somadas: atualizar a cada minuto basta para um painel de gestão.
    refreshInterval: 60_000,
  });

  if (error) return <p role="alert" className="text-sm text-red-700">{String(error.message ?? error)}</p>;
  if (!d) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const v = d.vendas;
  const f = d.financeiro;
  const n = d.funil;
  const e = d.estoque;

  return (
    <div className="flex flex-col gap-8 max-w-5xl">
      <p className="text-sm text-neutral-500 -mt-2">
        {rotuloDoMes(d.mes)} · dia {d.diaDoMes} de {d.diasNoMes}. Pedidos contam na data em que foram fechados.
      </p>

      <Quadro titulo="Vendas e meta do mês" falhou={!v}>
        {v && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cartao
                rotulo="Faturamento do mês"
                valor={brl(v.totalCents)}
                nota={
                  v.anterior.variacaoPercentual === null
                    ? "sem mês anterior para comparar"
                    : `${v.anterior.variacaoPercentual >= 0 ? "+" : ""}${v.anterior.variacaoPercentual}% sobre o mês passado (${brl(v.anterior.totalCents)})`
                }
              />
              <Cartao rotulo="Pedidos fechados" valor={String(v.pedidos)} nota={`mês passado: ${v.anterior.pedidos}`} />
              <Cartao rotulo="Ticket médio" valor={brl(v.ticketMedioCents)} />
              <Cartao rotulo="Vendas do site" valor={brl(v.doSite.totalCents)} nota={`${v.doSite.pedidos} pedido(s) do site`} />
            </div>
            <MetaDeVendas d={d} onSalvou={() => mutate()} />
            <div>
              <h3 className="mb-2 text-xs font-medium text-neutral-700">Por quem montou o pedido</h3>
              <Tabela
                colunas={["Responsável", "Pedidos", "Faturamento"]}
                linhas={v.porConsultora.map((c) => [c.nome, c.pedidos, brl(c.totalCents)])}
                vazio="Nenhum pedido fechado neste mês ainda."
              />
            </div>
          </div>
        )}
      </Quadro>

      <Quadro titulo="Financeiro" falhou={!f}>
        {f && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cartao
                rotulo="A receber em aberto"
                valor={brl(f.aReceber.total)}
                nota={
                  f.aReceber.vencido > 0
                    ? `${brl(f.aReceber.vencido)} em atraso`
                    : "nada em atraso"
                }
              />
              <Cartao
                rotulo="A pagar em aberto"
                valor={brl(f.aPagar.total)}
                nota={f.aPagar.vencido > 0 ? `${brl(f.aPagar.vencido)} em atraso` : "nada em atraso"}
              />
              <Cartao rotulo="Recebido no mês" valor={brl(f.recebidoNoMesCents)} nota="pagamentos lançados no mês" />
              <Cartao
                rotulo="Caixa aberto"
                valor={f.caixa ? brl(f.caixa.esperadoDinheiroCents) : "Fechado"}
                nota={
                  f.caixa
                    ? `dinheiro esperado na gaveta · aberto desde ${new Date(f.caixa.abertoEm).toLocaleDateString("pt-BR")}`
                    : "nenhum caixa aberto agora"
                }
              />
            </div>
            <Tabela
              colunas={["Vencimento", "A receber", "A pagar"]}
              linhas={[
                ["Vencido", brl(f.aReceber.vencido), brl(f.aPagar.vencido)],
                ["Vence hoje", brl(f.aReceber.vence_hoje), brl(f.aPagar.vence_hoje)],
                ["A vencer", brl(f.aReceber.a_vencer), brl(f.aPagar.a_vencer)],
                ["Sem prazo", brl(f.aReceber.sem_prazo), brl(f.aPagar.sem_prazo)],
              ]}
              vazio=""
            />
            <div className="rounded-lg border border-neutral-200 bg-surface p-4 text-sm">
              <p className="text-xs text-neutral-500 mb-1">Linha de crédito dos clientes</p>
              {f.credito.contatos === 0 ? (
                <p className="text-neutral-500">Nenhum cliente com limite definido ainda. O limite se define na ficha do contato.</p>
              ) : (
                <p>
                  <span className="font-semibold tabular-nums">{brl(f.credito.usadoCents)}</span> usados de{" "}
                  <span className="font-semibold tabular-nums">{brl(f.credito.limiteCents)}</span> em {f.credito.contatos} cliente(s) com limite
                  {f.credito.acimaDoLimite > 0 ? (
                    <span className="ml-2 text-xs font-medium rounded-full bg-red-100 text-red-700 px-2 py-0.5">
                      {f.credito.acimaDoLimite} acima do limite
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-neutral-500">· nenhum acima do limite</span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}
      </Quadro>

      <Quadro titulo="Funil e negociações" falhou={!n}>
        {n && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Cartao rotulo="Negociações abertas" valor={String(n.abertas.quantidade)} nota={`${brl(n.abertas.valorCents)} no funil`} />
              <Cartao rotulo="Ganhas no mês" valor={String(n.ganhasNoMes.quantidade)} nota={brl(n.ganhasNoMes.valorCents)} />
              <Cartao rotulo="Perdidas no mês" valor={String(n.perdidasNoMes.quantidade)} nota={brl(n.perdidasNoMes.valorCents)} />
              <Cartao
                rotulo="Taxa de ganho"
                valor={n.taxaDeGanhoPercentual === null ? "—" : `${n.taxaDeGanhoPercentual}%`}
                nota="das negociações encerradas no mês"
              />
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium text-neutral-700">Motivos de perda no mês</h3>
              <Tabela
                colunas={["Motivo", "Negociações"]}
                linhas={n.motivosDePerda.map((m) => [m.nome, m.quantidade])}
                vazio="Nenhuma negociação perdida neste mês."
              />
            </div>
          </div>
        )}
      </Quadro>

      <Quadro titulo="Estoque e mais vendidos" falhou={!e}>
        {e && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Cartao rotulo="Produtos esgotados" valor={String(e.esgotados)} destaque={e.esgotados > 0} nota="ativos, com estoque zerado" />
              <Cartao rotulo="Estoque baixo" valor={String(e.baixos)} nota={`de 1 a ${e.limiteBaixo} unidades`} />
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-medium text-neutral-700">Para repor</h3>
                <Tabela
                  colunas={["Produto", "Estoque"]}
                  linhas={e.listaBaixos.map((p) => [p.name, p.stockQty <= 0 ? "Esgotado" : `${p.stockQty} un.`])}
                  vazio="Nenhum produto com estoque baixo."
                />
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-neutral-700">Mais vendidos no mês</h3>
                <Tabela
                  colunas={["Produto", "Unidades", "Faturamento"]}
                  linhas={e.maisVendidos.map((p) => [p.nome, p.quantidade, brl(p.totalCents)])}
                  vazio="Nenhum pedido fechado neste mês ainda."
                />
              </div>
            </div>
          </div>
        )}
      </Quadro>
    </div>
  );
}
