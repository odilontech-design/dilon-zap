"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { gerarParcelas } from "@dilon-zap/receivables";
import { SeloPendencia, type PendenciaResumo } from "@/components/selo-pendencia";
import { useTermoPedido } from "@/components/recursos-context";

/**
 * Painel do pedido — o mesmo dos dois lados.
 *
 * A consultora abre pela conversa e monta os itens; o financeiro abre pela
 * fila e fecha. É a MESMA tela porque é o mesmo pedido: duas telas
 * diferentes divergiriam, e o financeiro precisa ver exatamente o que foi
 * combinado, não uma versão resumida.
 *
 * O que muda por papel e por status é o que fica editável, não o layout.
 */

export type PedidoItem = {
  id?: string;
  productId: string | null;
  nomeProduto: string;
  precoTabelaCents: number;
  precoUnitCents: number;
  quantidade: number;
};

export type Pedido = {
  id: string;
  numero: number;
  status: "RASCUNHO" | "AGUARDANDO_FINANCEIRO" | "FECHADO" | "CANCELADO";
  paymentMethod: "PIX" | "PIX_PENDENTE" | "CARTAO" | "DINHEIRO" | "BOLETO" | "FIADO" | null;
  pago: boolean;
  subtotalCents: number;
  descontoCents: number;
  totalCents: number;
  observacao: string | null;
  mesReferencia?: string | null;
  // Plano combinado na negociação que gerou o pedido (sugestão para o fechamento).
  planoEntradaCents?: number | null;
  planoNumParcelas?: number | null;
  planoPeriodicidade?: "ENTRADA" | "UNICA" | "SEMANAL" | "QUINZENAL" | "MENSAL" | null;
  planoPrimeiroVencimento?: string | null;
  negociacaoId?: string | null;
  canceladoEm?: string | null;
  motivoCancelamento?: string | null;
  canceladoPorNome?: string | null;
  /** Cópia criada ao editar um pedido fechado. */
  refeitoDeNumero?: number | null;
  createdAt: string;
  fechadoEm: string | null;
  createdBy: { name: string } | null;
  closedBy: { name: string } | null;
  contact: {
    id: string;
    name: string | null;
    waJid: string;
    phoneNumber: string | null;
    documento?: string | null;
    nomeNoRecibo?: string | null;
  };
  conversation: { id: string; ticketNumber: number } | null;
  items: PedidoItem[];
};

type Produto = {
  id: string;
  name: string;
  priceCents: number;
  stockQty: number;
  isActive: boolean;
  tipo: "PRODUTO" | "SERVICO";
  duracaoMinutos: number | null;
  fotoKey?: string | null;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const tipo = res.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("sua sessão expirou — entre de novo");
  if (!res.ok) throw new Error("não foi possível carregar");
  return res.json();
};

export function centsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parseValor(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (!limpo) return 0;
  const temV = limpo.includes(",");
  const temP = limpo.includes(".");
  let n: string;
  if (temV && temP) n = limpo.replace(/\./g, "").replace(",", ".");
  else if (temV) n = limpo.replace(",", ".");
  else if (temP) n = (limpo.split(".").pop() ?? "").length === 3 ? limpo.replace(/\./g, "") : limpo;
  else n = limpo;
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return null;
  return Math.round(v * 100);
}

/** Daqui a n dias, no formato do <input type="date"> (dia de Brasília). */
function diaDaquiA(n: number): string {
  return new Date(Date.now() - 3 * 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);
}

const A_PRAZO = ["PIX_PENDENTE", "BOLETO", "FIADO"];

const STATUS_LABEL: Record<Pedido["status"], string> = {
  RASCUNHO: "Rascunho",
  AGUARDANDO_FINANCEIRO: "Aguardando financeiro",
  FECHADO: "Fechado",
  CANCELADO: "Cancelado",
};

const PAGAMENTO_LABEL: Record<NonNullable<Pedido["paymentMethod"]>, string> = {
  PIX: "PIX",
  PIX_PENDENTE: "PIX",
  CARTAO: "Cartão",
  DINHEIRO: "Dinheiro",
  BOLETO: "Boleto",
  FIADO: "Recorrente",
};

export function OrderPanel({
  pedido,
  ehFinanceiro,
  onFechar,
  onMudou,
}: {
  pedido: Pedido;
  ehFinanceiro: boolean;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const termo = useTermoPedido();
  // Cancelar (ou editar = cancelar e refazer) pede o motivo antes.
  const [cancelando, setCancelando] = useState<null | "cancelar" | "refazer">(null);
  const { data: produtos } = useSWR<Produto[]>("/api/products", fetcher);
  const fotoDe = useMemo(
    () => new Map((produtos ?? []).filter((p) => p.fotoKey).map((p) => [p.id, p.fotoKey!])),
    [produtos]
  );
  const [itens, setItens] = useState<PedidoItem[]>(pedido.items);
  const [observacao, setObservacao] = useState(pedido.observacao ?? "");
  const [mesReferencia, setMesReferencia] = useState(pedido.mesReferencia ?? "");
  const [desconto, setDesconto] = useState((pedido.descontoCents / 100).toFixed(2).replace(".", ","));
  const [pagamento, setPagamento] = useState<NonNullable<Pedido["paymentMethod"]>>(
    pedido.paymentMethod ?? "PIX"
  );
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // Total do pedido que acabou de ser fechado nesta tela. Enquanto existe, o
  // painel vira a confirmação com o botão de imprimir — é o momento em que o
  // financeiro precisa do recibo, com a cliente ainda no balcão.
  const [fechadoAgora, setFechadoAgora] = useState<number | null>(null);
  const [enviandoRecibo, setEnviandoRecibo] = useState(false);
  const [reciboEnviado, setReciboEnviado] = useState(false);
  const [confirmandoRecibo, setConfirmandoRecibo] = useState(false);
  // O mesmo envio serve ao recibo (pedido fechado) e ao orçamento (em montagem).
  const [envioDeOrcamento, setEnvioDeOrcamento] = useState(false);
  const [orcamentoEnviado, setOrcamentoEnviado] = useState(false);
  const [erroRecibo, setErroRecibo] = useState<string | null>(null);
  // Vem da ficha do contato: no primeiro recibo chega vazio e a pessoa digita;
  // do segundo em diante já vem preenchido.
  const [documento, setDocumento] = useState(pedido.contact.documento ?? "");
  // Começa vazio quando ninguém digitou ainda — de propósito. Preencher com o
  // nome do WhatsApp faria o apelido da agenda ("Paulo | PDUARTE") virar o
  // nome impresso só porque ninguém reparou no campo.
  const [nomeNoRecibo, setNomeNoRecibo] = useState(pedido.contact.nomeNoRecibo ?? "");

  // Quanto o cliente já deve em outras compras. A consultora vê ao montar; o
  // financeiro vê ao fechar — venda a prazo para quem deve fica bloqueada.
  const { data: pendencia } = useSWR<PendenciaResumo>(
    pedido.status === "FECHADO" || pedido.status === "CANCELADO" ? null : `/api/contacts/${pedido.contact.id}/pendencias?excluirPedido=${pedido.id}`,
    fetcher
  );

  // Venda a prazo: uma parcela com vencimento, ou entrada + parcelas.
  // Data combinada na negociação; se já passou, sugere daqui a 7 dias.
  const vencimentoCombinado =
    pedido.planoPrimeiroVencimento && pedido.planoPrimeiroVencimento.slice(0, 10) >= diaDaquiA(0)
      ? pedido.planoPrimeiroVencimento.slice(0, 10)
      : diaDaquiA(7);
  const [vencimento, setVencimento] = useState(vencimentoCombinado);
  const [parcelar, setParcelar] = useState(pagamento === "FIADO");
  const [entrada, setEntrada] = useState(
    pedido.planoEntradaCents ? (pedido.planoEntradaCents / 100).toFixed(2).replace(".", ",") : ""
  );
  // A entrada só vira recebimento quando o financeiro confirma que entrou, e
  // por qual forma (Believe, 23/10): antes vinha marcada como paga em dinheiro
  // e caía no caixa sozinha, mesmo em venda faturada que o cliente ia pagar depois.
  const [entradaPaga, setEntradaPaga] = useState(false);
  const [entradaMeio, setEntradaMeio] = useState<"" | "PIX" | "DINHEIRO" | "CARTAO">("");
  const [numParcelas, setNumParcelas] = useState(String(pedido.planoNumParcelas ?? 4));
  const [periodicidade, setPeriodicidade] = useState<"SEMANAL" | "QUINZENAL" | "MENSAL">(
    pedido.planoPeriodicidade === "QUINZENAL" || pedido.planoPeriodicidade === "MENSAL" ? pedido.planoPeriodicidade : "SEMANAL"
  );
  const [primeiroVencimento, setPrimeiroVencimento] = useState(vencimentoCombinado);
  const [podeLiberar, setPodeLiberar] = useState(false);

  const editavel = pedido.status === "RASCUNHO" || pedido.status === "AGUARDANDO_FINANCEIRO";
  const podeFechar = ehFinanceiro && pedido.status === "AGUARDANDO_FINANCEIRO";

  const subtotal = useMemo(
    () => itens.reduce((s, i) => s + i.precoUnitCents * i.quantidade, 0),
    [itens]
  );
  const descontoCents = parseValor(desconto) ?? 0;
  const total = Math.max(subtotal - Math.min(descontoCents, subtotal), 0);
  const aPrazo = A_PRAZO.includes(pagamento);
  const entradaCents = parseValor(entrada) ?? 0;

  const previaParcelas = useMemo(() => {
    if (!aPrazo || !parcelar || total <= 0) return { erro: null as string | null, linhas: [] as ReturnType<typeof gerarParcelas> };
    const n = Number(numParcelas);
    if (!Number.isInteger(n) || n < 1) return { erro: "informe o número de parcelas", linhas: [] };
    try {
      return {
        erro: null,
        linhas: gerarParcelas({
          totalCents: total,
          entradaCents,
          numParcelas: n,
          periodicidade,
          primeiroVencimento: new Date(`${primeiroVencimento}T12:00:00Z`),
          vencimentoEntrada: new Date(`${diaDaquiA(0)}T12:00:00Z`),
        }),
      };
    } catch (e) {
      return { erro: (e as Error).message, linhas: [] };
    }
  }, [aPrazo, parcelar, total, entradaCents, numParcelas, periodicidade, primeiroVencimento]);

  const sugestoes = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return (produtos ?? []).filter((p) => p.isActive && p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [produtos, busca]);

  function adicionar(p: Produto) {
    setBusca("");
    setItens((atual) => {
      // Mesmo produto duas vezes vira quantidade, não linha duplicada — é o
      // que a atendente espera ao clicar de novo, e evita pedido com o mesmo
      // item em três linhas por preços diferentes.
      const i = atual.findIndex((x) => x.productId === p.id);
      if (i >= 0) {
        const copia = [...atual];
        copia[i] = { ...copia[i], quantidade: copia[i].quantidade + 1 };
        return copia;
      }
      return [
        ...atual,
        {
          productId: p.id,
          nomeProduto: p.name,
          precoTabelaCents: p.priceCents,
          precoUnitCents: p.priceCents,
          quantidade: 1,
        },
      ];
    });
  }

  async function acao(corpo: Record<string, unknown>) {
    setErro(null);
    setOcupado(true);
    const res = await fetch(`/api/orders/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
    setOcupado(false);
    const b = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof b.error === "string" ? b.error : "não deu pra concluir");
      return null;
    }
    onMudou();
    return b;
  }

  async function enviarReciboWhatsApp() {
    setEnviandoRecibo(true);
    setErroRecibo(null);
    try {
      const res = await fetch(`/api/orders/${pedido.id}/recibo-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documento: documento.trim() || null,
          nomeNoRecibo: nomeNoRecibo.trim() || null,
          mesReferencia: mesReferencia.trim() || null,
          ...(envioDeOrcamento ? { orcamento: true } : {}),
        }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErroRecibo(typeof b.error === "string" ? b.error : "não deu pra enviar");
        return;
      }
      if (envioDeOrcamento) setOrcamentoEnviado(true);
      else setReciboEnviado(true);
      setConfirmandoRecibo(false);
      onMudou();
    } catch {
      setErroRecibo("não deu pra enviar o recibo — falha de conexão");
    } finally {
      setEnviandoRecibo(false);
    }
  }

  async function salvarItens() {
    return acao({ acao: "salvarItens", itens, observacao });
  }

  async function enviar() {
    if ((await salvarItens()) === null) return;
    if ((await acao({ acao: "enviarAoFinanceiro" })) !== null) onFechar();
  }

  async function fechar(liberarPendencia = false) {
    if (aPrazo && parcelar && previaParcelas.erro) return setErro(previaParcelas.erro);
    if (aPrazo && !parcelar && !vencimento) return setErro("informe quando o cliente vai pagar");
    if (aPrazo && parcelar && entradaCents > 0 && entradaPaga && !entradaMeio) return setErro("informe a forma de pagamento da entrada");
    if ((await salvarItens()) === null) return;

    setErro(null);
    setOcupado(true);
    const res = await fetch(`/api/orders/${pedido.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        acao: "fechar",
        paymentMethod: pagamento,
        descontoCents,
        observacao,
        mesReferencia,
        ...(aPrazo && !parcelar ? { vencimento: new Date(`${vencimento}T12:00:00Z`).toISOString() } : {}),
        ...(aPrazo && parcelar
          ? {
              parcelamento: {
                entradaCents,
                entradaPaga: entradaCents > 0 && entradaPaga,
                entradaMeio: entradaPaga && entradaMeio ? entradaMeio : undefined,
                numParcelas: Number(numParcelas),
                periodicidade,
                primeiroVencimento,
              },
            }
          : {}),
        ...(liberarPendencia ? { liberarPendencia: true } : {}),
      }),
    });
    setOcupado(false);
    const r = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(typeof r.error === "string" ? r.error : "não deu pra fechar");
      setPodeLiberar(res.status === 409 && r.podeLiberar === true);
      return;
    }
    setPodeLiberar(false);
    onMudou();
    if (r.jaEstavaFechado) setErro(`Esse ${termo.minusculo} já tinha sido fechado — nada foi baixado de novo.`);
    else setFechadoAgora(typeof r.total === "number" ? r.total : total);
  }

  if (fechadoAgora !== null) {
    return (
      <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="bg-surface rounded-lg border border-neutral-200 w-full max-w-sm p-6 text-center"
        >
          <p className="text-sm text-neutral-500">{termo.singular} #{pedido.numero} fechado</p>
          <p className="text-2xl font-semibold tabular-nums mt-1">{centsToBRL(fechadoAgora)}</p>
          <p className="text-sm text-neutral-600 mt-1">
            {PAGAMENTO_LABEL[pagamento]} · {pagamento === "PIX" || pagamento === "CARTAO" || pagamento === "DINHEIRO" ? "pago" : "a receber"}
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <a
              href={`/recibo/${pedido.id}`}
              target="_blank"
              rel="noopener"
              className="rounded-md bg-accent text-white px-4 py-2 font-medium"
            >
              Imprimir recibo
            </a>
            <button
              onClick={() => {
                setEnvioDeOrcamento(false);
                setConfirmandoRecibo(true);
              }}
              disabled={reciboEnviado}
              className="rounded-md border border-neutral-300 px-4 py-2 disabled:opacity-50"
            >
              {reciboEnviado ? "✓ Enviado ao cliente" : "Enviar ao cliente"}
            </button>
            <button onClick={onFechar} className="rounded-md border border-neutral-300 px-4 py-2">
              Concluir
            </button>
          </div>

          {confirmandoRecibo && (
            <ConfirmarEnvioDoRecibo
              pedidoId={pedido.id}
              nomeCliente={pedido.contact.name ?? pedido.contact.phoneNumber ?? "o cliente"}
              documento={documento}
              setDocumento={setDocumento}
              nomeNoRecibo={nomeNoRecibo}
              setNomeNoRecibo={setNomeNoRecibo}
              mesReferencia={mesReferencia}
              setMesReferencia={setMesReferencia}
              enviando={enviandoRecibo}
              erro={erroRecibo}
              onEnviar={enviarReciboWhatsApp}
              onCancelar={() => setConfirmandoRecibo(false)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 grid place-items-center z-50 p-4" onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 w-full max-w-2xl max-h-[92vh] flex flex-col"
      >
        <header className="p-5 border-b border-neutral-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">
              {termo.singular} #{pedido.numero}
              <span className="ml-2 text-xs font-normal rounded-full bg-neutral-100 text-neutral-600 px-2 py-0.5">
                {STATUS_LABEL[pedido.status]}
              </span>
              {pedido.status === "FECHADO" && !pedido.pago && (
                <span className="ml-1 text-xs font-normal rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
                  a receber
                </span>
              )}
            </h2>
            {pedido.refeitoDeNumero && (
              <p className="text-xs text-accent mt-0.5">Refeito do {termo.minusculo} #{pedido.refeitoDeNumero}, que foi cancelado</p>
            )}
            <p className="text-sm text-neutral-500 mt-0.5">
              {pedido.contact.name ?? pedido.contact.phoneNumber ?? "Cliente"}
              {pedido.createdBy && ` · aberto por ${pedido.createdBy.name}`}
              {pedido.closedBy && ` · fechado por ${pedido.closedBy.name}`}
            </p>
          </div>
          <button onClick={onFechar} className="text-neutral-400 hover:text-neutral-700 text-xl leading-none">
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-5 flex flex-col gap-4">
          {erro && (
            <div className="rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm flex flex-col gap-2">
              <p>{erro}</p>
              {podeLiberar && (
                <button
                  onClick={() => fechar(true)}
                  disabled={ocupado}
                  className="self-start rounded-md border border-red-400 px-3 py-1 text-xs font-medium hover:bg-red-100 disabled:opacity-50"
                >
                  Liberar e fechar mesmo assim
                </button>
              )}
            </div>
          )}

          {pendencia && pendencia.saldoCents > 0 && editavel && (
            <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
              <SeloPendencia pendencia={pendencia} />
              <span>Cliente com parcelas em aberto: venda a prazo (recorrente, boleto, PIX a pagar) fica bloqueada. Pago na hora pode.</span>
            </div>
          )}

          {editavel && (
            <div className="relative">
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar produto para adicionar..."
                className="w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm"
              />
              {sugestoes.length > 0 && (
                <div className="absolute z-10 left-0 right-0 mt-1 rounded-md border border-neutral-200 bg-surface shadow-lg">
                  {sugestoes.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => adicionar(p)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 flex items-center justify-between gap-3"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        {p.fotoKey ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`/api/products/${p.id}/foto?v=${encodeURIComponent(p.fotoKey)}`}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded object-cover border border-neutral-200"
                          />
                        ) : (
                          <span className="h-8 w-8 shrink-0 rounded bg-neutral-100" />
                        )}
                        <span className="truncate">{p.name}</span>
                      </span>
                      <span className="shrink-0 text-neutral-500 tabular-nums">
                        {centsToBRL(p.priceCents)}
                        {/* Avisa mas deixa vender, conforme decidido. */}
                        {/* "sem estoque" so vale pra produto. Num servico o
                            aviso seria falso e travaria a venda sem motivo. */}
                        {p.tipo === "SERVICO"
                          ? p.duracaoMinutos && (
                              <span className="ml-2 text-neutral-400">{p.duracaoMinutos} min</span>
                            )
                          : p.stockQty <= 0 && <span className="ml-2 text-red-600">sem estoque</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {itens.length === 0 && <p className="text-sm text-neutral-500">Nenhum item ainda.</p>}

          {itens.map((item, idx) => {
            const comDesconto = item.precoUnitCents < item.precoTabelaCents;
            // Foto do catálogo ao lado do item: quem separa o pedido confere
            // pela imagem, não só pelo nome (pedido da Believe).
            const fotoKey = item.productId ? fotoDe.get(item.productId) : null;
            return (
              <div key={idx} className="flex items-center gap-2 text-sm border-b border-neutral-200 pb-2">
                {fotoKey ? (
                  <a
                    href={`/api/products/${item.productId}/foto?v=${encodeURIComponent(fotoKey)}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Ver foto ampliada"
                    className="shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/products/${item.productId}/foto?v=${encodeURIComponent(fotoKey)}`}
                      alt=""
                      className="h-10 w-10 rounded-md object-cover border border-neutral-200"
                    />
                  </a>
                ) : (
                  <span className="h-10 w-10 shrink-0 rounded-md bg-neutral-100" aria-hidden />
                )}
                <span className="flex-1 min-w-0 truncate">{item.nomeProduto}</span>

                <input
                  value={item.quantidade}
                  disabled={!editavel}
                  onChange={(e) => {
                    const q = parseInt(e.target.value, 10);
                    setItens((a) =>
                      a.map((x, i) => (i === idx ? { ...x, quantidade: Number.isFinite(q) && q > 0 ? q : 1 } : x))
                    );
                  }}
                  inputMode="numeric"
                  className="w-14 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-center tabular-nums disabled:opacity-60"
                />

                <div className="w-28">
                  <input
                    value={(item.precoUnitCents / 100).toFixed(2).replace(".", ",")}
                    // Alterar preço é do financeiro. A consultora monta com o
                    // preço de tabela; quem negocia valor é quem fecha.
                    disabled={!editavel || !ehFinanceiro}
                    onChange={(e) => {
                      const v = parseValor(e.target.value);
                      if (v === null) return;
                      setItens((a) => a.map((x, i) => (i === idx ? { ...x, precoUnitCents: v } : x)));
                    }}
                    inputMode="decimal"
                    className="w-full rounded-md border border-neutral-300 bg-surface px-2 py-1 text-right tabular-nums disabled:opacity-60"
                  />
                  {comDesconto && (
                    <p className="text-[10px] text-neutral-400 text-right line-through tabular-nums">
                      {centsToBRL(item.precoTabelaCents)}
                    </p>
                  )}
                </div>

                <span className="w-24 text-right tabular-nums font-medium">
                  {centsToBRL(item.precoUnitCents * item.quantidade)}
                </span>

                {editavel && (
                  <button
                    onClick={() => setItens((a) => a.filter((_, i) => i !== idx))}
                    className="text-red-600 hover:text-red-700 px-1"
                    aria-label="Remover item"
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <div className="flex flex-col gap-1.5 text-sm border-t border-neutral-200 pt-3">
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{centsToBRL(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-neutral-600">
              <span>Desconto</span>
              <input
                value={desconto}
                disabled={!podeFechar}
                onChange={(e) => setDesconto(e.target.value)}
                inputMode="decimal"
                className="w-28 rounded-md border border-neutral-300 bg-surface px-2 py-1 text-right tabular-nums disabled:opacity-60"
              />
            </div>
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="tabular-nums">{centsToBRL(total)}</span>
            </div>
          </div>

          <label className="text-sm">
            <span className="text-xs font-medium text-neutral-700">Observação</span>
            <textarea
              value={observacao}
              disabled={!editavel}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Entrega, prazo, combinado com a cliente..."
              className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 resize-y disabled:opacity-60"
            />
          </label>

          {podeFechar && (
            <label className="text-sm">
              <span className="text-xs font-medium text-neutral-700">Mês de referência</span>
              <input
                value={mesReferencia}
                onChange={(e) => setMesReferencia(e.target.value)}
                maxLength={60}
                placeholder="Setembro/2026"
                className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
              />
              <span className="text-xs text-neutral-500">
                Entra no texto do recibo onde você escrever {"{mes}"}. Pode deixar em branco.
              </span>
            </label>
          )}

          {podeFechar && (
            <label className="text-sm">
              <span className="text-xs font-medium text-neutral-700">Forma de pagamento</span>
              <select
                value={pagamento}
                onChange={(e) => {
                  const meio = e.target.value as typeof pagamento;
                  setPagamento(meio);
                  // Recorrente é, por definição, entrada + parcelas; boleto e PIX a pagar costumam ser uma só.
                  setParcelar(meio === "FIADO");
                }}
                className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
              >
                <option value="PIX">PIX — já pago</option>
                <option value="PIX_PENDENTE">PIX — a pagar (manda a chave no recibo)</option>
                <option value="CARTAO">Cartão na maquininha — já pago</option>
                <option value="DINHEIRO">Dinheiro — já pago</option>
                <option value="BOLETO">Boleto — a receber</option>
                <option value="FIADO">Recorrente — a receber em parcelas</option>
              </select>
            </label>
          )}

          {podeFechar && aPrazo && (
            <div className="rounded-md border border-neutral-200 p-3 flex flex-col gap-3 text-sm">
              {pedido.negociacaoId && (pedido.planoNumParcelas || pedido.planoPrimeiroVencimento) && (
                <p className="text-xs rounded-md bg-accent/10 text-accent px-2 py-1">
                  Condição combinada na negociação — confira antes de fechar.
                </p>
              )}
              <div className="flex gap-4">
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={!parcelar} onChange={() => setParcelar(false)} />
                  Uma parcela
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" checked={parcelar} onChange={() => setParcelar(true)} />
                  Entrada + parcelas
                </label>
              </div>

              {!parcelar ? (
                <label>
                  <span className="text-xs font-medium text-neutral-700">Vence em</span>
                  <input
                    type="date"
                    value={vencimento}
                    onChange={(e) => setVencimento(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
                  />
                </label>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <label>
                      <span className="text-xs font-medium text-neutral-700">Entrada (R$)</span>
                      <input value={entrada} onChange={(e) => setEntrada(e.target.value)} inputMode="decimal" placeholder="0,00" className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5 tabular-nums" />
                    </label>
                    <label>
                      <span className="text-xs font-medium text-neutral-700">Parcelas</span>
                      <input value={numParcelas} onChange={(e) => setNumParcelas(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5" />
                    </label>
                    <label>
                      <span className="text-xs font-medium text-neutral-700">A cada</span>
                      <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as typeof periodicidade)} className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5">
                        <option value="SEMANAL">Semana</option>
                        <option value="QUINZENAL">Quinzena</option>
                        <option value="MENSAL">Mês</option>
                      </select>
                    </label>
                    <label>
                      <span className="text-xs font-medium text-neutral-700">1ª parcela</span>
                      <input type="date" value={primeiroVencimento} onChange={(e) => setPrimeiroVencimento(e.target.value)} className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5" />
                    </label>
                  </div>
                  {entradaCents > 0 && (
                    <label className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" checked={entradaPaga} onChange={(e) => setEntradaPaga(e.target.checked)} />
                      Entrada já recebida, em
                      <select value={entradaMeio} onChange={(e) => setEntradaMeio(e.target.value as typeof entradaMeio)} disabled={!entradaPaga} className="rounded-md border border-neutral-300 bg-surface px-2 py-1">
                        <option value="">forma de pagamento…</option>
                        <option value="DINHEIRO">Dinheiro</option>
                        <option value="PIX">PIX</option>
                        <option value="CARTAO">Cartão</option>
                      </select>
                      {!entradaPaga && (
                        <span className="basis-full text-xs text-neutral-500">
                          Sem marcar, a entrada fica no A receber vencendo hoje, para registrar quando o dinheiro entrar.
                        </span>
                      )}
                    </label>
                  )}
                  {previaParcelas.linhas.length > 0 && (
                    <ul className="rounded-md border border-neutral-200 divide-y divide-neutral-100 tabular-nums">
                      {previaParcelas.linhas.map((p, i) => (
                        <li key={i} className="flex justify-between px-3 py-1.5">
                          <span>
                            {p.tipo === "ENTRADA" ? "Entrada" : `${p.numero} de ${p.totalParcelas}`} ·{" "}
                            {p.vencimento.toISOString().slice(0, 10).split("-").reverse().join("/")}
                          </span>
                          <span>{centsToBRL(p.valorCents)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {previaParcelas.erro && <p className="text-xs text-red-600">{previaParcelas.erro}</p>}
                </>
              )}
            </div>
          )}

          {pedido.status === "CANCELADO" && (
            <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              Cancelado{pedido.canceladoEm ? ` em ${new Date(pedido.canceladoEm).toLocaleString("pt-BR")}` : ""}
              {pedido.canceladoPorNome ? ` por ${pedido.canceladoPorNome}` : ""}
              {pedido.motivoCancelamento ? <> — <i>{pedido.motivoCancelamento}</i></> : null}
            </p>
          )}

          {pedido.status === "FECHADO" && (
            <p className="text-sm text-neutral-600">
              Fechado em {new Date(pedido.fechadoEm!).toLocaleString("pt-BR")} ·{" "}
              {pedido.paymentMethod && PAGAMENTO_LABEL[pedido.paymentMethod]} ·{" "}
              {pedido.pago ? "pago" : "a receber"}
            </p>
          )}
        </div>

        <footer className="p-4 border-t border-neutral-200 flex justify-end gap-2 text-sm flex-wrap">
          {pedido.status === "FECHADO" && (
            <a
              href={`/recibo/${pedido.id}`}
              target="_blank"
              rel="noopener"
              className="rounded-md border border-neutral-300 px-4 py-2"
            >
              Imprimir recibo
            </a>
          )}

          {pedido.status === "FECHADO" && (
            <button
              onClick={() => {
                setEnvioDeOrcamento(false);
                setConfirmandoRecibo(true);
              }}
              disabled={reciboEnviado}
              className="rounded-md border border-neutral-300 px-4 py-2 disabled:opacity-50"
            >
              {reciboEnviado ? "✓ Enviado" : "Enviar ao cliente"}
            </button>
          )}

          {pedido.status === "FECHADO" && !pedido.pago && ehFinanceiro && (
            <button
              onClick={() => acao({ acao: "marcarPago" }).then((r) => r && onFechar())}
              disabled={ocupado}
              className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-50"
            >
              Marcar como pago
            </button>
          )}

          {pedido.status === "FECHADO" && ehFinanceiro && (
            <button
              onClick={() => setCancelando("refazer")}
              disabled={ocupado}
              title="Cancela este e cria uma cópia para ajustar e fechar de novo"
              className="rounded-md border border-neutral-300 px-4 py-2 disabled:opacity-50"
            >
              Editar
            </button>
          )}

          {editavel && itens.length > 0 && (
            <button
              onClick={async () => {
                // A prévia lê os itens salvos: salva antes, para o orçamento sair com o que está na tela.
                if ((await salvarItens()) === null) return;
                setEnvioDeOrcamento(true);
                setConfirmandoRecibo(true);
              }}
              disabled={ocupado || orcamentoEnviado}
              title="Manda para a cliente conferir antes de fechar"
              className="rounded-md border border-neutral-300 px-4 py-2 disabled:opacity-50"
            >
              {orcamentoEnviado ? "✓ Orçamento enviado" : "Enviar orçamento"}
            </button>
          )}

          {(editavel || (pedido.status === "FECHADO" && ehFinanceiro)) && (
            <button
              onClick={() => setCancelando("cancelar")}
              disabled={ocupado}
              className="px-3 py-2 text-red-600 hover:underline disabled:opacity-50"
            >
              {editavel ? "Cancelar orçamento" : `Cancelar ${termo.minusculo}`}
            </button>
          )}

          {editavel && (
            <button
              onClick={() => salvarItens().then((r) => r && onFechar())}
              disabled={ocupado}
              className="rounded-md border border-neutral-300 px-4 py-2 disabled:opacity-50"
            >
              Salvar
            </button>
          )}

          {pedido.status === "RASCUNHO" && (
            <button
              onClick={enviar}
              disabled={ocupado || itens.length === 0}
              className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-40"
            >
              Enviar ao financeiro
            </button>
          )}

          {podeFechar && (
            <button
              onClick={() => fechar()}
              disabled={ocupado || itens.length === 0}
              className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-40"
            >
              Fechar pedido
            </button>
          )}
        </footer>
      </div>

      {cancelando && (
        <CancelarPedido
          numero={pedido.numero}
          fechado={pedido.status === "FECHADO"}
          refazer={cancelando === "refazer"}
          termo={termo}
          onVoltar={() => setCancelando(null)}
          onConfirmar={async (motivo) => {
            const r = await acao({ acao: "cancelar", motivo, refazer: cancelando === "refazer" });
            setCancelando(null);
            if (!r) return;
            if (r.copia) {
              alert(
                `${termo.singular} #${pedido.numero} cancelado. A cópia #${r.copia.numero} está em "Aguardando financeiro" para você ajustar e fechar.`
              );
            }
            onFechar();
          }}
        />
      )}

      {confirmandoRecibo && (
        <ConfirmarEnvioDoRecibo
          pedidoId={pedido.id}
          nomeCliente={pedido.contact.name ?? pedido.contact.phoneNumber ?? "o cliente"}
          documento={documento}
          setDocumento={setDocumento}
          nomeNoRecibo={nomeNoRecibo}
          setNomeNoRecibo={setNomeNoRecibo}
          mesReferencia={mesReferencia}
          setMesReferencia={setMesReferencia}
          enviando={enviandoRecibo}
          erro={erroRecibo}
          onEnviar={enviarReciboWhatsApp}
          onCancelar={() => setConfirmandoRecibo(false)}
          orcamento={envioDeOrcamento}
        />
      )}
    </div>
  );
}

/**
 * Confirmação antes de mandar o recibo pro cliente.
 *
 * Existe por causa do CPF/CNPJ: a Guttierres precisa dele no comprovante pra
 * amarrar o recibo ao cliente na contabilidade, e a hora em que alguém sabe o
 * número é a hora de mandar o papel — não antes, cadastrando ficha. Digitado
 * uma vez, fica salvo no contato e já vem preenchido nos próximos.
 */
function ConfirmarEnvioDoRecibo({
  pedidoId,
  nomeCliente,
  documento,
  setDocumento,
  nomeNoRecibo,
  setNomeNoRecibo,
  mesReferencia,
  setMesReferencia,
  enviando,
  erro,
  onEnviar,
  onCancelar,
  orcamento = false,
}: {
  orcamento?: boolean;
  pedidoId: string;
  nomeCliente: string;
  documento: string;
  setDocumento: (v: string) => void;
  nomeNoRecibo: string;
  setNomeNoRecibo: (v: string) => void;
  mesReferencia: string;
  setMesReferencia: (v: string) => void;
  enviando: boolean;
  erro: string | null;
  onEnviar: () => void;
  onCancelar: () => void;
}) {
  // A prévia só é refeita quando a digitação para. Sem isso cada tecla pedia
  // uma imagem nova ao servidor, que desenha o recibo inteiro a cada chamada.
  const [consultaPrevia, setConsultaPrevia] = useState("");
  const [carregandoPrevia, setCarregandoPrevia] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ documento, nomeNoRecibo, mesReferencia, ...(orcamento ? { orcamento: "1" } : {}) });
      setConsultaPrevia(p.toString());
      setCarregandoPrevia(true);
    }, 500);
    return () => clearTimeout(t);
  }, [documento, nomeNoRecibo, mesReferencia, orcamento]);

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-[60] p-4" onClick={onCancelar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-lg border border-neutral-200 w-full max-w-sm max-h-[92vh] flex flex-col"
      >
        <div className="p-5 pb-0">
          <h3 className="font-semibold">{orcamento ? "Enviar orçamento ao cliente" : "Enviar recibo ao cliente"}</h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            É exatamente isto que {nomeCliente} vai receber no WhatsApp.
          </p>
        </div>

        <div className="overflow-y-auto px-5 pb-5 flex flex-col">
          <div className="mt-3 rounded-md border border-neutral-200 bg-neutral-100 p-2 relative">
            {carregandoPrevia && (
              <p className="absolute inset-0 grid place-items-center text-xs text-neutral-500">
                Gerando prévia...
              </p>
            )}
            {consultaPrevia && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/api/orders/${pedidoId}/recibo-whatsapp/previa?${consultaPrevia}`}
                alt="Prévia do recibo"
                onLoad={() => setCarregandoPrevia(false)}
                onError={() => setCarregandoPrevia(false)}
                className={`w-full rounded transition-opacity ${carregandoPrevia ? "opacity-30" : "opacity-100"}`}
              />
            )}
          </div>

        <label className="block text-sm mt-4">
          <span className="text-xs font-medium text-neutral-700">Nome no recibo</span>
          <input
            value={nomeNoRecibo}
            onChange={(e) => setNomeNoRecibo(e.target.value)}
            maxLength={120}
            placeholder={nomeCliente}
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
          <span className="text-xs text-neutral-500">
            Razão social da empresa. Em branco, sai o nome do contato.
          </span>
        </label>

        <label className="block text-sm mt-3">
          <span className="text-xs font-medium text-neutral-700">Mês de referência</span>
          <input
            value={mesReferencia}
            onChange={(e) => setMesReferencia(e.target.value)}
            maxLength={60}
            placeholder="Setembro/2026"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
          <span className="text-xs text-neutral-500">
            Entra no texto do recibo onde estiver {"{mes}"}.
          </span>
        </label>

        <label className="block text-sm mt-3">
          <span className="text-xs font-medium text-neutral-700">CPF / CNPJ do cliente</span>
          <input
            value={documento}
            onChange={(e) => setDocumento(e.target.value)}
            maxLength={40}
            placeholder="Só os números já basta"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-3 py-2"
          />
          <span className="text-xs text-neutral-500">
            Fica salvo na ficha do cliente e já vem preenchido nos próximos recibos. Pode deixar em
            branco.
          </span>
        </label>

        {erro && (
          <p className="mt-3 rounded-md border border-red-300 bg-red-50 text-red-700 px-3 py-2 text-sm">
            {erro}
          </p>
        )}

        </div>

        <div className="border-t border-neutral-200 p-4 flex justify-end gap-2 text-sm">
          <button onClick={onCancelar} className="px-4 py-2 text-neutral-600">
            Cancelar
          </button>
          <button
            onClick={onEnviar}
            disabled={enviando}
            className="rounded-md bg-accent text-white px-4 py-2 font-medium disabled:opacity-50"
          >
            {enviando ? "Enviando..." : orcamento ? "Enviar orçamento" : "Enviar ao cliente"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmação de cancelamento — e de "editar", que é cancelar e refazer.
 * Diz o que vai acontecer com o estoque e o financeiro antes, e pede o motivo
 * (pedido da Believe, 14/10: cancelamento sem justificativa não se explica
 * depois).
 */
function CancelarPedido({
  numero,
  fechado,
  refazer,
  termo,
  onVoltar,
  onConfirmar,
}: {
  numero: number;
  fechado: boolean;
  refazer: boolean;
  termo: { singular: string; minusculo: string };
  onVoltar: () => void;
  onConfirmar: (motivo: string) => Promise<void>;
}) {
  const [motivo, setMotivo] = useState(refazer ? "Correção do pedido" : "");
  const [enviando, setEnviando] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 grid place-items-center z-[60] p-4" onClick={onVoltar}>
      <div onClick={(e) => e.stopPropagation()} className="bg-surface rounded-lg border border-neutral-200 w-full max-w-md p-5 flex flex-col gap-3">
        <h3 className="font-semibold">
          {refazer ? `Editar ${termo.minusculo} #${numero}` : fechado ? `Cancelar ${termo.minusculo} #${numero}` : `Cancelar orçamento #${numero}`}
        </h3>
        {fechado ? (
          <ul className="text-sm text-neutral-700 list-disc pl-5 flex flex-col gap-1">
            <li>Os produtos <b>voltam ao estoque</b> (fica registrado como devolução).</li>
            <li>O que já foi recebido é <b>estornado</b>, e as parcelas a receber são canceladas.</li>
            {refazer && (
              <li>
                Nasce uma <b>cópia</b> com os mesmos itens e condição, em “Aguardando financeiro”, para ajustar e fechar de novo.
              </li>
            )}
          </ul>
        ) : (
          <p className="text-sm text-neutral-700">Ainda não foi fechado: nada de estoque ou financeiro para desfazer.</p>
        )}
        <label className="text-sm">
          <span className="block text-xs font-medium text-neutral-700 mb-1">Motivo (obrigatório)</span>
          <textarea
            autoFocus
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Ex.: valor do produto errado, cliente desistiu, pedido duplicado..."
            className="w-full rounded-md border border-neutral-300 bg-surface px-3 py-2 text-sm"
          />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onVoltar} className="px-4 py-2 text-sm text-neutral-600">
            Voltar
          </button>
          <button
            onClick={async () => {
              setEnviando(true);
              await onConfirmar(motivo.trim());
              setEnviando(false);
            }}
            disabled={enviando || motivo.trim().length < 3}
            className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${refazer ? "bg-accent" : "bg-red-600"}`}
          >
            {enviando ? "Aguarde..." : refazer ? "Cancelar e criar cópia" : fechado ? `Cancelar ${termo.minusculo}` : "Cancelar orçamento"}
          </button>
        </div>
      </div>
    </div>
  );
}
