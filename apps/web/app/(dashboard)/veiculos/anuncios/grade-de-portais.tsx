"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { lerReais } from "@/lib/otica-regras";
import { classeDosDias, contagemPorFiltro, filtrarEOrdenar, FILTROS, ORDENS, type AnuncioDaGrade, type CarroDaGrade, type Filtro, type Ordem } from "@/lib/grade-portais-filtros";
import { lerKm } from "@/lib/veiculos-completar-km";
import { erroDaResposta, fetcher } from "../comum";
import { MenuDoVeiculo } from "./menu-do-veiculo";

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
/** Controles da barra de filtros: sem `w-full` (o `campo` da tela ocupa a linha inteira e empilhava tudo). */
const controle = "rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40";
const botaoPequeno = "rounded-md border border-neutral-300 px-2 py-1 text-xs hover:border-accent disabled:opacity-50";
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
    <div className="flex flex-col gap-3" data-testid="grade-de-portais">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          <span className="text-accent">{data.aVenda}</span> veículos à venda
        </h2>
        <button type="button" className={botaoPequeno} disabled={ocupado === "atualizar:todos" || pendentesTotal === 0} onClick={() => atualizarAgora(null)}>
          {ocupado === "atualizar:todos" ? "Atualizando…" : `Atualizar anúncios (${pendentesTotal})`}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Marca, modelo, versão ou placa" className={`${controle} min-w-[12rem] flex-1 sm:max-w-sm`} aria-label="Buscar carro" />
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
        <span className="ml-auto text-xs text-neutral-500">
          {carros.length} de {data.carros.length}
        </span>
      </div>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtros">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filtro === f.id}
            onClick={() => setFiltro(f.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${filtro === f.id ? "bg-accent/10 font-medium text-accent" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"}`}
          >
            {f.rotulo}
            {f.id !== "todos" && <span className={`ml-1.5 text-xs ${contagens[f.id] > 0 && f.id !== "reservados" ? "text-amber-700" : "text-neutral-400"}`}>{contagens[f.id]}</span>}
          </button>
        ))}
      </div>
      {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}

      <div className="max-h-[78vh] overflow-auto rounded-lg border border-neutral-200 bg-surface">
        <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[240px] border-b border-neutral-200 bg-surface px-3 py-2 text-left text-xs font-normal text-neutral-500">Veículo</th>
              {data.portais.map((p) => {
                const pct = data.aVenda > 0 ? Math.min(100, Math.round((p.publicados / data.aVenda) * 100)) : 0;
                return (
                  <th key={p.portal} className="sticky top-0 z-20 w-44 min-w-[11rem] border-b border-l border-neutral-200 bg-surface px-3 py-2 text-left align-top font-normal">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-neutral-900">{p.nome}</span>
                      <span title={p.conectado ? "Conectado" : "Desconectado"} className={`h-2 w-2 rounded-full ${p.conectado ? "bg-emerald-500" : "bg-red-500"}`} />
                    </div>
                    <p className="mt-0.5 text-xs text-neutral-600">
                      <b className="text-sm tabular-nums text-neutral-900">{p.publicados}</b>
                      <span className="tabular-nums">/{data.aVenda}</span> no ar
                      {p.comErro > 0 && <span className="text-red-600"> · {p.comErro} com erro</span>}
                    </p>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-label={`${p.nome}: ${p.publicados} de ${data.aVenda} no ar`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                    {p.conectado ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        <button className={botaoPequeno} disabled={p.fora === 0 || ocupado === `lote:${p.portal}`} onClick={() => publicarOsQueFaltam(p)} title="Publicar os carros à venda que ainda não estão neste portal">
                          {ocupado === `lote:${p.portal}` ? "Enviando…" : p.fora ? `+ Publicar ${p.fora}` : "Tudo publicado ✓"}
                        </button>
                        <button className={botaoPequeno} disabled={p.pendentes === 0 || ocupado === `atualizar:${p.portal}`} onClick={() => atualizarAgora(p)} title="Reenviar já o que está na fila ou com erro">
                          {ocupado === `atualizar:${p.portal}` ? "…" : `Atualizar ${p.pendentes}`}
                        </button>
                      </div>
                    ) : (
                      <Link href="/veiculos/portais" className="mt-1.5 inline-block text-xs text-accent hover:underline">
                        Reconectar
                      </Link>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {carros.map((c) => {
              const precoPortal = c.precoClassificadosCents ?? c.precoCents;
              return (
                <tr key={c.id} className="align-top">
                  <td className="sticky left-0 z-10 border-b border-neutral-100 bg-surface px-3 py-2.5">
                    <div className="flex gap-3">
                      <Link href={`/veiculos/${c.id}`} className="relative block h-[56px] w-20 shrink-0 overflow-hidden rounded-md bg-neutral-100 sm:h-[68px] sm:w-24" aria-label={`Abrir ${c.nome}`}>
                        {c.capaId ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/veiculos/fotos/${c.capaId}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-[11px] text-amber-700">sem foto</span>
                        )}
                        <span className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${CLASSE_DIAS[classeDosDias(c.dias)]}`}>{c.dias} dias</span>
                      </Link>
                      <div className="min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/veiculos/${c.id}`} className="font-medium leading-tight hover:text-accent">
                            {c.nome}
                          </Link>
                          <span className="flex shrink-0 items-center gap-1">
                            <Link href={`/veiculos/${c.id}`} className="rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] text-neutral-500 hover:border-accent hover:text-accent" title="Abrir a ficha do carro">
                              Editar
                            </Link>
                            <MenuDoVeiculo carro={c} portaisAtivos={data.portais.filter((p) => c.anuncios[p.portal]?.ativo).map((p) => ({ portal: p.portal, nome: p.nome }))} aoMudar={() => mutate()} avisar={setAviso} />
                          </span>
                        </div>
                        {c.versao && <p className="line-clamp-1 text-xs text-neutral-500">{c.versao}</p>}
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
                            {c.precoClassificadosCents === null && <span className="text-neutral-400"> (= site)</span>}
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
                      <td key={p.portal} className={`w-44 min-w-[11rem] max-w-[14rem] border-b border-l border-neutral-100 px-3 py-2.5 ${FUNDO_CELULA(a)}`}>
                        <div className="flex flex-col items-start gap-1">
                          {rot ? <span className={`rounded-full px-2 py-0.5 text-xs ${rot.classe}`}>{rot.texto}</span> : <span className="text-xs text-neutral-400">Não anunciado</span>}
                          {a?.ativo && a.erro && <ErroDoAnuncio erro={a.erro} />}
                          {a?.plano && a.ativo && <span className="text-[11px] text-neutral-500">plano {a.plano}</span>}
                          {p.portal === "NAPISTA" && a?.ativo && a.status === "PUBLICADO" && <DetalheDoNapista detalhe={detalhes[c.id]} aoConferir={() => conferirNoNapista(c)} />}
                          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
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
                <td colSpan={data.portais.length + 1} className="px-3 py-8 text-center text-sm text-neutral-500">
                  Nenhum carro com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-neutral-500">Mostrando {carros.length} de {data.carros.length} veículos. Clique no preço ou na km para corrigir ali mesmo. Disponível e anunciado: vai para o portal sozinho, a cada minuto. Mudou preço, km ou fotos: o anúncio atualiza. Vendeu ou reservou: sai do ar.</p>
    </div>
  );
}

/** O erro do portal numa linha só; clicar mostra o texto inteiro (os erros dos portais são longos e quebravam a tela). */
function ErroDoAnuncio({ erro }: { erro: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className="max-w-full text-[11px] text-red-600">
      <p className={`break-words ${aberto ? "" : "line-clamp-2"}`}>{erro}</p>
      {erro.length > 70 && (
        <button type="button" onClick={() => setAberto((v) => !v)} className="mt-0.5 underline">
          {aberto ? "ver menos" : "ver o erro completo"}
        </button>
      )}
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
