"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { botaoSecundario, campo, erroDaResposta, fetcher } from "../comum";

type Anuncio = { ativo: boolean; status: string; url: string | null; erro: string | null; plano: string | null };
type Portal = { portal: string; nome: string; conectado: boolean; situacaoConta: string | null; publicados: number; naFila: number; comErro: number; fora: number; foraSemKm: number };
type Carro = { id: string; nome: string; placa: string | null; status: string; dias: number; precoCents: number; semKm: boolean; anuncios: Record<string, Anuncio | null> };
type Grade = { portais: Portal[]; carros: Carro[] };

const ROTULO: Record<string, { texto: string; classe: string }> = {
  PUBLICADO: { texto: "Publicado", classe: "bg-emerald-500/10 text-emerald-700" },
  FILA: { texto: "Na fila", classe: "bg-neutral-100 text-neutral-600" },
  ENVIADO: { texto: "Enviado", classe: "bg-amber-500/10 text-amber-700" },
  ERRO: { texto: "Com erro", classe: "bg-red-500/10 text-red-600" },
  REMOVENDO: { texto: "Saindo", classe: "bg-amber-500/10 text-amber-700" },
  REMOVIDO: { texto: "Removido", classe: "bg-neutral-100 text-neutral-500" },
};

const naFila = (a: Anuncio | null) => !!a?.ativo && (a.status === "FILA" || a.status === "ENVIADO");

/** Veículos > Anúncios: cada carro à venda em cada portal, com ligar e tirar por carro e "publicar os que faltam" por portal. */
export function GradeDePortais() {
  const { data, mutate } = useSWR<Grade>("/api/veiculos/anuncios", fetcher, { refreshInterval: 30_000 });
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "problema" | "fora">("todos");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;
  if (data.portais.length === 0) {
    return (
      <p className="rounded-lg border border-neutral-200 bg-surface p-6 text-sm text-neutral-600">
        Nenhum portal conectado ainda. Conecte a Webmotors, a MobiAuto, o NaPista ou a OLX em{" "}
        <Link href="/veiculos/portais" className="text-accent hover:underline">
          Veículos &gt; Portais
        </Link>{" "}
        e os carros aparecem aqui.
      </p>
    );
  }

  const termo = busca.trim().toLowerCase();
  const carros = data.carros.filter((c) => {
    if (termo && !`${c.nome} ${c.placa ?? ""}`.toLowerCase().includes(termo)) return false;
    const cels = data.portais.map((p) => c.anuncios[p.portal] ?? null);
    if (filtro === "problema") return cels.some((a) => a?.ativo && a.status === "ERRO");
    if (filtro === "fora") return c.status === "DISPONIVEL" && cels.some((a, i) => data.portais[i].conectado && !a?.ativo);
    return true;
  });

  async function alternar(c: Carro, p: Portal, ligar: boolean) {
    setAviso(null);
    setOcupado(`${c.id}:${p.portal}`);
    const r = await fetch(`/api/veiculos/${c.id}/portais`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portal: p.portal, ativo: ligar }) });
    setOcupado(null);
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    mutate();
  }

  async function publicarOsQueFaltam(p: Portal) {
    const ids = data!.carros.filter((c) => c.status === "DISPONIVEL" && !c.anuncios[p.portal]?.ativo).map((c) => c.id);
    if (!ids.length) return;
    const aviso1 = `Publicar ${ids.length} carro(s) ${p.nome === "OLX" ? "na" : "no"} ${p.nome}?\n\nCada anúncio pode ocupar uma vaga do plano da loja no portal. ${p.foraSemKm ? `${p.foraSemKm} deles estão sem quilometragem e só sobem quando a km for preenchida.` : ""}`;
    if (!confirm(aviso1.trim())) return;
    setAviso(null);
    setOcupado(`lote:${p.portal}`);
    const r = await fetch("/api/veiculos/anuncios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portal: p.portal, veiculoIds: ids }) });
    setOcupado(null);
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    const j = await r.json();
    setAviso({ texto: `${j.pedidos} carro(s) entraram na fila do ${p.nome}.${j.semKm ? ` ${j.semKm} estão sem km e esperam o preenchimento.` : ""}` });
    mutate();
  }

  return (
    <div className="flex flex-col gap-4" data-testid="grade-de-portais">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.portais.map((p) => (
          <div key={p.portal} className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{p.nome}</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs ${p.conectado ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600"}`}>{p.conectado ? "Conectado" : "Desconectado"}</span>
            </div>
            <p className="text-xs text-neutral-600">
              <b className="text-sm text-neutral-900">{p.publicados}</b> publicados
              {p.naFila > 0 && <> · {p.naFila} na fila</>}
              {p.comErro > 0 && <span className="text-red-600"> · {p.comErro} com erro</span>}
            </p>
            <p className="text-xs text-neutral-500">{p.fora} à venda fora do portal</p>
            {p.conectado ? (
              <button className={botaoSecundario} disabled={p.fora === 0 || ocupado === `lote:${p.portal}`} onClick={() => publicarOsQueFaltam(p)}>
                {ocupado === `lote:${p.portal}` ? "Enviando…" : p.fora ? `Publicar os ${p.fora} que faltam` : "Tudo publicado ✓"}
              </button>
            ) : (
              <Link href="/veiculos/portais" className="text-xs text-accent hover:underline">
                Reconectar em Portais
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar marca, modelo ou placa" className={`${campo} max-w-xs`} aria-label="Buscar carro" />
        {([["todos", "Todos"], ["fora", "Faltando em algum portal"], ["problema", "Com erro"]] as const).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-md px-3 py-1.5 text-sm ${filtro === k ? "bg-neutral-100 font-semibold" : "text-neutral-500 hover:text-neutral-800"}`}>
            {t}
          </button>
        ))}
        <span className="ml-auto text-xs text-neutral-500">{carros.length} de {data.carros.length} carros</span>
      </div>
      {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-normal">Carro</th>
              {data.portais.map((p) => (
                <th key={p.portal} className="px-3 py-2 font-normal">{p.nome}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carros.map((c) => (
              <tr key={c.id} className="border-t border-neutral-100 align-top">
                <td className="px-3 py-2.5">
                  <Link href={`/veiculos/${c.id}`} className="font-medium hover:text-accent">{c.nome}</Link>
                  <p className="text-xs text-neutral-500">
                    {c.precoCents > 0 ? centsToBRL(c.precoCents) : "sem preço"} · {c.dias} dias{c.status === "RESERVADO" ? " · reservado" : ""}
                    {c.semKm && <span className="text-amber-700"> · sem km</span>}
                  </p>
                </td>
                {data.portais.map((p) => {
                  const a = c.anuncios[p.portal] ?? null;
                  const rot = a?.ativo ? ROTULO[a.status] : null;
                  const ocupadoAqui = ocupado === `${c.id}:${p.portal}`;
                  return (
                    <td key={p.portal} className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        {rot ? <span className={`rounded-full px-2 py-0.5 text-xs ${rot.classe}`}>{rot.texto}</span> : <span className="text-xs text-neutral-400">Não anunciado</span>}
                        {a?.ativo && a.erro && <span className="max-w-[18ch] truncate text-[11px] text-red-600" title={a.erro}>{a.erro}</span>}
                        {a?.plano && a.ativo && <span className="text-[11px] text-neutral-500">plano {a.plano}</span>}
                        <span className="flex gap-2 text-xs">
                          {a?.url && a.status === "PUBLICADO" && a.ativo && (
                            <a href={a.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">ver</a>
                          )}
                          {p.conectado && c.status === "DISPONIVEL" && (
                            <button type="button" disabled={ocupadoAqui} onClick={() => alternar(c, p, !a?.ativo)} className="text-neutral-500 hover:text-accent disabled:opacity-50">
                              {ocupadoAqui ? "…" : a?.ativo ? "Tirar" : "Publicar"}
                            </button>
                          )}
                          {naFila(a) && <span className="text-neutral-400">aguardando envio</span>}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {carros.length === 0 && (
              <tr>
                <td colSpan={data.portais.length + 1} className="px-3 py-6 text-center text-sm text-neutral-500">Nenhum carro com esse filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Disponível e anunciado: vai para o portal sozinho. Mudou preço, km ou fotos: o anúncio atualiza. Vendeu ou reservou: sai do ar. Carro sem quilometragem não sobe.</p>
    </div>
  );
}
