"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { lerReais } from "@/lib/otica-regras";
import { classeDosDias, contagemPorFiltro, filtrarEOrdenar, FILTROS, ORDENS, type AnuncioDaGrade, type CarroDaGrade, type Filtro, type Ordem } from "@/lib/grade-portais-filtros";
import { lerKm } from "@/lib/veiculos-completar-km";
import { botaoSecundario, campo, erroDaResposta, fetcher } from "../comum";

type Portal = { portal: string; nome: string; conectado: boolean; situacaoConta: string | null; publicados: number; naFila: number; comErro: number; pendentes: number; fora: number; foraSemKm: number };
type Grade = { portais: Portal[]; aVenda: number; carros: CarroDaGrade[] };
type DetalheNapista =
  | { situacao: "sem-anuncio" | "sem-conta" }
  | { situacao: "ok"; codigo: string; status: string | null; titulo: string | null; km: number | null; preco: number | null; placa: string | null; fotos: number; atualizadoEm: string | null; enderecoPublico: string | null; campos: string[]; diagnostico: unknown }
  | { erro: string };

const ROTULO: Record<string, { texto: string; classe: string }> = {
  PUBLICADO: { texto: "Publicado", classe: "bg-emerald-500/10 text-emerald-700" },
  FILA: { texto: "Na fila", classe: "bg-neutral-100 text-neutral-600" },
  ENVIADO: { texto: "Enviado", classe: "bg-amber-500/10 text-amber-700" },
  ERRO: { texto: "Com erro", classe: "bg-red-500/10 text-red-600" },
  REMOVENDO: { texto: "Saindo", classe: "bg-amber-500/10 text-amber-700" },
  REMOVIDO: { texto: "Removido", classe: "bg-neutral-100 text-neutral-500" },
};

const naFila = (a: AnuncioDaGrade | null) => !!a?.ativo && (a.status === "FILA" || a.status === "ENVIADO");
const CLASSE_DIAS = { normal: "bg-black/60 text-white", atencao: "bg-amber-500 text-white", parado: "bg-red-600 text-white" } as const;
const FUNDO_CELULA = (a: AnuncioDaGrade | null) => (a?.ativo && a.status === "ERRO" ? "bg-red-500/5" : a?.ativo && a.status === "PUBLICADO" ? "bg-emerald-500/5" : "");

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
        className={`${campo} w-28 py-0.5 text-sm`}
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

  return (
    <div className="flex flex-col gap-4" data-testid="grade-de-portais">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-neutral-600">Os anúncios são enviados sozinhos a cada minuto. Use o botão se quiser forçar agora o que está na fila ou com erro.</p>
        <button type="button" className={botaoSecundario} disabled={ocupado === "atualizar:todos" || !(data.portais.filter((p) => p.conectado).reduce((t, p) => t + p.pendentes, 0))} onClick={() => atualizarAgora(null)}>
          {ocupado === "atualizar:todos" ? "Atualizando…" : `Atualizar anúncios (${data.portais.filter((p) => p.conectado).reduce((t, p) => t + p.pendentes, 0)})`}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.portais.map((p) => {
          const pct = data.aVenda > 0 ? Math.min(100, Math.round((p.publicados / data.aVenda) * 100)) : 0;
          return (
            <div key={p.portal} className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-surface p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{p.nome}</h2>
                <span className={`rounded-full px-2 py-0.5 text-xs ${p.conectado ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-600"}`}>{p.conectado ? "Conectado" : "Desconectado"}</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">
                {p.publicados}
                <span className="text-sm font-normal text-neutral-500"> de {data.aVenda} no ar</span>
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label={`${p.nome}: ${p.publicados} de ${data.aVenda} carros à venda no ar`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-neutral-600">
                {p.naFila > 0 && <>{p.naFila} na fila · </>}
                {p.comErro > 0 ? <span className="text-red-600">{p.comErro} com erro</span> : "nenhum com erro"}
                {" · "}
                {p.fora} fora do portal
              </p>
              {p.conectado ? (
                <>
                  <button className={botaoSecundario} disabled={p.fora === 0 || ocupado === `lote:${p.portal}`} onClick={() => publicarOsQueFaltam(p)}>
                    {ocupado === `lote:${p.portal}` ? "Enviando…" : p.fora ? `Publicar os ${p.fora} que faltam` : "Tudo publicado ✓"}
                  </button>
                  <button className={botaoSecundario} disabled={p.pendentes === 0 || ocupado === `atualizar:${p.portal}`} onClick={() => atualizarAgora(p)}>
                    {ocupado === `atualizar:${p.portal}` ? "Atualizando…" : `Atualizar agora (${p.pendentes})`}
                  </button>
                </>
              ) : (
                <Link href="/veiculos/portais" className="text-xs text-accent hover:underline">
                  Reconectar em Portais
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, modelo, versão ou placa" className={`${campo} max-w-xs`} aria-label="Buscar carro" />
          <select value={portalFiltro} onChange={(e) => setPortalFiltro(e.target.value)} className={`${campo} w-auto`} aria-label="Portal do filtro">
            <option value="todos">Todos os portais</option>
            {data.portais.map((p) => (
              <option key={p.portal} value={p.portal}>
                {p.nome}
              </option>
            ))}
          </select>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)} className={`${campo} w-auto`} aria-label="Ordenar por">
            {ORDENS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-neutral-500">
            {carros.length} de {data.carros.length} carros
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filtro === f.id}
              onClick={() => setFiltro(f.id)}
              className={`rounded-md px-3 py-1.5 text-sm ${filtro === f.id ? "bg-neutral-100 font-semibold" : "text-neutral-500 hover:text-neutral-800"}`}
            >
              {f.rotulo}
              {f.id !== "todos" && <span className={`ml-1.5 text-xs ${contagens[f.id] > 0 && f.id !== "reservados" ? "text-amber-700" : "text-neutral-400"}`}>{contagens[f.id]}</span>}
            </button>
          ))}
        </div>
      </div>
      {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-normal">Carro</th>
              {data.portais.map((p) => (
                <th key={p.portal} className="w-40 px-3 py-2 font-normal">
                  {p.nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carros.map((c) => {
              const precoPortal = c.precoClassificadosCents ?? c.precoCents;
              return (
                <tr key={c.id} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2.5">
                    <div className="flex gap-3">
                      <Link href={`/veiculos/${c.id}`} className="relative block h-[68px] w-24 shrink-0 overflow-hidden rounded-md bg-neutral-100" aria-label={`Abrir ${c.nome}`}>
                        {c.capaId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/veiculos/fotos/${c.capaId}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[11px] text-amber-700">sem foto</span>
                        )}
                        <span className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${CLASSE_DIAS[classeDosDias(c.dias)]}`}>{c.dias} dias</span>
                      </Link>
                      <div className="min-w-0">
                        <Link href={`/veiculos/${c.id}`} className="font-medium hover:text-accent">
                          {c.nome}
                        </Link>
                        {c.versao && <p className="truncate text-xs text-neutral-500">{c.versao}</p>}
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          {c.placa && <span className="rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600">{c.placa}</span>}
                          {c.status === "RESERVADO" ? (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700">Reservado</span>
                          ) : c.naVitrine ? (
                            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700">Na vitrine</span>
                          ) : (
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">Fora da vitrine</span>
                          )}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-neutral-600">
                          <span>
                            Site{" "}
                            <Editavel rotulo="Preço do site" exibido={c.precoCents > 0 ? centsToBRL(c.precoCents) : "sem preço"} inicial={c.precoCents > 0 ? (c.precoCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""} aoSalvar={(t) => corrigir(c, "preco", t)} destaque={c.precoCents <= 0} />
                          </span>
                          <span>
                            Classificados <b className="font-semibold text-neutral-800">{precoPortal > 0 ? centsToBRL(precoPortal) : "—"}</b>
                            {c.precoClassificadosCents === null && <span className="text-neutral-400"> (igual ao site)</span>}
                          </span>
                          <span>
                            Km{" "}
                            <Editavel rotulo="Km" exibido={c.semKm ? "sem km" : `${c.km.toLocaleString("pt-BR")} km`} inicial={c.semKm ? "" : String(c.km)} aoSalvar={(t) => corrigir(c, "km", t)} destaque={c.semKm} />
                          </span>
                        </p>
                      </div>
                    </div>
                  </td>
                  {data.portais.map((p) => {
                    const a = c.anuncios[p.portal] ?? null;
                    const rot = a?.ativo ? ROTULO[a.status] : null;
                    const ocupadoAqui = ocupado === `${c.id}:${p.portal}`;
                    return (
                      <td key={p.portal} className={`px-3 py-2.5 ${FUNDO_CELULA(a)}`}>
                        <div className="flex flex-col items-start gap-1">
                          {rot ? <span className={`rounded-full px-2 py-0.5 text-xs ${rot.classe}`}>{rot.texto}</span> : <span className="text-xs text-neutral-400">Não anunciado</span>}
                          {a?.ativo && a.erro && (
                            <span className="line-clamp-3 text-[11px] text-red-600" title={a.erro}>
                              {a.erro}
                            </span>
                          )}
                          {a?.plano && a.ativo && <span className="text-[11px] text-neutral-500">plano {a.plano}</span>}
                          {p.portal === "NAPISTA" && a?.ativo && a.status === "PUBLICADO" && <DetalheDoNapista detalhe={detalhes[c.id]} aoConferir={() => conferirNoNapista(c)} />}
                          <span className="flex flex-wrap gap-2 text-xs">
                            {a?.url && a.status === "PUBLICADO" && a.ativo && (
                              <a href={a.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                                Ver anúncio
                              </a>
                            )}
                            {p.conectado && c.status === "DISPONIVEL" && (
                              <button type="button" disabled={ocupadoAqui} onClick={() => alternar(c, p, !a?.ativo)} className="text-neutral-500 hover:text-accent disabled:opacity-50">
                                {ocupadoAqui ? "…" : a?.ativo ? "Tirar" : "+ Publicar"}
                              </button>
                            )}
                            {naFila(a) && <span className="text-neutral-400">aguardando envio</span>}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {carros.length === 0 && (
              <tr>
                <td colSpan={data.portais.length + 1} className="px-3 py-6 text-center text-sm text-neutral-500">
                  Nenhum carro com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Clique no preço ou na km de um carro para corrigir ali mesmo. Disponível e anunciado: vai para o portal sozinho. Mudou preço, km ou fotos: o anúncio atualiza. Vendeu ou reservou: sai do ar. Carro sem quilometragem não sobe.</p>
    </div>
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
