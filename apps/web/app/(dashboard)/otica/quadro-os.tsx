"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import {
  ETAPAS_DO_QUADRO,
  ROTULO_ETAPA,
  estaAtrasada,
  numeroOS,
  proximaEtapa,
  type Etapa,
} from "@/lib/otica-regras";
import { erroDaResposta, fetcher, previsaoCurta } from "./formatos";

type Cartao = {
  id: string;
  numero: number;
  etapa: Etapa;
  previsaoEntrega: string | null;
  lentes: string | null;
  armacao: string | null;
  valorCents: number;
  recebidoCents: number;
  saldoCents: number;
  pedidoLaboratorio: string | null;
  contact: { id: string; name: string | null; waName: string | null; phoneNumber: string | null };
  laboratorio: { nome: string } | null;
  consultor: { name: string } | null;
};

/**
 * O quadro das ordens de serviço: uma coluna por etapa, na ordem em que o
 * óculos anda. O botão do cartão leva à próxima etapa e avisa o cliente —
 * é o movimento do dia a dia, e por isso fica a um clique, sem abrir a OS.
 */
export function QuadroOS() {
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const { data, error, mutate, isLoading } = useSWR<Cartao[]>(
    `/api/otica/os${buscaAtiva ? `?q=${encodeURIComponent(buscaAtiva)}` : ""}`,
    fetcher,
    { refreshInterval: 30_000 }
  );
  const { data: opcoes } = useSWR<{ timezone: string }>("/api/otica/opcoes", fetcher);
  const [movendo, setMovendo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);

  const agora = new Date();
  const ordens = data ?? [];
  const porEtapa = useMemo(() => {
    const m = new Map<Etapa, Cartao[]>(ETAPAS_DO_QUADRO.map((e) => [e, []]));
    for (const o of ordens) m.get(o.etapa)?.push(o);
    return m;
  }, [ordens]);

  const atrasadas = ordens.filter((o) => estaAtrasada(o.etapa, o.previsaoEntrega ? new Date(o.previsaoEntrega) : null, agora));
  const prontas = porEtapa.get("PRONTA") ?? [];
  const aReceberProntas = prontas.reduce((s, o) => s + o.saldoCents, 0);

  async function avancar(o: Cartao) {
    const para = proximaEtapa(o.etapa);
    if (!para) return;
    setMovendo(o.id);
    setAviso(null);
    const r = await fetch(`/api/otica/os/${o.id}/etapa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ para, avisar: true }),
    });
    setMovendo(null);
    if (!r.ok) {
      setAviso({ texto: await erroDaResposta(r), erro: true });
      return;
    }
    const { aviso: resultado } = (await r.json()) as { aviso: string | null };
    setAviso({
      texto:
        resultado === "enviado"
          ? `OS ${numeroOS(o.numero)} em "${ROTULO_ETAPA[para]}". Cliente avisado pelo WhatsApp.`
          : `OS ${numeroOS(o.numero)} em "${ROTULO_ETAPA[para]}".${resultado ? ` Sem aviso ao cliente: ${resultado}.` : ""}`,
      erro: !!resultado && resultado !== "enviado" && !resultado.startsWith("etapa sem") && !resultado.startsWith("aviso desligado"),
    });
    mutate();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBuscaAtiva(busca.trim());
          }}
          className="flex gap-2 flex-1 min-w-[220px] max-w-md"
        >
          <input
            id="busca-os"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              if (!e.target.value) setBuscaAtiva("");
            }}
            placeholder="Buscar por nº da OS, cliente, CPF ou pedido do laboratório"
            className="flex-1 rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm"
          />
          <button className="rounded-md border border-neutral-300 px-3 py-2 text-sm hover:border-accent">Buscar</button>
        </form>
        <Link href="/otica/os/nova" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          Nova OS
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full px-3 py-1 ${atrasadas.length ? "bg-red-500/10 text-red-600" : "bg-neutral-100 text-neutral-500"}`}>
          {atrasadas.length} com prazo vencido
        </span>
        <span className="rounded-full bg-accent/10 px-3 py-1 text-accent">
          {prontas.length} pronta(s) para retirada{aReceberProntas ? ` · ${centsToBRL(aReceberProntas)} a receber` : ""}
        </span>
        {buscaAtiva && (
          <button onClick={() => { setBusca(""); setBuscaAtiva(""); }} className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-600 hover:text-neutral-900">
            Busca: “{buscaAtiva}” · limpar
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-amber-500/10 text-amber-700" : "bg-accent/10 text-accent"}`}>
          {aviso.texto}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-neutral-500">Carregando…</p>}

      {!isLoading && !error && ordens.length === 0 && (
        <div className="rounded-lg border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          {buscaAtiva ? "Nenhuma OS encontrada." : "Nenhuma OS em andamento. Clique em Nova OS para registrar a primeira venda."}
        </div>
      )}

      {ordens.length > 0 && (
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col auto-cols-[minmax(190px,1fr)] gap-3 min-w-max lg:min-w-0">
            {ETAPAS_DO_QUADRO.map((etapa) => {
              const itens = porEtapa.get(etapa) ?? [];
              return (
                <section key={etapa} className="flex flex-col gap-2 rounded-lg bg-neutral-100 p-2 min-h-[160px]">
                  <h2 className="flex justify-between px-1 pt-1 text-xs font-semibold text-neutral-600">
                    <span>{ROTULO_ETAPA[etapa]}</span>
                    <span className="tabular-nums">{itens.length}</span>
                  </h2>
                  {itens.map((o) => {
                    const atrasada = estaAtrasada(o.etapa, o.previsaoEntrega ? new Date(o.previsaoEntrega) : null, agora);
                    const saldo = o.saldoCents;
                    const prox = proximaEtapa(o.etapa);
                    return (
                      <article
                        key={o.id}
                        className={`flex flex-col gap-1.5 rounded-md border bg-surface p-2.5 text-sm ${atrasada ? "border-red-400" : "border-neutral-200"}`}
                      >
                        <Link href={`/otica/os/${o.id}`} className="flex flex-col gap-0.5 hover:text-accent">
                          <span className="text-[11px] text-neutral-500 tabular-nums">
                            OS {numeroOS(o.numero)}
                            {o.laboratorio ? ` · ${o.laboratorio.nome}` : ""}
                          </span>
                          <span className="font-medium leading-tight">{o.contact.name || o.contact.waName || o.contact.phoneNumber || "Sem nome"}</span>
                          {(o.lentes || o.armacao) && (
                            <span className="text-xs text-neutral-500 line-clamp-2">{[o.lentes, o.armacao].filter(Boolean).join(" · ")}</span>
                          )}
                        </Link>
                        <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                          <span className={atrasada ? "font-medium text-red-600" : "text-neutral-500"}>
                            {atrasada ? "Atrasada · " : ""}
                            {previsaoCurta(o.previsaoEntrega, opcoes?.timezone)}
                          </span>
                          <span className={saldo ? "text-amber-700" : "text-neutral-400"}>{saldo ? `falta ${centsToBRL(saldo)}` : o.valorCents ? "quitada" : "sem valor"}</span>
                        </div>
                        {prox && (
                          <button
                            onClick={() => avancar(o)}
                            disabled={movendo === o.id}
                            className="mt-0.5 rounded-md bg-accent/10 px-2 py-1.5 text-xs font-medium text-accent hover:bg-accent hover:text-white disabled:opacity-50"
                          >
                            {movendo === o.id ? "Movendo…" : `→ ${ROTULO_ETAPA[prox]}`}
                          </button>
                        )}
                      </article>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
