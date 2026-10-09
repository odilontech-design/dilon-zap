"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Avatar } from "@/components/avatar";
import { centsToBRL } from "@/lib/billing";
import { LISTING_INTERVAL } from "@/lib/polling";
import { IndicadoresFunil } from "./indicadores-funil";
import { NegociacaoDrawer } from "./negociacao-drawer";
import { NovaNegociacao } from "./nova-negociacao";
import { diasParada, fetcher, ROTULO_TAREFA, type FunilResumo, type Negociacao, type Quadro } from "./tipos";

type Aba = "ABERTA" | "GANHA" | "PERDIDA";
type Foco = "" | "atrasadas" | "sem-passo" | "paradas";
type Periodo = "todos" | "mes" | "mes-passado" | "30d" | "90d" | "custom";

const DIAS_PARADA = 14;

/** Período → [desde, ate] em ISO. Mês é o calendário, não "últimos 30 dias". */
function intervalo(p: Periodo, de: string, ate: string): { desde?: string; ate?: string } {
  const agora = new Date();
  const dia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  switch (p) {
    case "mes":
      return { desde: new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString() };
    case "mes-passado":
      return {
        desde: new Date(agora.getFullYear(), agora.getMonth() - 1, 1).toISOString(),
        ate: new Date(agora.getFullYear(), agora.getMonth(), 1, 0, 0, 0, -1).toISOString(),
      };
    case "30d":
    case "90d": {
      const d = dia(agora);
      d.setDate(d.getDate() - (p === "30d" ? 30 : 90));
      return { desde: d.toISOString() };
    }
    case "custom": {
      const r: { desde?: string; ate?: string } = {};
      if (de) r.desde = new Date(`${de}T00:00:00`).toISOString();
      // Fim do dia escolhido: a pessoa que escolhe "até 30/09" quer incluir o dia 30.
      if (ate) r.ate = new Date(`${ate}T23:59:59.999`).toISOString();
      return r;
    }
    default:
      return {};
  }
}

export function FunnelBoard({ podeGerir }: { podeGerir: boolean }) {
  const [funilId, setFuniId] = useState("");
  const [aba, setAba] = useState<Aba>("ABERTA");
  const [responsavel, setResponsavel] = useState("");
  const [origem, setOrigem] = useState("");
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [foco, setFoco] = useState<Foco>("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [criando, setCriando] = useState<{ etapaId?: string } | null>(null);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);

  // Colunas recolhidas e faixa de indicadores oculta ficam lembradas neste
  // navegador: quem recolhe "Financeiro" não quer recolher de novo a cada visita.
  const [recolhidas, setRecolhidas] = useState<string[]>([]);
  const [semIndicadores, setSemIndicadores] = useState(false);
  useEffect(() => {
    try {
      setRecolhidas(JSON.parse(localStorage.getItem("crm:recolhidas") ?? "[]"));
      setSemIndicadores(localStorage.getItem("crm:sem-indicadores") === "1");
    } catch {
      /* sem armazenamento: tudo expandido, sem prejuízo */
    }
  }, []);
  function guardarRecolhidas(novo: string[]) {
    try {
      localStorage.setItem("crm:recolhidas", JSON.stringify(novo));
    } catch {
      /* idem */
    }
  }
  function alternarColuna(id: string) {
    const novo = recolhidas.includes(id) ? recolhidas.filter((x) => x !== id) : [...recolhidas, id];
    setRecolhidas(novo);
    guardarRecolhidas(novo);
  }
  function recolherTodas(ids: string[], recolher: boolean) {
    const resto = recolhidas.filter((x) => !ids.includes(x));
    const novo = recolher ? [...resto, ...ids] : resto;
    setRecolhidas(novo);
    guardarRecolhidas(novo);
  }
  function alternarIndicadores() {
    const novo = !semIndicadores;
    setSemIndicadores(novo);
    try {
      localStorage.setItem("crm:sem-indicadores", novo ? "1" : "0");
    } catch {
      /* idem */
    }
  }

  const { data: funis } = useSWR<FunilResumo[]>("/api/funis", fetcher);

  const url = useMemo(() => {
    const q = new URLSearchParams();
    if (funilId) q.set("funilId", funilId);
    if (responsavel) q.set("responsavelId", responsavel);
    if (origem) q.set("origem", origem);
    if (busca.trim()) q.set("busca", busca.trim());
    const { desde, ate: fim } = intervalo(periodo, de, ate);
    if (desde) q.set("desde", desde);
    if (fim) q.set("ate", fim);
    return `/api/negociacoes?${q.toString()}`;
  }, [funilId, responsavel, origem, busca, periodo, de, ate]);

  const { data: quadro, mutate, error } = useSWR<Quadro>(url, fetcher, {
    refreshInterval: LISTING_INTERVAL,
    keepPreviousData: true,
  });

  const abertasTodas = (quadro?.negociacoes ?? []).filter((n) => n.status === "ABERTA");
  const contFoco = {
    atrasadas: abertasTodas.filter((n) => n.tarefasAtrasadas > 0).length,
    semPasso: abertasTodas.filter((n) => !n.proximaTarefa).length,
    paradas: abertasTodas.filter((n) => diasParada(n) > DIAS_PARADA).length,
  };

  const filtrosAtivos = !!(responsavel || origem || busca.trim() || periodo !== "todos");

  const porAba = useMemo(() => {
    const todas = quadro?.negociacoes ?? [];
    // O foco só recorta o que está em andamento: é onde dá pra agir.
    const doFoco = (n: Negociacao) =>
      foco === "atrasadas" ? n.tarefasAtrasadas > 0
      : foco === "sem-passo" ? !n.proximaTarefa
      : foco === "paradas" ? diasParada(n) > DIAS_PARADA
      : true;
    return {
      ABERTA: todas.filter((n) => n.status === "ABERTA" && doFoco(n)),
      GANHA: todas.filter((n) => n.status === "GANHA"),
      PERDIDA: todas.filter((n) => n.status === "PERDIDA"),
    };
  }, [quadro, foco]);

  async function mover(id: string, stageId: string) {
    const atual = quadro?.negociacoes.find((n) => n.id === id);
    if (!atual || atual.stageId === stageId || atual.status !== "ABERTA") return;

    // Otimista: o cartão muda de coluna na hora. Sem isso ele "volta" por um
    // instante até o servidor responder, e parece que o arrasto não pegou.
    await mutate(
      (q) =>
        q && {
          ...q,
          negociacoes: q.negociacoes.map((n) =>
            n.id === id ? { ...n, stageId, etapaDesde: new Date().toISOString() } : n
          ),
        },
      { revalidate: false }
    );

    const res = await fetch(`/api/negociacoes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "mover", stageId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(typeof body.error === "string" ? body.error : "não deu pra mover a negociação");
    }
    mutate();
  }

  async function novoFunil() {
    const nome = prompt("Nome do novo funil (ex: Parcerias, Pós-venda):")?.trim();
    if (!nome) return;
    const modelo = confirm("Começar com etapas prontas de vendas SaaS?\n\nOK = etapas prontas · Cancelar = funil vazio")
      ? "saas"
      : "vazio";
    const res = await fetch("/api/funis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, modelo }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return alert(typeof body.error === "string" ? body.error : "não deu pra criar o funil");
    setFuniId(body.id);
    setAba("ABERTA");
  }

  if (error) return <p className="text-sm text-red-600">Não deu pra carregar o funil.</p>;
  if (!quadro || !funis) return <p className="text-sm text-neutral-400">Carregando...</p>;

  const funilAtual = quadro.funil.id;
  const selecionadaObj = quadro.negociacoes.find((n) => n.id === selecionada) ?? null;
  const campo = "text-sm rounded-md border border-neutral-300 px-2 py-1.5 bg-surface";

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select value={funilAtual} onChange={(e) => setFuniId(e.target.value)} className={`${campo} font-medium`}>
          {funis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome} ({f.abertas})
            </option>
          ))}
        </select>
        {podeGerir && (
          <button onClick={novoFunil} className="text-xs text-accent hover:underline">
            + Novo funil
          </button>
        )}
        {podeGerir && (
          <Link href={`/etapas?funil=${funilAtual}`} className="text-xs text-neutral-500 hover:text-accent">
            Configurar etapas
          </Link>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setCriando({})}
          disabled={quadro.etapas.length === 0}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          + Nova negociação
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou título"
          className={`${campo} w-52`}
        />
        <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}>
          <option value="">Responsável: todos</option>
          <option value="sem">Sem responsável</option>
          {quadro.usuarios.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select value={origem} onChange={(e) => setOrigem(e.target.value)} className={campo}>
          <option value="">Origem: todas</option>
          {quadro.origens.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={campo} title="Período de criação da negociação">
          <option value="todos">Criadas: todo o período</option>
          <option value="mes">Este mês</option>
          <option value="mes-passado">Mês passado</option>
          <option value="30d">Últimos 30 dias</option>
          <option value="90d">Últimos 90 dias</option>
          <option value="custom">Personalizado…</option>
        </select>
        {periodo === "custom" && (
          <>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={campo} aria-label="De" />
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} aria-label="Até" />
          </>
        )}
        <select
          value={foco}
          onChange={(e) => {
            setFoco(e.target.value as Foco);
            if (e.target.value) setAba("ABERTA");
          }}
          className={campo}
          title="Recorta as negociações em andamento que precisam de atenção"
        >
          <option value="">Foco: tudo</option>
          <option value="atrasadas">Tarefa atrasada ({contFoco.atrasadas})</option>
          <option value="sem-passo">Sem próximo passo ({contFoco.semPasso})</option>
          <option value="paradas">Paradas há +{DIAS_PARADA} dias ({contFoco.paradas})</option>
        </select>
        {(filtrosAtivos || foco) && (
          <button
            onClick={() => {
              setResponsavel("");
              setOrigem("");
              setBusca("");
              setPeriodo("todos");
              setFoco("");
              setDe("");
              setAte("");
            }}
            className="text-xs text-accent hover:underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {!semIndicadores && <IndicadoresFunil ind={quadro.indicadores} motivos={quadro.motivos} />}

      <div className="flex gap-1 mb-3 border-b border-neutral-200">
        {(
          [
            ["ABERTA", "Em andamento"],
            ["GANHA", "Ganhas"],
            ["PERDIDA", "Perdidas"],
          ] as [Aba, string][]
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${
              aba === id ? "border-accent text-accent font-medium" : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {rotulo} <span className="text-xs tabular-nums text-neutral-400">{porAba[id].length}</span>
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-neutral-500 pb-2">
          {aba === "ABERTA" && quadro.etapas.length > 0 && (
            <>
              <button onClick={() => recolherTodas(quadro.etapas.map((e) => e.id), true)} className="hover:text-accent">
                Recolher colunas
              </button>
              <button onClick={() => recolherTodas(quadro.etapas.map((e) => e.id), false)} className="hover:text-accent">
                Expandir colunas
              </button>
            </>
          )}
          <button onClick={alternarIndicadores} className="hover:text-accent">
            {semIndicadores ? "Mostrar indicadores" : "Ocultar indicadores"}
          </button>
        </div>
      </div>

      {quadro.etapas.length === 0 && (
        <p className="text-sm text-neutral-500 rounded-lg border border-dashed border-neutral-300 px-4 py-6 mb-4">
          Este funil ainda não tem etapas.{" "}
          {podeGerir ? (
            <Link href={`/etapas?funil=${funilAtual}`} className="text-accent hover:underline">
              Configure as etapas
            </Link>
          ) : (
            "Peça ao responsável da conta para configurar."
          )}
        </p>
      )}

      {aba === "ABERTA" ? (
        // Altura presa à janela: a rolagem é de cada coluna, e a página não
        // cresce com o número de negociações. O desconto é o espaço do que fica
        // acima do quadro (filtros, abas e, se visível, os indicadores).
        <div
          className="flex gap-4 overflow-x-auto pb-2 items-stretch"
          style={{ height: semIndicadores ? "calc(100vh - 17rem)" : "calc(100vh - 25rem)", minHeight: "20rem" }}
        >
          {quadro.etapas.map((et) => {
            const cartoes = porAba.ABERTA.filter((n) => n.stageId === et.id);
            const total = cartoes.reduce((s, n) => s + n.valorCents, 0);
            const alvo = {
              onDragOver: (e: React.DragEvent) => {
                e.preventDefault();
                setSobre(et.id);
              },
              onDragLeave: () => setSobre((s) => (s === et.id ? null : s)),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault();
                setSobre(null);
                if (arrastando) mover(arrastando, et.id);
                setArrastando(null);
              },
            };

            // Coluna recolhida: tira estreita com a contagem e o nome na
            // vertical. Continua sendo alvo de arrastar.
            if (recolhidas.includes(et.id)) {
              return (
                <button
                  key={et.id}
                  onClick={() => alternarColuna(et.id)}
                  title={`Expandir ${et.nome}`}
                  {...alvo}
                  className={`w-11 shrink-0 h-full rounded-md border border-neutral-200 bg-neutral-50 flex flex-col items-center gap-3 py-3 hover:border-accent/60 ${sobre === et.id ? "outline outline-1 outline-dashed outline-accent" : ""}`}
                >
                  <span className="w-5 h-1.5 rounded-full" style={{ backgroundColor: et.cor }} />
                  <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 text-white" style={{ backgroundColor: et.cor }}>
                    {cartoes.length}
                  </span>
                  <span className="text-xs font-semibold text-neutral-700 whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>
                    {et.nome}
                  </span>
                </button>
              );
            }

            return (
              <div key={et.id} className="w-72 shrink-0 h-full flex flex-col min-h-0" {...alvo}>
                <div className="rounded-t-md h-1.5 shrink-0" style={{ backgroundColor: et.cor }} />
                <div className="border border-t-0 border-neutral-200 rounded-b-md bg-neutral-50 px-3 py-2.5 flex items-center justify-between gap-2 mb-2 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-neutral-800 truncate">{et.nome}</h3>
                    <p className="text-[10px] text-neutral-400 tabular-nums">{et.probabilidade}% de chance</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 text-white" style={{ backgroundColor: et.cor }}>
                      {cartoes.length}
                    </span>
                    <span className="text-[10px] rounded-full border border-neutral-300 px-1.5 py-0.5 text-neutral-500 tabular-nums">
                      {centsToBRL(total)}
                    </span>
                    <button
                      onClick={() => alternarColuna(et.id)}
                      title="Recolher coluna"
                      aria-label={`Recolher ${et.nome}`}
                      className="text-neutral-400 hover:text-accent text-sm leading-none px-0.5"
                    >
                      «
                    </button>
                  </div>
                </div>
                <div
                  className={`flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto pr-1 rounded-md ${sobre === et.id ? "bg-accent/5 outline outline-1 outline-dashed outline-accent" : ""}`}
                >
                  {cartoes.map((n) => (
                    <Cartao
                      key={n.id}
                      n={n}
                      onAbrir={() => setSelecionada(n.id)}
                      onArrastar={() => setArrastando(n.id)}
                      onSoltar={() => {
                        setArrastando(null);
                        setSobre(null);
                      }}
                    />
                  ))}
                  <button
                    onClick={() => setCriando({ etapaId: et.id })}
                    className="text-xs text-neutral-400 hover:text-accent rounded-md border border-dashed border-neutral-300 py-1.5 shrink-0"
                  >
                    + Adicionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <ListaEncerradas
          itens={porAba[aba]}
          aba={aba}
          etapas={quadro.etapas}
          motivos={quadro.motivos}
          onAbrir={(id) => setSelecionada(id)}
        />
      )}

      {selecionadaObj && (
        <NegociacaoDrawer
          key={selecionadaObj.id}
          negociacao={selecionadaObj}
          etapas={quadro.etapas}
          usuarios={quadro.usuarios}
          motivos={quadro.motivos}
          origens={quadro.origens}
          onFechar={() => setSelecionada(null)}
          onMudou={() => mutate()}
        />
      )}

      {criando && (
        <NovaNegociacao
          funilId={funilAtual}
          etapas={quadro.etapas}
          usuarios={quadro.usuarios}
          origens={quadro.origens}
          etapaInicial={criando.etapaId}
          onFechar={() => setCriando(null)}
          onCriada={() => {
            setCriando(null);
            setAba("ABERTA");
            mutate();
          }}
        />
      )}
    </div>
  );
}

function Cartao({
  n,
  onAbrir,
  onArrastar,
  onSoltar,
}: {
  n: Negociacao;
  onAbrir: () => void;
  onArrastar: () => void;
  onSoltar: () => void;
}) {
  const parada = diasParada(n);
  const atrasada = n.previsaoFechamento && new Date(n.previsaoFechamento).getTime() < Date.now();
  return (
    <div
      draggable
      onDragStart={onArrastar}
      onDragEnd={onSoltar}
      onClick={onAbrir}
      className="rounded-lg border border-neutral-200 bg-surface p-3 cursor-pointer hover:border-accent/60"
    >
      <p className="text-sm font-medium break-words mb-1.5">{n.titulo}</p>
      <div className="flex items-center gap-2 mb-2">
        <Avatar
          contact={{
            id: n.contato.id,
            name: n.contato.nome ?? n.contato.telefone,
            waJid: "",
            phoneNumber: n.contato.telefone,
            avatarUrl: n.contato.avatarUrl,
            lastStatusAt: null,
          }}
          size={20}
        />
        <p className="text-xs text-neutral-500 truncate">{n.contato.nome || n.contato.telefone || "Sem nome"}</p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tabular-nums">
          {centsToBRL(n.valorCents)}
          {n.valorMensalCents > 0 && n.valorMensalCents < n.valorCents ? (
            <span className="font-normal text-neutral-400"> · {centsToBRL(n.valorMensalCents)}/mês</span>
          ) : (
            n.recorrencia === "MENSAL" && <span className="font-normal text-neutral-400">/mês</span>
          )}
        </p>
        {n.responsavel && (
          <span className="text-[10px] rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-600 truncate max-w-[110px]">
            {n.responsavel.name}
          </span>
        )}
      </div>
      {n.proximaTarefa ? (
        <p
          className={`text-[11px] mt-2 truncate ${n.tarefasAtrasadas > 0 ? "text-red-600 font-medium" : "text-neutral-500"}`}
          title={n.proximaTarefa.titulo}
        >
          {ROTULO_TAREFA[n.proximaTarefa.tipo]} · {new Date(n.proximaTarefa.venceEm).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}{" "}
          · {n.proximaTarefa.titulo}
        </p>
      ) : (
        <p className="text-[11px] mt-2 text-amber-600">Sem próximo passo</p>
      )}
      {(parada > DIAS_PARADA || atrasada) && (
        <div className="flex flex-wrap gap-1 mt-2">
          {parada > DIAS_PARADA && (
            <span className="text-[10px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">parada há {parada} dias</span>
          )}
          {atrasada && <span className="text-[10px] rounded-full px-2 py-0.5 bg-red-100 text-red-700">previsão vencida</span>}
        </div>
      )}
    </div>
  );
}

function ListaEncerradas({
  itens,
  aba,
  etapas,
  motivos,
  onAbrir,
}: {
  itens: Negociacao[];
  aba: Aba;
  etapas: Quadro["etapas"];
  motivos: Quadro["motivos"];
  onAbrir: (id: string) => void;
}) {
  if (itens.length === 0) {
    return (
      <p className="text-sm text-neutral-400 py-8 text-center">
        {aba === "GANHA" ? "Nenhuma negociação ganha neste filtro." : "Nenhuma negociação perdida neste filtro."}
      </p>
    );
  }
  const nomeEtapa = new Map(etapas.map((e) => [e.id, e.nome]));
  const nomeMotivo = new Map(motivos.map((m) => [m.id, m.nome]));
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-4 py-2 font-medium">Negociação</th>
            <th className="text-left px-4 py-2 font-medium">Cliente</th>
            <th className="text-right px-4 py-2 font-medium">Valor</th>
            <th className="text-left px-4 py-2 font-medium">{aba === "PERDIDA" ? "Motivo" : "Etapa final"}</th>
            <th className="text-left px-4 py-2 font-medium">Responsável</th>
            <th className="text-left px-4 py-2 font-medium">Fechada em</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((n) => (
            <tr key={n.id} onClick={() => onAbrir(n.id)} className="border-t border-neutral-100 cursor-pointer hover:bg-neutral-50">
              <td className="px-4 py-2.5 font-medium">{n.titulo}</td>
              <td className="px-4 py-2.5 text-neutral-600">{n.contato.nome || n.contato.telefone || "—"}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">
                {centsToBRL(n.valorCents)}
                {n.recorrencia === "MENSAL" && <span className="text-neutral-400">/mês</span>}
              </td>
              <td className="px-4 py-2.5 text-neutral-600">
                {aba === "PERDIDA" ? (n.motivoPerdaId && nomeMotivo.get(n.motivoPerdaId)) || "—" : nomeEtapa.get(n.stageId) ?? "—"}
              </td>
              <td className="px-4 py-2.5 text-neutral-600">{n.responsavel?.name ?? "—"}</td>
              <td className="px-4 py-2.5 text-neutral-600 tabular-nums">
                {n.fechadaEm ? new Date(n.fechadaEm).toLocaleDateString("pt-BR") : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
