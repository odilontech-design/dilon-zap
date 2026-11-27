"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { lerReais } from "@/lib/otica-regras";
import { classeDosDias, contagemPorFiltro, filtrarEOrdenar, FILTROS, ORDENS, resumoDoErro, type AnuncioDaGrade, type CarroDaGrade, type Filtro, type Ordem } from "@/lib/grade-portais-filtros";
import { lerKm } from "@/lib/veiculos-completar-km";
import { erroDaResposta, fetcher } from "../comum";
import { MenuDoVeiculo } from "./menu-do-veiculo";

type Portal = { portal: string; nome: string; conectado: boolean; situacaoConta: string | null; publicados: number; naFila: number; comErro: number; pendentes: number; fora: number; foraSemKm: number };
type Grade = { portais: Portal[]; aVenda: number; carros: CarroDaGrade[] };
type DetalheNapista =
  | { situacao: "sem-anuncio" | "sem-conta" }
  | { situacao: "ok"; codigo: string; status: string | null; titulo: string | null; km: number | null; preco: number | null; placa: string | null; fotos: number; atualizadoEm: string | null; enderecoPublico: string | null; campos: string[]; diagnostico: unknown }
  | { erro: string };

const CLASSE_DIAS = { normal: "bg-white/90 text-neutral-800", atencao: "bg-amber-400 text-neutral-900", parado: "bg-red-600 text-white" } as const;
/** Controles da barra de filtros: sem `w-full` (o `campo` da tela ocupa a linha inteira e empilhava tudo). */
const controle = "rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";

type Modalidade = { codigo: string; descricao: string; total: number; usados: number };

/**
 * O plano deste carro na Webmotors. A lista vem ao vivo da Webmotors e só é pedida quando alguém abre o seletor (e fica
 * em cache por 1 minuto), para a grade não consultar o portal a cada carro. Trocar muda o que a loja gasta lá: confirma antes.
 */
function PlanoDoCarro({ carroId, plano, aoMudar, avisar }: { carroId: string; plano: string | null; aoMudar: () => void; avisar: (a: { texto: string; erro?: boolean }) => void }) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const planos = useSWR<{ modalidades: Modalidade[] }>(aberto ? "/api/portais/webmotors/plano" : null, fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  async function trocar(codigo: string) {
    const novo = codigo || null;
    const m = planos.data?.modalidades.find((x) => x.codigo === codigo);
    const destino = novo ? `o plano "${m?.descricao ?? novo}"` : "o plano padrão da loja";
    if (!confirm(`Passar este carro para ${destino} na Webmotors?\n\nO anúncio muda de plano no próximo envio e isso pode mudar o que a loja paga lá.`)) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/veiculos/${carroId}/plano-webmotors`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: novo }) });
      if (!r.ok) return avisar({ texto: await erroDaResposta(r), erro: true });
      avisar({ texto: "Plano salvo: a troca vai na próxima rodada de envio." });
      setAberto(false);
      aoMudar();
    } finally {
      setSalvando(false);
    }
  }
  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="inline-flex min-w-[6.5rem] items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-800 shadow-sm hover:border-accent" title="Trocar o plano deste carro na Webmotors">
        {plano ? `Plano ${plano}` : "Plano padrão"} <span aria-hidden className="text-[9px] text-neutral-400">▼</span>
      </button>
    );
  }
  return (
    <span className="flex flex-col gap-0.5">
      <select
        aria-label="Plano do anúncio na Webmotors"
        value={plano ?? ""}
        disabled={salvando || !planos.data}
        onChange={(e) => trocar(e.target.value)}
        className="max-w-[12rem] rounded border border-neutral-300 bg-surface px-1 py-0.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-accent/40"
      >
        <option value="">{planos.error ? "Erro ao consultar a Webmotors" : planos.data ? "Plano padrão da loja" : "Carregando…"}</option>
        {planos.data?.modalidades.map((m) => (
          <option key={m.codigo} value={m.codigo} disabled={m.total > 0 && m.usados >= m.total && m.codigo !== plano}>
            {m.descricao}
            {m.total > 0 ? ` (${m.usados}/${m.total})` : ""}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => setAberto(false)} className="self-start text-[11px] text-neutral-400 hover:text-neutral-600">
        fechar
      </button>
    </span>
  );
}

/**
 * Valor que se corrige ali mesmo: clica, digita, Enter salva (Esc cancela). O salvamento é de quem chama e devolve o
 * texto do erro, se houver.
 */
function Editavel({ rotulo, exibido, inicial, ajuda, aoSalvar, destaque }: { rotulo: string; exibido: string; inicial: string; ajuda?: string | null; aoSalvar: (texto: string) => Promise<string | null>; destaque?: boolean }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const e = await aoSalvar(texto);
    setSalvando(false);
    if (e) return setErro(e);
    setErro(null);
    setEditando(false);
  }

  if (!editando) {
    return (
      <button
        type="button"
        title={`Corrigir ${rotulo.toLowerCase()}`}
        onClick={() => {
          setTexto(inicial);
          setErro(null);
          setEditando(true);
        }}
        className={`rounded px-1 text-left hover:bg-neutral-100 ${destaque ? "text-amber-700" : ""}`}
      >
        {exibido}
        {ajuda && <span className="ml-1 text-[11px] text-amber-700">{ajuda}</span>}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col gap-0.5">
      <input
        autoFocus
        aria-label={rotulo}
        value={texto}
        disabled={salvando}
        inputMode={rotulo === "Km" ? "numeric" : "decimal"}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") setEditando(false);
        }}
        onBlur={() => !salvando && !erro && setEditando(false)}
        className="w-28 rounded-md border border-neutral-300 bg-surface px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {erro && <span className="text-[11px] text-red-600">{erro}</span>}
    </span>
  );
}

/** Veículos > Anúncios: cada carro à venda em cada portal, com os números de cada portal no topo, busca, filtros, ordenação e correção de preço e km na própria linha. */
export function GradeDePortais() {
  const { data, mutate } = useSWR<Grade>("/api/veiculos/anuncios", fetcher, { refreshInterval: 30_000 });
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [portalFiltro, setPortalFiltro] = useState("todos");
  const [ordem, setOrdem] = useState<Ordem>("maisTempo");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, DetalheNapista | "carregando">>({});
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

  const conectados = data.portais.filter((p) => p.conectado).map((p) => p.portal);
  const carros = filtrarEOrdenar(data.carros, conectados, { termo: busca, filtro, portal: portalFiltro, ordem });
  const contagens = contagemPorFiltro(data.carros, conectados, busca, portalFiltro);

  async function alternar(c: CarroDaGrade, p: Portal, ligar: boolean) {
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

  /** "Atualizar agora": devolve à fila o que está pendente ou com erro, sem esperar a próxima tentativa. Sem portal = todos os conectados com pendência. */
  async function atualizarAgora(alvo: Portal | null) {
    const portais = alvo ? [alvo] : data!.portais.filter((p) => p.conectado && p.pendentes > 0);
    if (!portais.length) return;
    setAviso(null);
    setOcupado(alvo ? `atualizar:${alvo.portal}` : "atualizar:todos");
    let total = 0;
    for (const p of portais) {
      const r = await fetch("/api/veiculos/anuncios", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ portal: p.portal }) });
      if (!r.ok) {
        setOcupado(null);
        return setAviso({ texto: `${p.nome}: ${await erroDaResposta(r)}`, erro: true });
      }
      total += ((await r.json()) as { reenviados: number }).reenviados;
    }
    setOcupado(null);
    setAviso({ texto: `${total} anúncio(s) voltaram para a fila e são enviados em até 1 minuto. Os que ainda tiverem pendência (km, versão, foto) continuam com o motivo na linha.` });
    mutate();
  }

  /** Pergunta ao NaPista como está o anúncio deste carro (status, fotos, km) e se ele devolve o endereço público. */
  async function conferirNoNapista(c: CarroDaGrade) {
    setDetalhes((d) => ({ ...d, [c.id]: "carregando" }));
    const r = await fetch(`/api/portais/napista/anuncio?veiculoId=${encodeURIComponent(c.id)}`);
    const resultado: DetalheNapista = r.ok ? ((await r.json()) as DetalheNapista) : { erro: await erroDaResposta(r) };
    setDetalhes((d) => ({ ...d, [c.id]: resultado }));
  }

  /** Corrige o preço do site ou a km de um carro, pela mesma rota da tela Completar (vai para o histórico do carro). */
  async function corrigir(c: CarroDaGrade, campoEditado: "km" | "preco", texto: string): Promise<string | null> {
    const item: { id: string; km?: number; precoCents?: number } = { id: c.id };
    if (campoEditado === "km") {
      const km = lerKm(texto);
      if (typeof km !== "number") return "digite só números (ex.: 45300)";
      item.km = km;
    } else {
      const preco = lerReais(texto);
      if (typeof preco !== "number" || preco <= 0) return "preço no formato 45.900,00";
      item.precoCents = preco;
    }
    const r = await fetch("/api/veiculos/completar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itens: [item], colocarAVenda: false }) });
    if (!r.ok) return await erroDaResposta(r);
    await mutate();
    return null;
  }

  const pendentesTotal = data.portais.filter((p) => p.conectado).reduce((t, p) => t + p.pendentes, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-surface shadow-sm" data-testid="grade-de-portais">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <h2 className="text-lg font-semibold">
          <span className="text-accent">{data.aVenda}</span> veículos à venda
        </h2>
        <span className="text-xs text-neutral-500">
          Mostrando {carros.length} de {data.carros.length}
        </span>
      </div>

      <div className="flex flex-col gap-2 border-b border-neutral-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-[12rem] flex-1">
            <span className="sr-only">Buscar carro</span>
            <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 fill-neutral-400">
              <path d="M8.5 3a5.5 5.5 0 0 1 4.38 8.83l3.65 3.64-1.06 1.06-3.64-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
            </svg>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, modelo ou placa" className={`${controle} w-full pl-9`} />
          </label>
          <select value={portalFiltro} onChange={(e) => setPortalFiltro(e.target.value)} className={controle} aria-label="Portal do filtro">
            <option value="todos">Todos os portais</option>
            {data.portais.map((p) => (
              <option key={p.portal} value={p.portal}>
                {p.nome}
              </option>
            ))}
          </select>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={controle} aria-label="Ordenar por">
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1" role="group" aria-label="Filtros">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs ${filtro === f.id ? "border-accent bg-accent/10 font-medium text-accent" : "border-transparent text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"}`}
            >
              {f.rotulo}
              {f.id !== "todos" && contagens[f.id] > 0 && <span className="ml-1 tabular-nums text-neutral-400">{contagens[f.id]}</span>}
            </button>
          ))}
        </div>
        {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
      </div>

      <div className="max-h-[75vh] overflow-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-30 border-b border-neutral-200 bg-surface px-4 py-2 text-left text-xs font-normal text-neutral-400 md:left-0">
                <span className="sr-only">Veículo</span>
              </th>
              {data.portais.map((p) => {
                const pct = data.aVenda > 0 ? Math.min(100, Math.round((p.publicados / data.aVenda) * 100)) : 0;
                return (
                  <th key={p.portal} className="sticky top-0 z-20 w-36 min-w-[9rem] border-b border-neutral-200 bg-surface px-2 py-2 text-center align-top font-normal">
                    <div className="flex flex-col items-center gap-1">
                      <SeloDoPortal portal={p.portal} nome={p.nome} conectado={p.conectado} />
                      <span className="text-xs text-neutral-500">
                        <b className="text-sm tabular-nums text-neutral-900">{p.publicados}</b>/{data.aVenda}
                      </span>
                      <span className="h-0.5 w-16 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label={`${p.nome}: ${p.publicados} de ${data.aVenda} no ar`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                      </span>
                      {!p.conectado ? (
                        <Link href="/veiculos/portais" className="text-[11px] text-red-600 hover:underline">
                          Reconectar
                        </Link>
                      ) : p.fora > 0 ? (
                        <button type="button" className="text-[11px] text-accent hover:underline disabled:opacity-50" disabled={ocupado === `lote:${p.portal}`} onClick={() => publicarOsQueFaltam(p)} title="Publicar os carros à venda que ainda não estão neste portal">
                          {ocupado === `lote:${p.portal}` ? "Enviando…" : `+ Publicar ${p.fora}`}
                        </button>
                      ) : (
                        <span className="h-4" aria-hidden />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {carros.map((c) => {
              const precoPortal = c.precoClassificadosCents ?? c.precoCents;
              return (
                <tr key={c.id} className="group">
                  <td className="min-w-[16rem] max-w-[16rem] border-b border-neutral-100 bg-surface px-3 py-3 align-middle sm:px-4 md:sticky md:left-0 md:z-10 md:max-w-none">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="flex shrink-0 flex-col items-center gap-1">
                        <Link href={`/veiculos/${c.id}`} className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white hover:opacity-90" title="Editar o carro" aria-label={`Editar ${c.nome}`}>
                          <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 fill-current">
                            <path d="M13.6 2.6a2 2 0 0 1 2.8 2.8l-9 9-3.9 1.1 1.1-3.9 9-9Zm1.4 1.4a.5.5 0 0 0-.7 0l-.9.9.7.7.9-.9a.5.5 0 0 0 0-.7ZM12.9 6l-7.7 7.7-.4 1.5 1.5-.4L14 7.1 12.9 6Z" />
                          </svg>
                        </Link>
                        <MenuDoVeiculo carro={c} portaisAtivos={data.portais.filter((p) => c.anuncios[p.portal]?.ativo).map((p) => ({ portal: p.portal, nome: p.nome }))} aoMudar={() => mutate()} avisar={setAviso} />
                      </div>
                      <Link href={`/veiculos/${c.id}`} className="relative block h-14 w-[4.5rem] shrink-0 overflow-hidden rounded-md bg-neutral-100 sm:h-[72px] sm:w-24" aria-label={`Abrir ${c.nome}`}>
                        {c.capaId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/veiculos/fotos/${c.capaId}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[11px] text-amber-700">sem foto</span>
                        )}
                        <span className={`absolute bottom-1 left-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${CLASSE_DIAS[classeDosDias(c.dias)]}`}>{c.dias} dias</span>
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/veiculos/${c.id}`} className="block truncate text-[15px] leading-tight hover:text-accent">
                          <b className="font-semibold uppercase">{c.nome.replace(/\s+\d{4}(\/\d{4})?$/, "")}</b>{" "}
                          <span className="text-neutral-500">{c.nome.match(/\d{4}(\/\d{4})?$/)?.[0] ?? ""}</span>
                        </Link>
                        {c.versao && <p className="truncate text-xs uppercase text-neutral-500">{c.versao}</p>}
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                          {c.placa && <span className="rounded border border-neutral-200 px-1.5 py-px font-mono text-neutral-600">{c.placa}</span>}
                          {c.status === "RESERVADO" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-px text-amber-700">● Reservado</span>
                          ) : c.naVitrine ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-px text-emerald-700">● Ativo no site</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-px text-neutral-500">● Fora do site</span>
                          )}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-neutral-500">
                          <span>
                            Site <Editavel rotulo="Preço do site" exibido={c.precoCents > 0 ? centsToBRL(c.precoCents) : "sem preço"} inicial={c.precoCents > 0 ? (c.precoCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""} aoSalvar={(t) => corrigir(c, "preco", t)} destaque={c.precoCents <= 0} />
                          </span>
                          <span>
                            Classificados <b className="font-semibold text-neutral-800">{precoPortal > 0 ? centsToBRL(precoPortal) : "—"}</b>
                          </span>
                          <span>
                            Km <Editavel rotulo="Km" exibido={c.semKm ? "informar" : c.km.toLocaleString("pt-BR")} inicial={c.semKm ? "" : String(c.km)} aoSalvar={(t) => corrigir(c, "km", t)} destaque={c.semKm} />
                          </span>
                        </p>
                      </div>
                    </div>
                  </td>
                  {data.portais.map((p) => (
                    <CelulaDoPortal
                      key={p.portal}
                      carro={c}
                      portal={p}
                      ocupado={ocupado === `${c.id}:${p.portal}`}
                      aoAlternar={(ligar) => alternar(c, p, ligar)}
                      aoMudar={() => mutate()}
                      avisar={setAviso}
                      detalheNapista={detalhes[c.id]}
                      aoConferirNapista={() => conferirNoNapista(c)}
                    />
                  ))}
                </tr>
              );
            })}
            {carros.length === 0 && (
              <tr>
                <td colSpan={data.portais.length + 1} className="px-3 py-10 text-center text-sm text-neutral-500">
                  Nenhum carro com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky bottom-0 z-30 border-t border-neutral-200 bg-surface px-4 py-2 text-xs text-neutral-500 md:left-0">
                {pendentesTotal > 0 ? (
                  <button type="button" className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/5 disabled:opacity-50" disabled={ocupado === "atualizar:todos"} onClick={() => atualizarAgora(null)}>
                    {ocupado === "atualizar:todos" ? "Atualizando…" : `↻ Atualizar todos (${pendentesTotal})`}
                  </button>
                ) : (
                  "Tudo em dia nos portais."
                )}
              </td>
              {data.portais.map((p) => (
                <td key={p.portal} className="sticky bottom-0 z-20 border-t border-neutral-200 bg-surface px-2 py-2 text-center">
                  {p.conectado && p.pendentes > 0 && (
                    <button type="button" className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-500/5 disabled:opacity-50" disabled={ocupado === `atualizar:${p.portal}`} onClick={() => atualizarAgora(p)} title={`Reenviar já ao ${p.nome} o que está na fila ou com erro`}>
                      {ocupado === `atualizar:${p.portal}` ? "…" : "↻ Atualizar"}
                      <span className="rounded-full bg-red-600 px-1.5 text-[10px] text-white tabular-nums">{p.pendentes}</span>
                    </button>
                  )}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const CORES_DO_PORTAL: Record<string, { sigla: string; classe: string }> = {
  WEBMOTORS: { sigla: "WM", classe: "bg-red-600 text-white" },
  NAPISTA: { sigla: "NP", classe: "bg-neutral-900 text-yellow-300" },
  OLX: { sigla: "OLX", classe: "bg-violet-600 text-white" },
  MOBIAUTO: { sigla: "MA", classe: "bg-sky-500 text-white" },
  MERCADO_LIVRE: { sigla: "ML", classe: "bg-yellow-300 text-blue-900" },
};

function SeloDoPortal({ portal, nome, conectado }: { portal: string; nome: string; conectado: boolean }) {
  const c = CORES_DO_PORTAL[portal] ?? { sigla: nome.slice(0, 2).toUpperCase(), classe: "bg-neutral-500 text-white" };
  return (
    <span className="flex flex-col items-center gap-0.5" title={`${nome}${conectado ? "" : " (desconectado)"}`}>
      <span className={`relative flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${c.classe}`}>
        {c.sigla}
        {!conectado && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-red-500" />}
      </span>
      <span className="text-[11px] font-medium text-neutral-700">{nome}</span>
    </span>
  );
}

/** Uma célula da grade, no jeito do AutoCerto: centrada, a cor diz o estado (verde no ar, vermelho com erro) e o texto é curto. */
function CelulaDoPortal({
  carro: c,
  portal: p,
  ocupado,
  aoAlternar,
  aoMudar,
  avisar,
  detalheNapista,
  aoConferirNapista,
}: {
  carro: CarroDaGrade;
  portal: Portal;
  ocupado: boolean;
  aoAlternar: (ligar: boolean) => void;
  aoMudar: () => void;
  avisar: (a: { texto: string; erro?: boolean }) => void;
  detalheNapista: DetalheNapista | "carregando" | undefined;
  aoConferirNapista: () => void;
}) {
  const [verErro, setVerErro] = useState(false);
  const a = c.anuncios[p.portal] ?? null;
  const podeMexer = p.conectado && c.status === "DISPONIVEL";
  const fundo = !a?.ativo ? "" : a.status === "ERRO" ? "bg-red-500/[0.07]" : a.status === "PUBLICADO" ? "bg-emerald-500/[0.07]" : "bg-amber-500/[0.06]";
  const tirar = podeMexer && a?.ativo && (
    <button type="button" disabled={ocupado} onClick={() => aoAlternar(false)} className="absolute right-1 top-1 rounded px-1 text-xs leading-none text-neutral-400 opacity-0 hover:bg-white hover:text-red-600 focus:opacity-100 group-hover:opacity-100" title={`Tirar do ${p.nome}`} aria-label={`Tirar ${c.nome} do ${p.nome}`}>
      ✕
    </button>
  );
  let conteudo: React.ReactNode;
  if (!a?.ativo) {
    conteudo = (
      <>
        <span className="text-xs text-neutral-400">Não publicado</span>
        {podeMexer && (
          <button type="button" disabled={ocupado} onClick={() => aoAlternar(true)} className="rounded-md border border-accent/40 px-2.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/5 disabled:opacity-50">
            {ocupado ? "…" : "+ Publicar"}
          </button>
        )}
      </>
    );
  } else if (a.status === "ERRO" || (a.erro && a.status !== "PUBLICADO")) {
    conteudo = (
      <>
        <span className="text-xs font-semibold text-red-600">{resumoDoErro(a.erro ?? "")}</span>
        <button type="button" onClick={() => setVerErro((v) => !v)} className="text-[11px] text-red-600/80 underline-offset-2 hover:underline">
          {verErro ? "fechar" : "ver detalhes"}
        </button>
        {verErro && <span className="max-w-[9rem] break-words text-left text-[11px] text-red-700">{a.erro}</span>}
      </>
    );
  } else if (a.status === "PUBLICADO") {
    conteudo = (
      <>
        {p.portal === "WEBMOTORS" ? <PlanoDoCarro carroId={c.id} plano={a.plano} aoMudar={aoMudar} avisar={avisar} /> : <span className="text-xs font-medium text-emerald-700">No ar</span>}
        {a.url ? (
          <a href={a.url} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent hover:underline">
            Ver anúncio
          </a>
        ) : p.portal === "NAPISTA" ? (
          <DetalheDoNapista detalhe={detalheNapista} aoConferir={aoConferirNapista} />
        ) : null}
      </>
    );
  } else {
    conteudo = (
      <>
        <span className="text-xs font-medium text-amber-700">{a.status === "REMOVENDO" ? "Saindo do ar" : "Enviando"}</span>
        <span className="text-[11px] text-neutral-400">em até 1 min</span>
      </>
    );
  }
  return (
    <td className={`relative w-36 min-w-[9rem] border-b border-l border-neutral-100 px-2 py-3 text-center align-middle ${fundo}`}>
      {tirar}
      <div className="flex flex-col items-center gap-1">{conteudo}</div>
    </td>
  );
}

function DetalheDoNapista({ detalhe, aoConferir }: { detalhe: DetalheNapista | "carregando" | undefined; aoConferir: () => void }) {
  if (!detalhe || detalhe === "carregando") {
    return (
      <button type="button" disabled={detalhe === "carregando"} onClick={aoConferir} className="text-xs text-accent hover:underline disabled:opacity-50">
        {detalhe === "carregando" ? "Conferindo…" : "Conferir no NaPista"}
      </button>
    );
  }
  if ("erro" in detalhe) return <span className="text-[11px] text-red-600">{detalhe.erro}</span>;
  if (detalhe.situacao !== "ok") return <span className="text-[11px] text-neutral-500">{detalhe.situacao === "sem-conta" ? "NaPista desconectado" : "Sem anúncio no NaPista"}</span>;
  const kmBaixo = detalhe.km !== null && detalhe.km < 500;
  return (
    <div className="flex flex-col gap-0.5 rounded-md bg-white/70 p-1.5 text-[11px] text-neutral-700">
      <span>
        No NaPista: <b>{detalhe.status ?? "?"}</b> · {detalhe.fotos} foto(s)
        {detalhe.km !== null && <span className={kmBaixo ? "font-semibold text-red-600" : ""}> · {detalhe.km.toLocaleString("pt-BR")} km</span>}
        {detalhe.preco !== null && <> · {centsToBRL(detalhe.preco * 100)}</>}
      </span>
      {kmBaixo && <span className="text-red-600">O anúncio está mostrando uma km baixa demais ao comprador. Corrija a km do carro.</span>}
      {detalhe.fotos === 0 && <span className="text-red-600">Sem fotos no NaPista: pode não aparecer na busca.</span>}
      {detalhe.enderecoPublico ? (
        <a href={detalhe.enderecoPublico} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Abrir o anúncio no NaPista
        </a>
      ) : (
        <span className="text-neutral-500">O NaPista não devolve o endereço público: procure pela placa {detalhe.placa ?? ""} em napista.com.br.</span>
      )}
      <span className="font-mono text-neutral-400" title="Código do anúncio na API do NaPista (não é o da página pública)">
        cód. {detalhe.codigo.slice(0, 8)}…
      </span>
      <details className="text-neutral-500">
        <summary className="cursor-pointer">Dados brutos do NaPista (diagnóstico)</summary>
        <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded bg-neutral-50 p-1.5 text-[10px]">{JSON.stringify(detalhe.diagnostico, null, 1)}</pre>
        <button type="button" className="mt-1 text-accent hover:underline" onClick={() => navigator.clipboard?.writeText(JSON.stringify(detalhe.diagnostico, null, 1)).catch(() => {})}>
          Copiar
        </button>
      </details>
    </div>
  );
}
