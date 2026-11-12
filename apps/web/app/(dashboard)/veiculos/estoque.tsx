"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  diferencaFipe,
  faixaDeEstoque,
  placaParaTela,
  type OrigemVeiculo,
  type StatusVeiculo,
} from "@/lib/veiculos-regras";
import { COR_FAIXA, botaoPrimario, brl, campo, fetcher } from "./comum";

type Linha = {
  id: string;
  placa: string | null;
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  cor: string | null;
  cambio: string | null;
  precoCents: number;
  fipeCents: number | null;
  status: StatusVeiculo;
  origem: OrigemVeiculo;
  dias: number;
  capaId: string | null;
  totalFotos: number;
  cliente: string | null;
  reservadaAte: string | null;
  saidaEm: string | null;
  custoCents?: number;
  margem?: { valorCents: number; percentual: number | null };
};

const FILTROS: { id: "todos" | StatusVeiculo; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos no pátio" },
  { id: "DISPONIVEL", rotulo: "Disponíveis" },
  { id: "PREPARACAO", rotulo: "Em preparação" },
  { id: "RESERVADO", rotulo: "Reservados" },
];

/**
 * O pátio: um cartão por carro, com a capa, o preço contra a FIPE e há
 * quantos dias ele está parado (a cor do selo é o alerta). A gestão vê também
 * o custo e a margem, e o capital empatado no estoque.
 */
export function Estoque({ vendidos }: { vendidos: boolean }) {
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]["id"]>("todos");
  const params = new URLSearchParams();
  if (vendidos) params.set("status", "VENDIDO");
  if (buscaAtiva) params.set("q", buscaAtiva);
  const { data, error, isLoading } = useSWR<{ gerencia: boolean; veiculos: Linha[] }>(`/api/veiculos?${params}`, fetcher, { refreshInterval: 60_000 });

  const todos = data?.veiculos ?? [];
  const lista = useMemo(() => (filtro === "todos" || vendidos ? todos : todos.filter((v) => v.status === filtro)), [todos, filtro, vendidos]);
  const gerencia = data?.gerencia ?? false;

  const noPatio = todos.filter((v) => v.status !== "VENDIDO" && v.status !== "DEVOLVIDO");
  const parados = noPatio.filter((v) => v.dias >= 60);
  const capital = noPatio.reduce((s, v) => s + (v.origem === "CONSIGNACAO" ? 0 : v.custoCents ?? 0), 0);
  const margemTotal = todos.reduce((s, v) => s + (v.margem?.valorCents ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBuscaAtiva(busca.trim());
          }}
          className="flex min-w-[220px] max-w-md flex-1 gap-2"
        >
          <input
            id="busca-veiculo"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              if (!e.target.value) setBuscaAtiva("");
            }}
            placeholder="Buscar por marca, modelo ou placa"
            className={campo}
          />
          <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:border-accent">Buscar</button>
        </form>
        {gerencia && (
          <Link href="/veiculos/novo" className={botaoPrimario}>
            Entrada de veículo
          </Link>
        )}
      </div>

      {!vendidos && (
        <div className="flex flex-wrap gap-2 text-xs">
          {FILTROS.map((f) => {
            const n = f.id === "todos" ? noPatio.length : noPatio.filter((v) => v.status === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={`rounded-full px-3 py-1 ${filtro === f.id ? "bg-accent text-white" : "bg-neutral-100 text-neutral-600 hover:text-neutral-900"}`}
              >
                {f.rotulo} · {n}
              </button>
            );
          })}
          <span className={`rounded-full px-3 py-1 ${parados.length ? "bg-red-500/10 text-red-600" : "bg-neutral-100 text-neutral-500"}`}>
            {parados.length} parado(s) há 60+ dias
          </span>
          {gerencia && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600">Capital em estoque: {brl(capital)}</span>}
        </div>
      )}
      {vendidos && gerencia && todos.length > 0 && (
        <p className="text-xs text-neutral-500">
          {todos.length} venda(s) listada(s) · margem bruta somada {brl(margemTotal)}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-neutral-500">Carregando…</p>}
      {!isLoading && !error && lista.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {buscaAtiva ? "Nenhum veículo encontrado." : vendidos ? "Nenhuma venda ainda." : gerencia ? "Estoque vazio. Cadastre um carro em Entrada de veículo ou traga o estoque todo em Importar planilha." : "Estoque vazio."}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {lista.map((v) => {
          const faixa = faixaDeEstoque(v.dias);
          const fipe = diferencaFipe(v.precoCents, v.fipeCents);
          return (
            <Link key={v.id} href={`/veiculos/${v.id}`} className="group flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-surface hover:border-accent">
              <div className="relative aspect-[4/3] bg-neutral-100">
                {v.capaId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/veiculos/fotos/${v.capaId}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-neutral-400">sem foto</div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">{ROTULO_STATUS[v.status]}</span>
                {v.status !== "VENDIDO" && (
                  <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_FAIXA[faixa]}`}>{v.dias} dia(s)</span>
                )}
              </div>
              <div className="flex flex-col gap-1 p-3 text-sm">
                <span className="font-medium leading-tight group-hover:text-accent">
                  {v.marca} {v.modelo} {v.versao ?? ""}
                </span>
                <span className="text-xs text-neutral-500">
                  {v.anoFabricacao}/{v.anoModelo} · {v.km.toLocaleString("pt-BR")} km{v.placa ? ` · ${placaParaTela(v.placa)}` : ""}
                  {v.origem !== "COMPRA" ? ` · ${ROTULO_ORIGEM[v.origem]}` : ""}
                </span>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold tabular-nums">{brl(v.precoCents)}</span>
                  {fipe !== null && !vendidos && (
                    <span className={`text-[11px] ${fipe > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {fipe > 0 ? "+" : ""}
                      {fipe.toLocaleString("pt-BR")}% FIPE
                    </span>
                  )}
                </div>
                {v.margem && (
                  <span className={`text-xs ${v.margem.valorCents < 0 ? "text-red-600" : "text-neutral-500"}`}>
                    Custo {brl(v.custoCents)} · margem {brl(v.margem.valorCents)}
                    {v.margem.percentual !== null ? ` (${v.margem.percentual.toLocaleString("pt-BR")}%)` : ""}
                  </span>
                )}
                {v.cliente && (
                  <span className="text-xs text-neutral-500">
                    {v.status === "RESERVADO" ? "Reservado para" : "Vendido para"} {v.cliente}
                    {v.status === "RESERVADO" && v.reservadaAte ? ` até ${new Date(v.reservadaAte).toLocaleDateString("pt-BR", { timeZone: "UTC" })}` : ""}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
