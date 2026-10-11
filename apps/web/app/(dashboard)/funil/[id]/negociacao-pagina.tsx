"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { centsToBRL } from "@/lib/billing";
import { Avatar } from "@/components/avatar";
import { ContactCard } from "@/components/contact-card";
import { SeloPendencia } from "@/components/selo-pendencia";
import { ItensNegociacao } from "../itens-negociacao";
import { TarefasNegociacao } from "../tarefas-negociacao";
import { ROTULO_RESULTADO, type ResultadoLigacao } from "../concluir-tarefa";
import {
  diasParada,
  fetcher,
  reaisParaCentavos,
  ROTULO_TAREFA,
  type Etapa,
  type Motivo,
  type Negociacao,
  type TipoTarefa,
  type Usuario,
} from "../tipos";

type Evento = {
  id: string;
  tipo: "CRIADA" | "ETAPA" | "GANHA" | "PERDIDA" | "REABERTA";
  deEtapaNome: string | null;
  paraEtapaNome: string | null;
  porNome: string | null;
  em: string;
};
type Nota = { id: string; texto: string; porUserId: string | null; porNome: string | null; em: string };
type Anexo = {
  id: string;
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
  porUserId: string | null;
  porNome: string | null;
  criadoEm: string;
};
type TarefaFeita = {
  id: string;
  tipo: TipoTarefa;
  titulo: string;
  concluidaEm: string | null;
  resultado: ResultadoLigacao | null;
  anotacao: string | null;
  responsavel: { name: string } | null;
};

type Pagina = {
  negociacao: Negociacao & {
    detalhePerda: string | null;
    contato: Negociacao["contato"] & { email: string | null; documento: string | null; endereco: string | null };
  };
  funil: { id: string; nome: string };
  etapas: Etapa[];
  usuarios: Usuario[];
  motivos: Motivo[];
  origens: string[];
  eventos: Evento[];
  notas: Nota[];
  anexos: Anexo[];
  pedidos: { id: string; numero: number; status: string; totalCents: number; pago: boolean }[];
  itens: number;
};

type Aba = "historico" | "tarefas" | "itens" | "arquivos";

const quando = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

function tamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function iconeArquivo(mime: string) {
  if (mime.startsWith("image/")) return "🖼️";
  if (mime === "application/pdf") return "📕";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv")) return "📊";
  if (mime.startsWith("video/")) return "🎬";
  if (mime.startsWith("audio/")) return "🎧";
  return "📄";
}

function descreverEvento(e: Evento): string {
  switch (e.tipo) {
    case "CRIADA":
      return `Negociação criada em ${e.paraEtapaNome ?? "—"}`;
    case "ETAPA":
      return `Mudou de etapa: ${e.deEtapaNome ?? "—"} → ${e.paraEtapaNome ?? "—"}`;
    case "GANHA":
      return "Marcada como ganha";
    case "PERDIDA":
      return "Marcada como perdida";
    case "REABERTA":
      return `Reaberta em ${e.paraEtapaNome ?? "—"}`;
  }
}

/**
 * Página da negociação, no molde do RD Station: régua de etapas no topo,
 * dados da negociação e do contato à esquerda, e à direita a linha do tempo
 * (anotações, mudanças de etapa, tarefas feitas, arquivos), tarefas,
 * produtos e arquivos.
 *
 * Mudança de etapa e de estado vão pelo PATCH com `acao`, que é o que grava o
 * histórico — nunca por campo solto.
 */
export function NegociacaoPagina({ id, userId, podeGerir }: { id: string; userId: string; podeGerir: boolean }) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<Pagina>(`/api/negociacoes/${id}`, fetcher);
  const { data: tarefas, mutate: recarregarTarefas } = useSWR<TarefaFeita[]>(`/api/negociacoes/${id}/tarefas`, fetcher);

  const [aba, setAba] = useState<Aba>("historico");
  const [fichaAberta, setFichaAberta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  if (error || (data && "error" in data)) {
    return (
      <div className="p-4 md:p-8">
        <Link href="/funil" className="text-sm text-accent hover:underline">
          ← CRM
        </Link>
        <p className="mt-4 text-sm text-red-600">Negociação não encontrada.</p>
      </div>
    );
  }
  if (!data) return <p className="p-8 text-sm text-neutral-400">Carregando...</p>;

  const n = data.negociacao;
  const aberta = n.status === "ABERTA";
  const parada = aberta ? diasParada(n) : 0;
  const etapaAtual = data.etapas.findIndex((e) => e.id === n.stageId);

  async function enviar(corpo: Record<string, unknown>): Promise<boolean> {
    setErro(null);
    setOcupado(true);
    try {
      const res = await fetch(`/api/negociacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(typeof body.error === "string" ? body.error : "não deu pra salvar");
        return false;
      }
      await mutate();
      return true;
    } finally {
      setOcupado(false);
    }
  }

  async function abrirConversa() {
    const res = await fetch(`/api/contacts/${n.contato.id}/start-conversation?assumir=0`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErro(typeof body.error === "string" ? body.error : "não deu pra abrir a conversa");
    }
    router.push(`/inbox?open=${(await res.json()).id}`);
  }

  async function apagar() {
    if (!confirm("Apagar esta negociação, o histórico, as anotações e os arquivos dela? Isso não pode ser desfeito.")) return;
    const res = await fetch(`/api/negociacoes/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setErro(typeof body.error === "string" ? body.error : "não deu pra apagar");
    }
    router.push(`/funil?funil=${data!.funil.id}`);
  }

  const abas: { id: Aba; rotulo: string }[] = [
    { id: "historico", rotulo: "Histórico" },
    { id: "tarefas", rotulo: "Tarefas" },
    { id: "itens", rotulo: `Produtos e serviços${data.itens ? ` (${data.itens})` : ""}` },
    { id: "arquivos", rotulo: `Arquivos${data.anexos.length ? ` (${data.anexos.length})` : ""}` },
  ];

  return (
    <div className="p-4 md:p-8 max-w-7xl">
      <Link href={`/funil?funil=${data.funil.id}`} className="text-sm text-accent hover:underline">
        ← {data.funil.nome}
      </Link>

      {/* Cabeçalho */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold break-words">{n.titulo}</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {n.contato.nome || n.contato.telefone || "Sem nome"} ·{" "}
            <span className="tabular-nums">
              {n.recorrencia === "MENSAL" ? `${centsToBRL(n.valorCents)} por mês` : centsToBRL(n.valorCents)}
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span
              className={`text-[11px] rounded-full px-2 py-0.5 ${
                n.status === "GANHA"
                  ? "bg-green-100 text-green-700"
                  : n.status === "PERDIDA"
                    ? "bg-red-100 text-red-700"
                    : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {n.status === "GANHA" ? "Ganha" : n.status === "PERDIDA" ? "Perdida" : "Em andamento"}
            </span>
            <SeloPendencia pendencia={n.contato.pendencia} />
            {parada > 14 && (
              <span className="text-[11px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">parada há {parada} dias</span>
            )}
          </div>
        </div>
        <Acoes
          n={n}
          motivos={data.motivos}
          ocupado={ocupado}
          enviar={enviar}
          abrirConversa={abrirConversa}
        />
      </div>

      {n.status === "PERDIDA" && (
        <p className="mt-3 text-sm text-neutral-600">
          Motivo da perda:{" "}
          <span className="font-medium">{data.motivos.find((m) => m.id === n.motivoPerdaId)?.nome ?? "—"}</span>
          {n.detalhePerda && <> — {n.detalhePerda}</>}
        </p>
      )}

      {/* Régua de etapas: clicar move a negociação. */}
      <div className="mt-5 flex gap-1 overflow-x-auto pb-1" role="list" aria-label="Etapas do funil">
        {data.etapas.map((et, i) => {
          const atual = i === etapaAtual;
          const passou = i < etapaAtual;
          return (
            <button
              key={et.id}
              role="listitem"
              disabled={!aberta || atual || ocupado}
              onClick={() => enviar({ acao: "mover", stageId: et.id })}
              title={aberta && !atual ? `Mover para ${et.nome}` : et.nome}
              className={`flex-1 min-w-[110px] px-3 py-2 text-xs font-medium truncate first:rounded-l-md last:rounded-r-md transition-colors ${
                atual
                  ? "bg-accent text-white"
                  : passou
                    ? "bg-accent/20 text-accent"
                    : "bg-neutral-100 text-neutral-500"
              } ${aberta && !atual ? "hover:bg-accent/40 hover:text-white" : ""} disabled:cursor-default`}
            >
              {et.nome}
            </button>
          );
        })}
      </div>

      {erro && <p className="mt-3 rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">{erro}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Coluna da esquerda: dados */}
        <div className="flex flex-col gap-4">
          <DadosNegociacao
            key={`${n.valorCents}-${n.recorrencia}-${data.itens}`}
            n={n}
            comItens={data.itens > 0}
            usuarios={data.usuarios}
            origens={data.origens}
            ocupado={ocupado}
            enviar={enviar}
          />

          <section className="rounded-lg border border-neutral-200 bg-surface p-4">
            <h2 className="text-sm font-semibold mb-3">Contato</h2>
            <div className="flex items-center gap-3">
              <Avatar
                contact={{
                  id: n.contato.id,
                  name: n.contato.nome ?? n.contato.telefone,
                  waJid: "",
                  phoneNumber: n.contato.telefone,
                  avatarUrl: n.contato.avatarUrl,
                  lastStatusAt: null,
                }}
                size={40}
              />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{n.contato.nome || "Sem nome"}</p>
                {n.contato.telefone && <p className="text-xs text-neutral-500">{n.contato.telefone}</p>}
              </div>
            </div>
            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              {n.contato.email && (
                <>
                  <dt className="text-neutral-500">E-mail</dt>
                  <dd className="truncate">{n.contato.email}</dd>
                </>
              )}
              {n.contato.documento && (
                <>
                  <dt className="text-neutral-500">CPF/CNPJ</dt>
                  <dd>{n.contato.documento}</dd>
                </>
              )}
              {n.contato.endereco && (
                <>
                  <dt className="text-neutral-500">Endereço</dt>
                  <dd>{n.contato.endereco}</dd>
                </>
              )}
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setFichaAberta(true)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">
                Ficha completa
              </button>
              <button onClick={abrirConversa} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50">
                Abrir conversa
              </button>
            </div>
          </section>

          {podeGerir && (
            <button onClick={apagar} className="self-start text-xs text-red-600 hover:underline">
              Apagar negociação
            </button>
          )}
        </div>

        {/* Coluna da direita: linha do tempo e abas */}
        <div className="min-w-0">
          <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto" role="tablist">
            {abas.map((a) => (
              <button
                key={a.id}
                role="tab"
                aria-selected={aba === a.id}
                onClick={() => setAba(a.id)}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
                  aba === a.id ? "border-accent text-accent font-medium" : "border-transparent text-neutral-500 hover:text-neutral-800"
                }`}
              >
                {a.rotulo}
              </button>
            ))}
          </div>

          <div className="pt-4">
            {aba === "historico" && (
              <Historico
                negociacaoId={id}
                userId={userId}
                podeGerir={podeGerir}
                eventos={data.eventos}
                notas={data.notas}
                anexos={data.anexos}
                tarefas={(tarefas ?? []).filter((t) => t.concluidaEm)}
                onMudou={() => mutate()}
                onAnexar={() => setAba("arquivos")}
              />
            )}
            {aba === "tarefas" && (
              <TarefasNegociacao
                negociacaoId={id}
                usuarios={data.usuarios}
                somenteLeitura={!aberta}
                onMudou={() => {
                  recarregarTarefas();
                  mutate();
                }}
              />
            )}
            {aba === "itens" && (
              <ItensNegociacao negociacaoId={id} editavel={aberta} pedidos={data.pedidos} onMudou={() => mutate()} />
            )}
            {aba === "arquivos" && (
              <Arquivos negociacaoId={id} userId={userId} podeGerir={podeGerir} anexos={data.anexos} onMudou={() => mutate()} />
            )}
          </div>
        </div>
      </div>

      {fichaAberta && (
        <ContactCard
          contactId={n.contato.id}
          onFechar={() => {
            setFichaAberta(false);
            mutate();
          }}
        />
      )}
    </div>
  );
}

function Acoes({
  n,
  motivos,
  ocupado,
  enviar,
  abrirConversa,
}: {
  n: Negociacao;
  motivos: Motivo[];
  ocupado: boolean;
  enviar: (corpo: Record<string, unknown>) => Promise<boolean>;
  abrirConversa: () => void;
}) {
  const [perdendo, setPerdendo] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [faltaMotivo, setFaltaMotivo] = useState(false);
  const aberta = n.status === "ABERTA";
  const campo = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm bg-surface";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2 justify-end">
        {aberta ? (
          <>
            <button
              onClick={() => enviar({ acao: "ganhar" })}
              disabled={ocupado}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Ganhou
            </button>
            <button
              onClick={() => setPerdendo((v) => !v)}
              disabled={ocupado}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Perdeu
            </button>
          </>
        ) : (
          <button
            onClick={() => enviar({ acao: "reabrir" })}
            disabled={ocupado}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
          >
            Reabrir
          </button>
        )}
        <button onClick={abrirConversa} className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50">
          Abrir conversa
        </button>
      </div>

      {perdendo && aberta && (
        <div className="w-full sm:w-80 rounded-md border border-red-200 bg-red-50/50 p-3 flex flex-col gap-2">
          <label className="text-xs font-medium text-neutral-700">Por que perdeu?</label>
          <select value={motivoId} onChange={(e) => setMotivoId(e.target.value)} className={campo}>
            <option value="">Escolha o motivo</option>
            {motivos
              .filter((m) => m.ativo)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
          </select>
          <textarea value={detalhe} onChange={(e) => setDetalhe(e.target.value)} placeholder="Detalhe (opcional)" rows={2} className={campo} />
          {faltaMotivo && <p className="text-xs text-red-600">Escolha o motivo da perda.</p>}
          <button
            onClick={async () => {
              if (!motivoId) return setFaltaMotivo(true);
              if (await enviar({ acao: "perder", motivoPerdaId: motivoId, detalhe: detalhe.trim() || null })) setPerdendo(false);
            }}
            disabled={ocupado}
            className="self-end rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Confirmar perda
          </button>
        </div>
      )}
    </div>
  );
}

function DadosNegociacao({
  n,
  comItens,
  usuarios,
  origens,
  ocupado,
  enviar,
}: {
  n: Negociacao;
  comItens: boolean;
  usuarios: Usuario[];
  origens: string[];
  ocupado: boolean;
  enviar: (corpo: Record<string, unknown>) => Promise<boolean>;
}) {
  const [titulo, setTitulo] = useState(n.titulo);
  const [valor, setValor] = useState((n.valorCents / 100).toFixed(2).replace(".", ","));
  const [recorrencia, setRecorrencia] = useState(n.recorrencia);
  const [responsavelId, setResponsavelId] = useState(n.responsavel?.id ?? "");
  const [origem, setOrigem] = useState(n.origem ?? "");
  const [previsao, setPrevisao] = useState(n.previsaoFechamento ? n.previsaoFechamento.slice(0, 10) : "");
  const [salvo, setSalvo] = useState(false);
  const [invalido, setInvalido] = useState(false);

  const mudou =
    titulo.trim() !== n.titulo ||
    valor !== (n.valorCents / 100).toFixed(2).replace(".", ",") ||
    recorrencia !== n.recorrencia ||
    responsavelId !== (n.responsavel?.id ?? "") ||
    origem.trim() !== (n.origem ?? "") ||
    previsao !== (n.previsaoFechamento ? n.previsaoFechamento.slice(0, 10) : "");

  async function salvar() {
    const valorCents = reaisParaCentavos(valor);
    if (valorCents === null || !titulo.trim()) return setInvalido(true);
    setInvalido(false);
    const ok = await enviar({
      titulo: titulo.trim(),
      ...(comItens ? {} : { valorCents, recorrencia }),
      responsavelId: responsavelId || null,
      origem: origem.trim() || null,
      previsaoFechamento: previsao ? new Date(`${previsao}T12:00:00Z`).toISOString() : null,
    });
    if (ok) {
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    }
  }

  const campo =
    "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent disabled:bg-neutral-50";
  const rotulo = "block text-xs font-medium text-neutral-700 mb-1";

  return (
    <section className="rounded-lg border border-neutral-200 bg-surface p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Negociação</h2>
      <div>
        <label className={rotulo}>Título</label>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={rotulo}>Valor (R$)</label>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            disabled={comItens}
            title={comItens ? "O valor vem dos produtos e serviços" : undefined}
            inputMode="decimal"
            className={`${campo} tabular-nums`}
          />
        </div>
        <div>
          <label className={rotulo}>Cobrança</label>
          <select
            value={recorrencia}
            onChange={(e) => setRecorrencia(e.target.value as "UNICA" | "MENSAL")}
            disabled={comItens}
            className={campo}
          >
            <option value="UNICA">Única</option>
            <option value="MENSAL">Mensal</option>
          </select>
        </div>
      </div>
      {comItens && <p className="text-[11px] text-neutral-500 -mt-1">Valor e cobrança vêm da aba Produtos e serviços.</p>}
      <div>
        <label className={rotulo}>Responsável</label>
        <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={campo}>
          <option value="">Ninguém</option>
          {usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={rotulo}>Previsão de fechamento</label>
          <input type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} className={campo} />
        </div>
        <div>
          <label className={rotulo}>Origem</label>
          <input value={origem} onChange={(e) => setOrigem(e.target.value)} list="origens-negociacao" className={campo} />
          <datalist id="origens-negociacao">
            {origens.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-1 text-[11px] text-neutral-500">
        <dt>Criada em</dt>
        <dd className="text-right">{quando(n.createdAt)}</dd>
        {n.fechadaEm && (
          <>
            <dt>Fechada em</dt>
            <dd className="text-right">{quando(n.fechadaEm)}</dd>
          </>
        )}
      </dl>
      {invalido && <p className="text-xs text-red-600">Confira o título e o valor.</p>}
      <button
        onClick={salvar}
        disabled={ocupado || !mudou}
        className="self-end rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {salvo ? "Salvo ✓" : "Salvar"}
      </button>
    </section>
  );
}

type ItemLinha =
  | { tipo: "nota"; em: string; nota: Nota }
  | { tipo: "evento"; em: string; evento: Evento }
  | { tipo: "anexo"; em: string; anexo: Anexo }
  | { tipo: "tarefa"; em: string; tarefa: TarefaFeita };

function Historico({
  negociacaoId,
  userId,
  podeGerir,
  eventos,
  notas,
  anexos,
  tarefas,
  onMudou,
  onAnexar,
}: {
  negociacaoId: string;
  userId: string;
  podeGerir: boolean;
  eventos: Evento[];
  notas: Nota[];
  anexos: Anexo[];
  tarefas: TarefaFeita[];
  onMudou: () => void;
  onAnexar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function anotar() {
    if (!texto.trim()) return;
    setErro(null);
    setEnviando(true);
    const res = await fetch(`/api/negociacoes/${negociacaoId}/notas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    setEnviando(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      return setErro(typeof b.error === "string" ? b.error : "não deu pra salvar a anotação");
    }
    setTexto("");
    onMudou();
  }

  async function apagarNota(nota: Nota) {
    if (!confirm("Apagar esta anotação?")) return;
    await fetch(`/api/negociacoes/${negociacaoId}/notas?nota=${nota.id}`, { method: "DELETE" });
    onMudou();
  }

  const linhas: ItemLinha[] = [
    ...notas.map((nota) => ({ tipo: "nota" as const, em: nota.em, nota })),
    ...eventos.map((evento) => ({ tipo: "evento" as const, em: evento.em, evento })),
    ...anexos.map((anexo) => ({ tipo: "anexo" as const, em: anexo.criadoEm, anexo })),
    ...tarefas.map((tarefa) => ({ tipo: "tarefa" as const, em: tarefa.concluidaEm!, tarefa })),
  ].sort((a, b) => b.em.localeCompare(a.em));

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-neutral-200 bg-surface p-3">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) anotar();
          }}
          rows={3}
          placeholder="Escreva uma anotação: o que o cliente disse, o que ficou combinado..."
          className="w-full resize-y rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {erro && <p className="text-xs text-red-600 mt-1">{erro}</p>}
        <div className="mt-2 flex items-center justify-between gap-2">
          <button onClick={onAnexar} className="text-xs text-neutral-600 hover:text-accent">
            📎 Anexar arquivo
          </button>
          <button
            onClick={anotar}
            disabled={enviando || !texto.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {enviando ? "Salvando..." : "Salvar anotação"}
          </button>
        </div>
      </div>

      <ol className="relative border-l border-neutral-200 ml-2 flex flex-col gap-4">
        {linhas.map((l) => (
          <li key={`${l.tipo}-${"nota" in l ? l.nota.id : "evento" in l ? l.evento.id : "anexo" in l ? l.anexo.id : l.tarefa.id}`} className="pl-5 relative">
            <span
              className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full ${
                l.tipo === "nota" ? "bg-accent" : l.tipo === "tarefa" ? "bg-green-500" : l.tipo === "anexo" ? "bg-sky-500" : "bg-neutral-300"
              }`}
              aria-hidden
            />
            {l.tipo === "nota" && (
              <div className="rounded-md border border-neutral-200 bg-surface px-3 py-2">
                <p className="text-sm whitespace-pre-wrap break-words">{l.nota.texto}</p>
                <p className="mt-1 text-[11px] text-neutral-400 flex items-center gap-2">
                  Anotação · {quando(l.nota.em)}
                  {l.nota.porNome && ` · ${l.nota.porNome}`}
                  {(l.nota.porUserId === userId || podeGerir) && (
                    <button onClick={() => apagarNota(l.nota)} className="hover:text-red-600">
                      apagar
                    </button>
                  )}
                </p>
              </div>
            )}
            {l.tipo === "evento" && (
              <div>
                <p className="text-sm text-neutral-700">{descreverEvento(l.evento)}</p>
                <p className="text-[11px] text-neutral-400">
                  {quando(l.evento.em)}
                  {l.evento.porNome && ` · ${l.evento.porNome}`}
                </p>
              </div>
            )}
            {l.tipo === "anexo" && (
              <div>
                <p className="text-sm text-neutral-700">
                  Anexou{" "}
                  <a href={`/api/negociacoes/${negociacaoId}/anexos?anexo=${l.anexo.id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {l.anexo.nome}
                  </a>
                </p>
                <p className="text-[11px] text-neutral-400">
                  {quando(l.anexo.criadoEm)}
                  {l.anexo.porNome && ` · ${l.anexo.porNome}`}
                </p>
              </div>
            )}
            {l.tipo === "tarefa" && (
              <div>
                <p className="text-sm text-neutral-700">
                  {ROTULO_TAREFA[l.tarefa.tipo]} feita: {l.tarefa.titulo}
                  {l.tarefa.resultado && <span className="text-neutral-500"> — {ROTULO_RESULTADO[l.tarefa.resultado]}</span>}
                </p>
                {l.tarefa.anotacao && <p className="text-xs text-neutral-600 whitespace-pre-wrap">{l.tarefa.anotacao}</p>}
                <p className="text-[11px] text-neutral-400">
                  {quando(l.tarefa.concluidaEm!)}
                  {l.tarefa.responsavel && ` · ${l.tarefa.responsavel.name}`}
                </p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Arquivos({
  negociacaoId,
  userId,
  podeGerir,
  anexos,
  onMudou,
}: {
  negociacaoId: string;
  userId: string;
  podeGerir: boolean;
  anexos: Anexo[];
  onMudou: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);

  async function enviar(files: FileList | File[]) {
    setErro(null);
    for (const file of Array.from(files)) {
      setEnviando((v) => v + 1);
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/negociacoes/${negociacaoId}/anexos`, { method: "POST", body: form });
      setEnviando((v) => v - 1);
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setErro(`${file.name}: ${typeof b.error === "string" ? b.error : "não deu pra enviar"}`);
      }
    }
    onMudou();
  }

  async function apagar(a: Anexo) {
    if (!confirm(`Apagar "${a.nome}"?`)) return;
    const res = await fetch(`/api/negociacoes/${negociacaoId}/anexos?anexo=${a.id}`, { method: "DELETE" });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setErro(typeof b.error === "string" ? b.error : "não deu pra apagar");
    }
    onMudou();
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (e.dataTransfer.files.length) enviar(e.dataTransfer.files);
        }}
        className={`rounded-lg border-2 border-dashed p-6 text-center text-sm ${
          arrastando ? "border-accent bg-accent/5" : "border-neutral-300"
        }`}
      >
        <p className="text-neutral-600">Arraste arquivos aqui (proposta, contrato, orçamento...)</p>
        <button
          onClick={() => input.current?.click()}
          disabled={enviando > 0}
          className="mt-2 rounded-md border border-neutral-300 bg-surface px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50"
        >
          {enviando > 0 ? "Enviando..." : "Escolher arquivos"}
        </button>
        <p className="mt-1 text-[11px] text-neutral-400">Até 20MB por arquivo.</p>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) enviar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}

      {anexos.length === 0 ? (
        <p className="text-sm text-neutral-400">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="rounded-lg border border-neutral-200 bg-surface divide-y divide-neutral-100">
          {anexos.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-lg" aria-hidden>
                {iconeArquivo(a.mimeType)}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/api/negociacoes/${negociacaoId}/anexos?anexo=${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-neutral-800 hover:text-accent truncate block"
                >
                  {a.nome}
                </a>
                <p className="text-[11px] text-neutral-400">
                  {tamanho(a.tamanhoBytes)} · {quando(a.criadoEm)}
                  {a.porNome && ` · ${a.porNome}`}
                </p>
              </div>
              <a href={`/api/negociacoes/${negociacaoId}/anexos?anexo=${a.id}&baixar=1`} className="text-xs text-neutral-600 hover:text-accent">
                Baixar
              </a>
              {(a.porUserId === userId || podeGerir) && (
                <button onClick={() => apagar(a)} className="text-xs text-neutral-400 hover:text-red-600">
                  Apagar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
