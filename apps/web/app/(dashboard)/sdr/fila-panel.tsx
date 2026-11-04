"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { chamar, fetcher } from "../receber/formatos";
import { FichaDaEmpresa } from "./empresas-panel";
import { botaoPrimario, botaoSecundario, campoPequeno, COR_ETAPA, dataCurta, formatarTelefone, nomeDaEmpresa, ROTULO_CANAL, ROTULO_ETAPA, ROTULO_PRODUTO, type EtapaComercial } from "./formatos-sdr";

type Canal = "WHATSAPP" | "EMAIL";
type Campanha = { id: string; nome: string };
type Estado = "PRONTA" | "A_REVISAR" | "A_PREPARAR";

type ItemDaFila = {
  id: string;
  razaoSocial: string | null;
  nomeFantasia: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  email: string | null;
  estado: Estado;
  comercial: { prioridade: string; decisorNome: string | null };
  prospectos: { pontuacao: number | null }[];
};
type Resumo = {
  prontas: number;
  aRevisar: number;
  aPreparar: number;
  followupsAteHoje: number;
  contatosRegistradosHoje: number;
  whatsapp: { limiteDiario: number; intervaloMinimoSegundos: number; conversasAbertasHoje: number; restantesHoje: number };
};
type Rascunho = {
  abordagemId: string;
  canal: string;
  produto: string;
  assunto: string | null;
  texto: string;
  empresa: { id: string; nome: string; cidade: string | null; uf: string | null; segmento: string | null; telefone: string | null; email: string | null; decisorNome: string | null; prioridade: string; pontuacao: number | null };
};
type LinhaDoFunil = {
  campanhaId: string | null;
  nome: string;
  empresas: number;
  aRevisar: number;
  aprovadas: number;
  contatadas: number;
  responderam: number;
  interesse: number;
  reunioes: number;
  convertidas: number;
  encerradas: number;
  taxaDeResposta: number | null;
  horasAteAResposta: number | null;
};

const ROTULO_ESTADO: Record<Estado, string> = { PRONTA: "Pronta para contatar", A_REVISAR: "Aguardando sua revisão", A_PREPARAR: "Falta preparar a mensagem" };
const COR_ESTADO: Record<Estado, string> = { PRONTA: "bg-accent/10 text-accent", A_REVISAR: "bg-amber-100 text-amber-800", A_PREPARAR: "bg-neutral-100 text-neutral-600" };

const consulta = (p: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

/** A fila do dia: o que contatar, o que revisar, o que preparar. Nada aqui envia; quem envia é você, pelo Inbox. */
export function FilaPanel({ podeEscrever, campanhas }: { podeEscrever: boolean; campanhas: Campanha[] }) {
  const [campanhaId, setCampanhaId] = useState("");
  const [canal, setCanal] = useState<Canal>("WHATSAPP");
  const [meta, setMeta] = useState(20);
  const [produto, setProduto] = useState<"DILON_ZAP" | "DILON_FACILITIES">("DILON_ZAP");
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [revisando, setRevisando] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  // A meta é uma preferência de quem usa: lembra no navegador, sem depender dele.
  useEffect(() => {
    try {
      const salva = Number(localStorage.getItem("sdr-meta-diaria"));
      if (Number.isInteger(salva) && salva >= 1 && salva <= 50) setMeta(salva);
    } catch {
      /* sem armazenamento: usa o padrão */
    }
  }, []);
  const mudarMeta = (n: number) => {
    const v = Math.min(50, Math.max(1, Math.round(n) || 1));
    setMeta(v);
    try {
      localStorage.setItem("sdr-meta-diaria", String(v));
    } catch {
      /* ignora */
    }
  };

  const filtro = { campanhaId, canal };
  const resumo = useSWR<Resumo>(`/api/sdr/fila/resumo${consulta(filtro)}`, fetcher, { refreshInterval: 20_000, keepPreviousData: true });
  const fila = useSWR<{ itens: ItemDaFila[] }>(`/api/sdr/fila${consulta({ ...filtro, limite: meta })}`, fetcher, { refreshInterval: 20_000, keepPreviousData: true });
  const funil = useSWR<{ itens: LinhaDoFunil[] }>("/api/sdr/fila/funil", fetcher, { refreshInterval: 60_000, keepPreviousData: true });
  const recarregar = () => {
    resumo.mutate();
    fila.mutate();
    funil.mutate();
  };

  const itens = fila.data?.itens ?? [];
  const r = resumo.data;
  const aPrepararNaFila = itens.filter((i) => i.estado === "A_PREPARAR").length;

  async function preparar() {
    setOcupado(true);
    setAviso(null);
    const res = await chamar("/api/sdr/fila/preparar", "POST", { canal, produto, limite: meta, ...(campanhaId ? { campanhaId } : {}) });
    setOcupado(false);
    if (!res.ok) return setAviso({ tipo: "erro", texto: res.erro ?? "não deu pra preparar" });
    const d = res.dados as { criadas: number; jaTinham: number; semContato: number; falhas: { erro: string }[] };
    const partes = [`${d.criadas} mensagem(ns) preparada(s) como rascunho`];
    if (d.jaTinham) partes.push(`${d.jaTinham} já tinham`);
    if (d.semContato) partes.push(`${d.semContato} sem ${canal === "WHATSAPP" ? "telefone" : "e-mail"}`);
    if (d.falhas.length) partes.push(`${d.falhas.length} com problema (${d.falhas[0].erro})`);
    setAviso({ tipo: d.falhas.length ? "erro" : "ok", texto: `${partes.join(" · ")}. Nada foi aprovado nem enviado: revise antes.` });
    recarregar();
  }

  const limiteDoZap = r?.whatsapp;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-neutral-200 bg-surface p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-neutral-600">
            Campanha
            <select value={campanhaId} onChange={(e) => setCampanhaId(e.target.value)} className={`${campoPequeno} mt-1 block`}>
              <option value="">Todas</option>
              {campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-neutral-600">
            Canal
            <select value={canal} onChange={(e) => setCanal(e.target.value as Canal)} className={`${campoPequeno} mt-1 block`}>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">E-mail</option>
            </select>
          </label>
          <label className="text-xs text-neutral-600">
            Produto do modelo
            <select value={produto} onChange={(e) => setProduto(e.target.value as typeof produto)} className={`${campoPequeno} mt-1 block`}>
              <option value="DILON_ZAP">Dilon Zap</option>
              <option value="DILON_FACILITIES">Dilon Facilities</option>
            </select>
          </label>
          <label className="text-xs text-neutral-600">
            Meta do dia (empresas)
            <input type="number" min={1} max={50} value={meta} onChange={(e) => mudarMeta(Number(e.target.value))} className={`${campoPequeno} mt-1 block w-24`} />
          </label>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
          {[
            ["Prontas para contatar", r?.prontas],
            ["Aguardando revisão", r?.aRevisar],
            ["A preparar", r?.aPreparar],
            ["Follow-ups até hoje", r?.followupsAteHoje],
            ["Contatos registrados hoje", r?.contatosRegistradosHoje],
          ].map(([nome, valor]) => (
            <div key={String(nome)} className="rounded-md bg-neutral-50 px-2 py-2">
              <dd className="text-lg font-semibold tabular-nums">{valor ?? "—"}</dd>
              <dt className="text-[11px] text-neutral-500">{nome}</dt>
            </div>
          ))}
        </dl>
        {limiteDoZap && (
          <p className="mt-3 text-xs text-neutral-600">
            WhatsApp: {limiteDoZap.conversasAbertasHoje} de {limiteDoZap.limiteDiario} conversas novas abertas hoje (restam {limiteDoZap.restantesHoje}), com {limiteDoZap.intervaloMinimoSegundos} s de intervalo entre elas. O envio é sempre seu, um por clique, pelo Inbox.
            {limiteDoZap.restantesHoje === 0 && <span className="ml-1 font-medium text-amber-700">O limite de hoje foi atingido: continue amanhã.</span>}
          </p>
        )}

        {podeEscrever && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button onClick={preparar} disabled={ocupado || aPrepararNaFila === 0} className={botaoSecundario}>
              {ocupado ? "Preparando..." : `Preparar mensagens (${aPrepararNaFila})`}
            </button>
            <button onClick={() => setRevisando(true)} disabled={!r || r.aRevisar === 0} className={botaoPrimario}>
              Revisar rascunhos{r && r.aRevisar > 0 ? ` (${r.aRevisar})` : ""}
            </button>
            <span className="text-[11px] text-neutral-500">Preparar só cria rascunhos pelo modelo; nada é aprovado nem enviado sem você.</span>
          </div>
        )}
        {aviso && <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.tipo === "ok" ? "bg-accent/10 text-accent" : "bg-red-50 text-red-700"}`}>{aviso.texto}</p>}
      </section>

      <section className="rounded-lg border border-neutral-200 bg-surface">
        <header className="border-b border-neutral-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold">
            Fila do dia <span className="ml-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal tabular-nums text-neutral-600">{itens.length}</span>
          </h2>
          <p className="text-[11px] text-neutral-500">Primeiro as prontas, depois as que esperam revisão e as que faltam preparar, por prioridade e pontuação. Bloqueadas e já contatadas não entram.</p>
        </header>
        {fila.error ? (
          <p className="px-4 py-4 text-sm text-red-600">{(fila.error as Error).message}</p>
        ) : !fila.data ? (
          <p className="px-4 py-4 text-sm text-neutral-400">Carregando...</p>
        ) : itens.length === 0 ? (
          <p className="px-4 py-4 text-xs text-neutral-500">Nenhuma empresa disponível com {canal === "WHATSAPP" ? "telefone" : "e-mail"}. Importe uma lista na aba Importações ou troque o canal.</p>
        ) : (
          <ul>
            {itens.map((e) => (
              <li key={e.id} className="border-t border-neutral-100 first:border-t-0">
                <button onClick={() => setAberta(e.id)} className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-neutral-50">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{nomeDaEmpresa(e)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_ESTADO[e.estado]}`}>{ROTULO_ESTADO[e.estado]}</span>
                    {e.comercial.prioridade === "ALTA" && <span className="text-[11px] font-medium text-amber-700">prioridade alta</span>}
                    {e.prospectos[0]?.pontuacao != null && <span className="text-[11px] text-neutral-500">{e.prospectos[0].pontuacao} pts</span>}
                  </span>
                  <span className="text-[11px] text-neutral-500">
                    {[e.cidade, e.uf].filter(Boolean).join(" / ") || "sem local"} · {canal === "WHATSAPP" ? formatarTelefone(e.telefone) : e.email}
                    {e.comercial.decisorNome ? ` · ${e.comercial.decisorNome}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {podeEscrever && <ResultadosEmLote campanhaId={campanhaId} aoMudar={recarregar} abrirFicha={setAberta} />}
      <FunilDasCampanhas dados={funil.data?.itens} erro={funil.error as Error | undefined} />

      {revisando && <RevisaoSequencial canal={canal} campanhaId={campanhaId} limite={meta} onFechar={() => { setRevisando(false); recarregar(); }} />}
      {aberta && <FichaDaEmpresa id={aberta} podeEscrever={podeEscrever} aoMudar={recarregar} onFechar={() => { setAberta(null); recarregar(); }} />}
    </div>
  );
}

/* ------------------------------------------------------ Revisão sequencial ---- */

function RevisaoSequencial({ canal, campanhaId, limite, onFechar }: { canal: Canal; campanhaId: string; limite: number; onFechar: () => void }) {
  const { data, error, mutate } = useSWR<{ itens: Rascunho[] }>(`/api/sdr/fila/revisao${consulta({ canal, campanhaId, limite })}`, fetcher, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const [feitos, setFeitos] = useState<Record<string, "aprovada" | "rejeitada">>({});
  const [pulados, setPulados] = useState<string[]>([]);
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [assunto, setAssunto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const todos = data?.itens ?? [];
  const pendentes = todos.filter((i) => !feitos[i.abordagemId] && !pulados.includes(i.abordagemId));
  const atual = pendentes[0];
  const aprovadas = Object.values(feitos).filter((v) => v === "aprovada").length;
  const rejeitadas = Object.values(feitos).filter((v) => v === "rejeitada").length;

  useEffect(() => {
    setEditando(false);
    setErroAcao(null);
    setTexto(atual?.texto ?? "");
    setAssunto(atual?.assunto ?? "");
  }, [atual?.abordagemId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function aprovar() {
    if (!atual || ocupado) return;
    setOcupado(true);
    setErroAcao(null);
    const mudou = texto !== atual.texto || (atual.canal === "EMAIL" && (assunto || null) !== (atual.assunto ?? null));
    if (mudou) {
      const e = await chamar(`/api/sdr/abordagens/${atual.abordagemId}`, "PATCH", { texto, ...(atual.canal === "EMAIL" ? { assunto: assunto || null } : {}) });
      if (!e.ok) {
        setOcupado(false);
        return setErroAcao(e.erro ?? "não deu pra salvar a edição");
      }
    }
    const r = await chamar(`/api/sdr/abordagens/${atual.abordagemId}/aprovar`, "POST");
    setOcupado(false);
    if (!r.ok) return setErroAcao(r.erro ?? "não deu pra aprovar");
    setFeitos((f) => ({ ...f, [atual.abordagemId]: "aprovada" }));
  }
  async function rejeitar() {
    if (!atual || ocupado) return;
    if (!window.confirm("Rejeitar esta mensagem? Será preciso preparar outra para esta empresa.")) return;
    setOcupado(true);
    setErroAcao(null);
    const r = await chamar(`/api/sdr/abordagens/${atual.abordagemId}/rejeitar`, "POST");
    setOcupado(false);
    if (!r.ok) return setErroAcao(r.erro ?? "não deu pra rejeitar");
    setFeitos((f) => ({ ...f, [atual.abordagemId]: "rejeitada" }));
  }
  const pular = () => atual && setPulados((p) => [...p, atual.abordagemId]);

  // Atalhos só fora dos campos de texto: A aprova, E edita, P pula, R rejeita, Esc fecha.
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null;
      if (alvo && ["TEXTAREA", "INPUT", "SELECT"].includes(alvo.tagName)) return;
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const k = ev.key.toLowerCase();
      if (k === "a") aprovar();
      else if (k === "e") setEditando((v) => !v);
      else if (k === "p") pular();
      else if (k === "r") rejeitar();
      else if (k === "escape") onFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Revisão das mensagens">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Revisar mensagens</h2>
            <p className="text-xs text-neutral-500">
              {pendentes.length} restante(s) · {aprovadas} aprovada(s) · {rejeitadas} rejeitada(s) · {pulados.length} pulada(s)
            </p>
          </div>
          <button onClick={onFechar} className="text-sm text-neutral-500 hover:text-neutral-800">
            Fechar
          </button>
        </div>

        {error ? (
          <p className="mt-4 text-sm text-red-600">{(error as Error).message}</p>
        ) : !data ? (
          <p className="mt-4 text-sm text-neutral-400">Carregando...</p>
        ) : !atual ? (
          <div className="mt-4 rounded-md bg-neutral-50 px-4 py-6 text-sm text-neutral-700">
            <p className="font-medium">{todos.length === 0 ? "Não há rascunhos para revisar." : "Fim da revisão."}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {aprovadas > 0 ? `${aprovadas} mensagem(ns) aprovada(s): ficam prontas para contatar, uma por clique. ` : ""}
              {pulados.length > 0 ? "As puladas continuam aguardando revisão." : ""}
            </p>
            <div className="mt-3 flex gap-2">
              {pulados.length > 0 && (
                <button onClick={() => { setPulados([]); mutate(); }} className={botaoSecundario}>
                  Rever as puladas
                </button>
              )}
              <button onClick={onFechar} className={botaoPrimario}>
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="rounded-md bg-neutral-50 px-3 py-2">
              <p className="text-sm font-medium">{atual.empresa.nome}</p>
              <p className="text-xs text-neutral-500">
                {[atual.empresa.cidade, atual.empresa.uf].filter(Boolean).join(" / ") || "sem local"}
                {atual.empresa.segmento ? ` · ${atual.empresa.segmento}` : ""}
                {atual.empresa.decisorNome ? ` · ${atual.empresa.decisorNome}` : ""}
                {atual.empresa.pontuacao != null ? ` · ${atual.empresa.pontuacao} pts` : ""}
              </p>
              <p className="text-xs text-neutral-500">
                {ROTULO_CANAL[atual.canal]} · {ROTULO_PRODUTO[atual.produto] ?? atual.produto} ·{" "}
                {atual.canal === "EMAIL" ? atual.empresa.email : formatarTelefone(atual.empresa.telefone)}
              </p>
            </div>

            {editando ? (
              <div className="flex flex-col gap-2">
                {atual.canal === "EMAIL" && <input value={assunto} onChange={(e) => setAssunto(e.target.value)} placeholder="Assunto" aria-label="Assunto" className={`${campoPequeno} w-full`} />}
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={9} aria-label="Texto da mensagem" className={`${campoPequeno} w-full`} />
              </div>
            ) : (
              <div className="rounded-md border border-neutral-200 px-3 py-2 text-sm">
                {atual.assunto && <p className="mb-1 text-xs font-medium text-neutral-600">Assunto: {atual.assunto}</p>}
                <p className="whitespace-pre-wrap">{atual.texto}</p>
              </div>
            )}

            {erroAcao && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{erroAcao}</p>}

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={aprovar} disabled={ocupado || !texto.trim()} className={botaoPrimario}>
                {editando && (texto !== atual.texto || (atual.canal === "EMAIL" && (assunto || null) !== (atual.assunto ?? null))) ? "Salvar e aprovar" : "Aprovar"} <kbd className="ml-1 text-[10px] opacity-80">A</kbd>
              </button>
              <button onClick={() => setEditando((v) => !v)} disabled={ocupado} className={botaoSecundario}>
                {editando ? "Cancelar edição" : "Editar"} <kbd className="ml-1 text-[10px] text-neutral-500">E</kbd>
              </button>
              <button onClick={pular} disabled={ocupado} className={botaoSecundario}>
                Pular <kbd className="ml-1 text-[10px] text-neutral-500">P</kbd>
              </button>
              <button onClick={rejeitar} disabled={ocupado} className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 hover:border-red-400 disabled:opacity-50">
                Rejeitar <kbd className="ml-1 text-[10px] opacity-70">R</kbd>
              </button>
            </div>
            <p className="text-[11px] text-neutral-500">Aprovar não envia nada: só libera a mensagem para você contatar, um por clique, na ficha da empresa ou na fila.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Resultado em lote ---- */

type Contatada = { id: string; razaoSocial: string | null; nomeFantasia: string | null; cidade: string | null; uf: string | null; comercial: { etapa: EtapaComercial; ultimoContatoEm: string | null; proximaAcaoEm: string | null } };
const ETAPAS_LOTE: EtapaComercial[] = ["RESPONDEU", "INTERESSE", "INFO_SOLICITADA", "REUNIAO", "SEM_INTERESSE", "NAO_CONTATAR"];

function ResultadosEmLote({ campanhaId, aoMudar, abrirFicha }: { campanhaId: string; aoMudar: () => void; abrirFicha: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [pagina, setPagina] = useState(1);
  const { data, mutate } = useSWR<{ itens: Contatada[]; total: number; tamanho: number }>(
    aberto ? `/api/sdr/empresas${consulta({ visao: "contatadas", ordem: "acao", campanhaId, pagina })}` : null,
    fetcher,
    { keepPreviousData: true }
  );
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [etapa, setEtapa] = useState<EtapaComercial>("RESPONDEU");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const itens = data?.itens ?? [];
  const todasMarcadas = itens.length > 0 && itens.every((i) => marcadas.includes(i.id));

  async function aplicar() {
    if (!marcadas.length) return;
    const rotulo = ROTULO_ETAPA[etapa];
    const aviso_ = etapa === "NAO_CONTATAR" ? "\n\nAs empresas entram na lista de bloqueio e nunca mais serão abordadas." : "";
    if (!window.confirm(`Marcar ${marcadas.length} empresa(s) como “${rotulo}”?${aviso_}`)) return;
    setOcupado(true);
    setAviso(null);
    const r = await chamar("/api/sdr/fila/resultados", "POST", { empresaIds: marcadas, etapa, ...(nota.trim() ? { nota: nota.trim() } : {}) });
    setOcupado(false);
    if (!r.ok) return setAviso({ tipo: "erro", texto: r.erro ?? "não deu pra registrar" });
    const d = r.dados as { aplicadas: number; falhas: number; itens: { ok: boolean; erro?: string; crm?: { ok: boolean } }[] };
    const semCrm = d.itens.filter((i) => i.ok && i.crm && !i.crm.ok).length;
    const primeiroErro = d.itens.find((i) => !i.ok)?.erro;
    setAviso({
      tipo: d.falhas ? "erro" : "ok",
      texto: `${d.aplicadas} registrada(s)${d.falhas ? ` · ${d.falhas} não registrada(s) (${primeiroErro})` : ""}${semCrm ? ` · ${semCrm} sem negociação no CRM` : ""}.`,
    });
    setMarcadas([]);
    setNota("");
    mutate();
    aoMudar();
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-surface">
      <button onClick={() => setAberto((v) => !v)} aria-expanded={aberto} className="flex w-full items-center justify-between px-4 py-2.5 text-left">
        <span className="text-sm font-semibold">Registrar respostas em lote</span>
        <span className="text-xs text-neutral-500">{aberto ? "Recolher" : "Abrir"}</span>
      </button>
      {aberto && (
        <div className="border-t border-neutral-100 px-4 py-3">
          <p className="mb-2 text-[11px] text-neutral-500">Empresas contatadas que ainda aguardam resposta. Marque as que responderam do mesmo jeito e registre de uma vez; cada uma ganha o seu histórico.</p>
          {itens.length === 0 ? (
            <p className="text-xs text-neutral-500">{data ? "Nenhuma empresa aguardando resposta." : "Carregando..."}</p>
          ) : (
            <>
              <label className="mb-1 flex items-center gap-2 text-xs text-neutral-600">
                <input type="checkbox" checked={todasMarcadas} onChange={(e) => setMarcadas(e.target.checked ? itens.map((i) => i.id) : [])} />
                Marcar todas desta página
              </label>
              <ul className="max-h-72 overflow-y-auto rounded-md border border-neutral-100">
                {itens.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 border-t border-neutral-100 px-3 py-1.5 first:border-t-0">
                    <input type="checkbox" checked={marcadas.includes(e.id)} onChange={(ev) => setMarcadas((m) => (ev.target.checked ? [...m, e.id] : m.filter((x) => x !== e.id)))} aria-label={`Marcar ${nomeDaEmpresa(e)}`} />
                    <button onClick={() => abrirFicha(e.id)} className="flex-1 text-left text-sm hover:underline">
                      {nomeDaEmpresa(e)}
                    </button>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${COR_ETAPA[e.comercial.etapa]}`}>{ROTULO_ETAPA[e.comercial.etapa]}</span>
                    <span className="hidden text-[11px] text-neutral-500 sm:inline">contato em {dataCurta(e.comercial.ultimoContatoEm)}</span>
                  </li>
                ))}
              </ul>
              {data && data.total > data.tamanho && (
                <div className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                  <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className={botaoSecundario}>
                    Anterior
                  </button>
                  <span>
                    Página {pagina} de {Math.ceil(data.total / data.tamanho)}
                  </span>
                  <button disabled={pagina >= Math.ceil(data.total / data.tamanho)} onClick={() => setPagina((p) => p + 1)} className={botaoSecundario}>
                    Próxima
                  </button>
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs text-neutral-600">
                  Resultado
                  <select value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaComercial)} className={`${campoPequeno} mt-1 block`}>
                    {ETAPAS_LOTE.map((e) => (
                      <option key={e} value={e}>
                        {ROTULO_ETAPA[e]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-[12rem] flex-1 text-xs text-neutral-600">
                  Nota (opcional)
                  <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={2000} className={`${campoPequeno} mt-1 block w-full`} />
                </label>
                <button onClick={aplicar} disabled={ocupado || marcadas.length === 0} className={botaoPrimario}>
                  {ocupado ? "Registrando..." : `Registrar (${marcadas.length})`}
                </button>
              </div>
            </>
          )}
          {aviso && <p className={`mt-3 rounded-md px-3 py-2 text-xs ${aviso.tipo === "ok" ? "bg-accent/10 text-accent" : "bg-red-50 text-red-700"}`}>{aviso.texto}</p>}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------- Funil por campanha ---- */

function FunilDasCampanhas({ dados, erro }: { dados?: LinhaDoFunil[]; erro?: Error }) {
  const colunas = useMemo(
    () => [
      ["Empresas", "empresas"],
      ["A revisar", "aRevisar"],
      ["Aprovadas", "aprovadas"],
      ["Contatadas", "contatadas"],
      ["Responderam", "responderam"],
      ["Interesse", "interesse"],
      ["Reuniões", "reunioes"],
      ["No CRM", "convertidas"],
      ["Encerradas", "encerradas"],
    ] as const,
    []
  );
  return (
    <section className="rounded-lg border border-neutral-200 bg-surface">
      <header className="border-b border-neutral-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold">Funil por campanha</h2>
        <p className="text-[11px] text-neutral-500">“Contatadas” e “responderam” vêm do histórico, então não somem quando a empresa avança. Uma empresa em duas campanhas conta nas duas.</p>
      </header>
      {erro ? (
        <p className="px-4 py-4 text-sm text-red-600">{erro.message}</p>
      ) : !dados ? (
        <p className="px-4 py-4 text-sm text-neutral-400">Carregando...</p>
      ) : dados.length === 0 ? (
        <p className="px-4 py-4 text-xs text-neutral-500">Crie uma campanha e associe empresas para ver o funil.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-[11px] text-neutral-500">
                <th className="px-4 py-2 font-medium">Campanha</th>
                {colunas.map(([nome]) => (
                  <th key={nome} className="px-2 py-2 text-right font-medium">
                    {nome}
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Resposta</th>
                <th className="px-4 py-2 text-right font-medium">Tempo até responder</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((l) => (
                <tr key={l.campanhaId ?? "sem"} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{l.nome}</td>
                  {colunas.map(([nome, chave]) => (
                    <td key={nome} className="px-2 py-2 text-right tabular-nums">
                      {l[chave]}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums">{l.taxaDeResposta === null ? "—" : `${l.taxaDeResposta.toLocaleString("pt-BR")}%`}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{l.horasAteAResposta === null ? "—" : `${l.horasAteAResposta.toLocaleString("pt-BR")} h`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
