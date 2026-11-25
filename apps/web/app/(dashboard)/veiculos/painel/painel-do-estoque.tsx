"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { secao, fetcher } from "../comum";

type Item = { id: string; nome: string; dias: number; precoCents: number; detalhe: string | null };
type Lista = { total: number; itens: Item[] };
type Painel = {
  total: number;
  publicados: number;
  idadeMediaDias: number;
  maisDe60Dias: number;
  inativosNoSite: number;
  qualidadeMedia: number | null;
  porDias: { ate30: number; ate60: number; ate90: number; mais90: number };
  porFipe: { abaixo: number; naFaixa: number; acima: number; semFipe: number };
  maisAntigos: Item[];
  recomendacoes: { semPublicacao: Lista; paradosAcimaDaFipe: Lista; semPreco: Lista; semKm: Lista; semFotos: Lista; problemaNosPortais: Lista };
};

function Cartao({ titulo, valor, unidade, detalhe, alerta }: { titulo: string; valor: string; unidade?: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${alerta ? "border-amber-300 bg-amber-50" : "border-neutral-200 bg-surface"}`}>
      <p className="text-xs text-neutral-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {valor}
        {unidade && <span className="ml-1.5 text-sm font-normal text-neutral-500">{unidade}</span>}
      </p>
      {detalhe && <p className="mt-1 text-xs text-neutral-500">{detalhe}</p>}
    </div>
  );
}

function Recomendacao({ titulo, lista, aberta, aoAbrir }: { titulo: string; lista: Lista; aberta: boolean; aoAbrir: () => void }) {
  if (lista.total === 0) {
    return (
      <li className="flex items-center justify-between rounded-md bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
        <span>{titulo}</span>
        <span className="font-medium">Nenhum ✓</span>
      </li>
    );
  }
  return (
    <li className="rounded-md border border-neutral-200">
      <button type="button" onClick={aoAbrir} aria-expanded={aberta} className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm hover:bg-neutral-50">
        <span>{titulo}</span>
        <span className="flex items-center gap-2">
          <b className="tabular-nums">{lista.total}</b>
          <span className="text-neutral-400">{aberta ? "▾" : "▸"}</span>
        </span>
      </button>
      {aberta && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
          {lista.itens.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 px-3 py-2 text-sm">
              <Link href={`/veiculos/${i.id}`} className="font-medium text-accent hover:underline">
                {i.nome}
              </Link>
              <span className="text-xs text-neutral-500">{i.dias} dias</span>
              <span className="text-xs text-neutral-500">{i.precoCents > 0 ? centsToBRL(i.precoCents) : "sem preço"}</span>
              {i.detalhe && <span className="text-xs text-amber-700">{i.detalhe}</span>}
            </li>
          ))}
          {lista.total > lista.itens.length && <li className="px-3 py-2 text-xs text-neutral-500">Mostrando os {lista.itens.length} mais antigos de {lista.total}.</li>}
        </ul>
      )}
    </li>
  );
}

function Barras({ linhas, cor }: { linhas: { rotulo: string; valor: number; cor: string }[]; cor?: string }) {
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <ul className="flex flex-col gap-2.5">
      {linhas.map((l) => (
        <li key={l.rotulo} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 text-neutral-600">{l.rotulo}</span>
          <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
            <span className={`block h-full rounded-full ${l.cor || cor}`} style={{ width: `${(l.valor / max) * 100}%` }} />
          </span>
          <b className="w-8 text-right tabular-nums">{l.valor}</b>
        </li>
      ))}
    </ul>
  );
}

/** Veículos > Painel: o pátio de relance e o que arrumar primeiro. */
export function PainelDoEstoque() {
  const { data } = useSWR<Painel>("/api/veiculos/painel", fetcher, { refreshInterval: 120_000 });
  const [aberta, setAberta] = useState<string | null>(null);
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;
  const r = data.recomendacoes;
  const pctPublicados = data.total ? Math.round((data.publicados / data.total) * 100) : 0;
  const abrir = (k: string) => setAberta((a) => (a === k ? null : k));

  if (data.total === 0) return <p className="rounded-lg border border-neutral-200 bg-surface p-6 text-sm text-neutral-600">Ainda não há carros no estoque. Cadastre ou importe os carros e o painel aparece aqui.</p>;

  return (
    <div className="flex flex-col gap-4" data-testid="painel-do-estoque">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Estoque total" valor={String(data.total)} unidade="veículos" detalhe={`${data.publicados} publicados (${pctPublicados}%)`} />
        <Cartao titulo="Idade média do estoque" valor={String(data.idadeMediaDias)} unidade="dias" />
        <Cartao titulo="Mais de 60 dias no pátio" valor={String(data.maisDe60Dias)} unidade="veículos" detalhe={data.total ? `${Math.round((data.maisDe60Dias / data.total) * 100)}% do estoque` : undefined} alerta={data.maisDe60Dias > 0 && data.maisDe60Dias / data.total >= 0.3} />
        <Cartao titulo="Fora do site" valor={String(data.inativosNoSite)} unidade="veículos" detalhe="à venda, mas escondidos da vitrine" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={secao}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recomendações</h2>
            {data.qualidadeMedia !== null && (
              <span className="text-xs text-neutral-500">
                Qualidade média dos anúncios: <b className="text-base text-neutral-800">{data.qualidadeMedia}%</b>
              </span>
            )}
          </div>
          <ul className="flex flex-col gap-2">
            <Recomendacao titulo="Carros à venda sem publicação" lista={r.semPublicacao} aberta={aberta === "semPublicacao"} aoAbrir={() => abrir("semPublicacao")} />
            <Recomendacao titulo="Parados há 90 dias ou mais e acima da FIPE" lista={r.paradosAcimaDaFipe} aberta={aberta === "paradosAcimaDaFipe"} aoAbrir={() => abrir("paradosAcimaDaFipe")} />
            <Recomendacao titulo="Carros sem preço" lista={r.semPreco} aberta={aberta === "semPreco"} aoAbrir={() => abrir("semPreco")} />
            <Recomendacao titulo="Carros sem quilometragem" lista={r.semKm} aberta={aberta === "semKm"} aoAbrir={() => abrir("semKm")} />
            <Recomendacao titulo="Carros sem fotos" lista={r.semFotos} aberta={aberta === "semFotos"} aoAbrir={() => abrir("semFotos")} />
            <Recomendacao titulo="Anúncios com problema nos portais" lista={r.problemaNosPortais} aberta={aberta === "problemaNosPortais"} aoAbrir={() => abrir("problemaNosPortais")} />
          </ul>
        </section>

        <div className="flex flex-col gap-4">
          <section className={secao}>
            <h2 className="text-sm font-semibold">Dias em estoque</h2>
            <Barras
              linhas={[
                { rotulo: "0 a 30 dias", valor: data.porDias.ate30, cor: "bg-emerald-500" },
                { rotulo: "31 a 60 dias", valor: data.porDias.ate60, cor: "bg-yellow-400" },
                { rotulo: "61 a 89 dias", valor: data.porDias.ate90, cor: "bg-orange-500" },
                { rotulo: "90 dias ou mais", valor: data.porDias.mais90, cor: "bg-red-500" },
              ]}
            />
            {data.maisAntigos.length > 0 && (
              <div className="mt-1 border-t border-neutral-100 pt-3">
                <p className="mb-1.5 text-xs text-neutral-500">Mais antigos no estoque</p>
                <ul className="flex flex-col gap-1.5">
                  {data.maisAntigos.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                      <Link href={`/veiculos/${i.id}`} className="truncate hover:text-accent">
                        {i.nome}
                      </Link>
                      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{i.dias} dias</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className={secao}>
            <h2 className="text-sm font-semibold">Preço × FIPE</h2>
            <Barras
              linhas={[
                { rotulo: "Abaixo", valor: data.porFipe.abaixo, cor: "bg-blue-500" },
                { rotulo: "Na faixa", valor: data.porFipe.naFaixa, cor: "bg-emerald-500" },
                { rotulo: "Acima", valor: data.porFipe.acima, cor: "bg-amber-500" },
              ]}
            />
            <p className="text-xs text-neutral-500">
              Abaixo: 5% ou mais abaixo da FIPE. Acima: mais de 10% acima.
              {data.porFipe.semFipe > 0 ? ` ${data.porFipe.semFipe} carro(s) sem FIPE ou sem preço ficam de fora.` : ""}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
