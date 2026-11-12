"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ROTULO_CUSTO,
  ROTULO_ORIGEM,
  ROTULO_STATUS,
  faixaDeEstoque,
  nomeDoVeiculo,
  placaParaTela,
  type OrigemVeiculo,
  type StatusVeiculo,
  type TipoCusto,
} from "@/lib/veiculos-regras";
import { CamposVeiculo, FORM_VAZIO, paraForm, paraRota, type FormVeiculo } from "./campos-veiculo";
import {
  BuscaCliente,
  COR_FAIXA,
  CampoDinheiro,
  botaoPrimario,
  botaoSecundario,
  brl,
  campo,
  clienteParaRota,
  diaDaqui,
  diaParaISO,
  erroDaResposta,
  fetcher,
  rotulo,
  secao,
  type ClienteEscolhido,
} from "./comum";

type Parcela = { id: string; tipo: string; numero: number; totalParcelas: number; vencimento: string | null; valorCents: number; pagoCents: number; status: string; vencida: boolean };
type Venda = {
  id: string;
  status: "RESERVA" | "CONCLUIDA" | "CANCELADA";
  precoCents: number;
  sinalCents: number;
  reservadaAte: string | null;
  trocaCents: number;
  entradaCents: number;
  financiadoCents: number;
  banco: string | null;
  comissaoCents: number | null;
  observacoes: string | null;
  concluidaEm: string | null;
  canceladaEm: string | null;
  motivoCancelamento: string | null;
  createdAt: string;
  contact: { id: string; name: string | null; waName: string | null; phoneNumber: string | null };
  vendedor: { name: string } | null;
  trocas: { id: string; marca: string; modelo: string; anoModelo: number; placa: string | null }[];
  financeiro: { contaId: string; resumo: { recebidoCents: number; saldoCents: number } | null; parcelas: Parcela[] } | null;
};
type Ficha = Record<string, unknown> & {
  id: string;
  marca: string;
  modelo: string;
  versao: string | null;
  anoFabricacao: number;
  anoModelo: number;
  km: number;
  placa: string | null;
  precoCents: number;
  fipeCents: number | null;
  status: StatusVeiculo;
  origem: OrigemVeiculo;
  entradaEm: string;
  consignacaoAte: string | null;
  dias: number;
  diferencaFipe: number | null;
  linkVitrine: string | null;
  gerencia: boolean;
  fotos: { id: string; ordem: number }[];
  vendas: Venda[];
  eventos: { id: string; tipo: string; descricao: string; createdAt: string; por: { name: string } | null }[];
  vendaDeOrigem: { id: string; veiculoId: string } | null;
  // Só para a gestão:
  custos?: { id: string; tipo: TipoCusto; descricao: string | null; valorCents: number; data: string; contaPagarId: string | null }[];
  custoCents?: number;
  margem?: { valorCents: number; percentual: number | null };
  consignacaoValorCents: number | null;
  consignante: { id: string; name: string | null; waName: string | null; phoneNumber: string | null } | null;
};
type Opcoes = { eu: string; gerencia: boolean; vendedores: { id: string; name: string }[] };

type Acao = null | "enviar" | "reservar" | "vender" | "cancelar";

const MEIOS = [
  ["PIX", "Pix"],
  ["DINHEIRO", "Dinheiro"],
  ["CARTAO", "Cartão"],
  ["BOLETO", "Boleto"],
] as const;

const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—");

/** A ficha do carro: tudo dele numa tela, e as ações do dia (mandar, reservar, vender). */
export function FichaVeiculo({ id }: { id: string }) {
  const { data: v, error, mutate } = useSWR<Ficha>(`/api/veiculos/${id}`, fetcher);
  const { data: opcoes } = useSWR<Opcoes>("/api/veiculos/opcoes", fetcher);
  const [acao, setAcao] = useState<Acao>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!v) return <p className="text-sm text-neutral-500">Carregando…</p>;

  const gerencia = v.gerencia;
  const reserva = v.vendas.find((x) => x.status === "RESERVA") ?? null;
  const aVenda = v.status === "DISPONIVEL" || v.status === "PREPARACAO";
  const faixa = faixaDeEstoque(v.dias);

  async function mudarStatus(status: StatusVeiculo) {
    setAviso(null);
    const r = await fetch(`/api/veiculos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    mutate();
  }
  const pronto = (texto: string) => {
    setAcao(null);
    setAviso({ texto });
    mutate();
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href="/veiculos" className="text-xs text-neutral-500 hover:text-neutral-800">
            ← Estoque
          </Link>
          <h1 className="text-lg font-semibold">{nomeDoVeiculo(v)}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-accent/10 px-2 py-0.5 font-medium text-accent">{ROTULO_STATUS[v.status]}</span>
            <span className="text-neutral-500">{ROTULO_ORIGEM[v.origem]}</span>
            {v.placa && <span className="text-neutral-500">{placaParaTela(v.placa)}</span>}
            <span className="text-neutral-500">{v.km.toLocaleString("pt-BR")} km</span>
            <span className={`rounded-full px-2 py-0.5 ${COR_FAIXA[faixa]}`}>
              {v.dias} dia(s) {v.status === "VENDIDO" ? "até vender" : "em estoque"}
            </span>
            {v.linkVitrine && (
              <a href={v.linkVitrine} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                ver na vitrine
              </a>
            )}
            {v.vendaDeOrigem && (
              <Link href={`/veiculos/${v.vendaDeOrigem.veiculoId}`} className="text-accent hover:underline">
                entrou como troca
              </Link>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{brl(v.precoCents)}</div>
          {v.fipeCents ? (
            <div className="text-xs text-neutral-500">
              FIPE {brl(v.fipeCents)}
              {v.diferencaFipe !== null ? ` · ${v.diferencaFipe > 0 ? "+" : ""}${v.diferencaFipe.toLocaleString("pt-BR")}%` : ""}
            </div>
          ) : null}
          {gerencia && v.margem && (
            <div className={`text-xs ${v.margem.valorCents < 0 ? "text-red-600" : "text-emerald-700"}`}>
              Margem {brl(v.margem.valorCents)}
              {v.margem.percentual !== null ? ` (${v.margem.percentual.toLocaleString("pt-BR")}%)` : ""} · custo {brl(v.custoCents)}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(aVenda || v.status === "RESERVADO") && (
          <button onClick={() => setAcao(acao === "enviar" ? null : "enviar")} className={botaoSecundario}>
            Enviar pelo WhatsApp
          </button>
        )}
        {aVenda && (
          <button onClick={() => setAcao(acao === "reservar" ? null : "reservar")} className={botaoSecundario}>
            Reservar
          </button>
        )}
        {(aVenda || reserva) && (
          <button onClick={() => setAcao(acao === "vender" ? null : "vender")} className={botaoPrimario}>
            {reserva ? "Concluir venda" : "Vender"}
          </button>
        )}
        {reserva && (
          <button onClick={() => setAcao(acao === "cancelar" ? null : "cancelar")} className={botaoSecundario}>
            Cancelar reserva
          </button>
        )}
        {gerencia && v.status === "PREPARACAO" && (
          <button onClick={() => mudarStatus("DISPONIVEL")} className={botaoSecundario}>
            Pronto para vender
          </button>
        )}
        {gerencia && v.status === "DISPONIVEL" && (
          <button onClick={() => mudarStatus("PREPARACAO")} className={botaoSecundario}>
            Voltar para preparação
          </button>
        )}
        {gerencia && aVenda && v.origem === "CONSIGNACAO" && (
          <button
            onClick={() => {
              if (confirm("Devolver o carro ao dono? Ele sai do estoque.")) mudarStatus("DEVOLVIDO");
            }}
            className={botaoSecundario}
          >
            Devolver ao dono
          </button>
        )}
      </div>

      {aviso && (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>
          {aviso.texto}
        </p>
      )}

      {acao === "enviar" && <PainelEnviar id={id} totalFotos={v.fotos.length} onPronto={pronto} />}
      {acao === "reservar" && <PainelReservar v={v} opcoes={opcoes} onPronto={pronto} />}
      {acao === "vender" && <PainelVender v={v} reserva={reserva} opcoes={opcoes} onPronto={pronto} />}
      {acao === "cancelar" && reserva && <PainelCancelar id={id} reserva={reserva} onPronto={pronto} />}

      <Fotos v={v} onMudou={() => mutate()} />

      {v.vendas.filter((x) => x.status !== "CANCELADA").map((venda) => (
        <ResumoVenda key={venda.id} venda={venda} />
      ))}

      {gerencia && <Custos v={v} onMudou={() => mutate()} />}

      {gerencia && v.origem === "CONSIGNACAO" && (
        <section className={secao}>
          <h2 className="text-sm font-semibold">Consignação</h2>
          <p className="text-sm">
            Dono: {v.consignante ? v.consignante.name ?? v.consignante.waName ?? v.consignante.phoneNumber : "—"} · recebe {brl(v.consignacaoValorCents)} na venda · até{" "}
            {dataBR(v.consignacaoAte)}
          </p>
        </section>
      )}

      <Dados v={v} gerencia={gerencia} onSalvou={() => { setAviso({ texto: "Ficha salva." }); mutate(); }} />

      <section className={secao}>
        <h2 className="text-sm font-semibold">Histórico</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {v.eventos.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className="text-xs tabular-nums text-neutral-400">{new Date(e.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
              <span>{e.descricao}</span>
              {e.por && <span className="text-xs text-neutral-400">· {e.por.name}</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- fotos */

function Fotos({ v, onMudou }: { v: Ficha; onMudou: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  async function subir(arquivos: FileList | null) {
    if (!arquivos?.length) return;
    setEnviando(true);
    setErro(null);
    const fd = new FormData();
    for (const a of Array.from(arquivos)) fd.append("file", a);
    const r = await fetch(`/api/veiculos/${v.id}/fotos`, { method: "POST", body: fd });
    setEnviando(false);
    if (input.current) input.current.value = "";
    if (!r.ok) return setErro(await erroDaResposta(r));
    onMudou();
  }
  async function tornarCapa(fotoId: string) {
    const ordem = [fotoId, ...v.fotos.map((f) => f.id).filter((x) => x !== fotoId)];
    const r = await fetch(`/api/veiculos/${v.id}/fotos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ordem }) });
    if (!r.ok) return setErro(await erroDaResposta(r));
    onMudou();
  }
  async function remover(fotoId: string) {
    if (!confirm("Remover esta foto?")) return;
    const r = await fetch(`/api/veiculos/fotos/${fotoId}`, { method: "DELETE" });
    if (!r.ok) return setErro(await erroDaResposta(r));
    onMudou();
  }

  return (
    <section className={secao}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Fotos ({v.fotos.length})</h2>
        {v.gerencia && (
          <>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => subir(e.target.files)} />
            <button onClick={() => input.current?.click()} disabled={enviando} className={botaoSecundario}>
              {enviando ? "Enviando…" : "Adicionar fotos"}
            </button>
          </>
        )}
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {v.fotos.length === 0 ? (
        <p className="text-sm text-neutral-500">Sem fotos. Carro com foto vende mais: a primeira é a capa no estoque e no WhatsApp.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {v.fotos.map((f, i) => (
            <div key={f.id} className="group relative aspect-[4/3] overflow-hidden rounded-md bg-neutral-100">
              <button type="button" onClick={() => setAberta(f.id)} className="h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/veiculos/fotos/${f.id}`} alt={`Foto ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              </button>
              {i === 0 && <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] text-white">capa</span>}
              {v.gerencia && (
                <div className="absolute inset-x-1 bottom-1 hidden justify-between gap-1 group-hover:flex">
                  {i > 0 && (
                    <button onClick={() => tornarCapa(f.id)} className="rounded bg-black/60 px-1.5 text-[10px] text-white">
                      capa
                    </button>
                  )}
                  <button onClick={() => remover(f.id)} className="ml-auto rounded bg-red-600/80 px-1.5 text-[10px] text-white">
                    remover
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {aberta && (
        <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setAberta(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/veiculos/fotos/${aberta}`} alt="" className="max-h-full max-w-full rounded" />
        </div>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- dados */

function Dados({ v, gerencia, onSalvou }: { v: Ficha; gerencia: boolean; onSalvou: () => void }) {
  const [f, setF] = useState<FormVeiculo>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => setF(paraForm(v)), [v]);

  if (!gerencia) {
    const linhas: [string, unknown][] = [
      ["Versão", v.versao],
      ["Câmbio", v.cambio],
      ["Combustível", v.combustivel],
      ["Cor", v.cor],
      ["Portas", v.portas],
      ["Opcionais", Array.isArray(v.opcionais) ? (v.opcionais as string[]).join(", ") : ""],
      ["Anúncio", v.descricao],
    ];
    return (
      <section className={secao}>
        <h2 className="text-sm font-semibold">Ficha</h2>
        <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[140px_1fr]">
          {linhas.filter(([, x]) => x).map(([k, x]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd className="whitespace-pre-line">{String(x)}</dd>
            </div>
          ))}
        </dl>
      </section>
    );
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    let dados;
    try {
      dados = paraRota(f, { exigirPreco: true, gerencia: true });
    } catch (x) {
      return setErro((x as Error).message);
    }
    setSalvando(true);
    const r = await fetch(`/api/veiculos/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    onSalvou();
  }

  return (
    <form onSubmit={salvar} className={secao}>
      <h2 className="text-sm font-semibold">Ficha do carro</h2>
      <CamposVeiculo f={f} set={(p) => setF((x) => ({ ...x, ...p }))} gerencia />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div className="flex justify-end">
        <button disabled={salvando} className={botaoPrimario}>
          {salvando ? "Salvando…" : "Salvar ficha"}
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------- custos */

const FORMAS_PAGAR = [
  ["PIX", "Pix"],
  ["BOLETO", "Boleto"],
  ["DINHEIRO", "Dinheiro"],
  ["TRANSFERENCIA", "Transferência"],
  ["CARTAO", "Cartão"],
  ["OUTRO", "Outro"],
] as const;

function Custos({ v, onMudou }: { v: Ficha; onMudou: () => void }) {
  const [tipo, setTipo] = useState<TipoCusto>("MECANICA");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState<number | null>(null);
  const [pagar, setPagar] = useState(false);
  const [fornecedor, setFornecedor] = useState("");
  const [forma, setForma] = useState<(typeof FORMAS_PAGAR)[number][0]>("PIX");
  const [vencimento, setVencimento] = useState(diaDaqui(0));
  const [jaPago, setJaPago] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!valor) return setErro("informe o valor");
    if (pagar && !fornecedor.trim()) return setErro("informe quem prestou o serviço");
    setSalvando(true);
    const r = await fetch(`/api/veiculos/${v.id}/custos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        descricao: descricao.trim() || null,
        valorCents: valor,
        pagar: pagar ? { fornecedorNome: fornecedor.trim(), forma, vencimento: diaParaISO(vencimento), jaPago } : null,
      }),
    });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    setDescricao("");
    setValor(null);
    onMudou();
  }
  async function remover(custoId: string, comConta: boolean) {
    if (!confirm(comConta ? "Remover o custo e cancelar a conta a pagar lançada junto?" : "Remover este custo?")) return;
    const r = await fetch(`/api/veiculos/${v.id}/custos/${custoId}`, { method: "DELETE" });
    if (!r.ok) return setErro(await erroDaResposta(r));
    onMudou();
  }

  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">Custos e margem</h2>
      <table className="w-full text-sm">
        <tbody>
          {v.custos?.map((c) => (
            <tr key={c.id} className="border-b border-neutral-100">
              <td className="py-1.5 pr-2 text-xs tabular-nums text-neutral-500">{dataBR(c.data)}</td>
              <td className="py-1.5 pr-2">
                {ROTULO_CUSTO[c.tipo]}
                {c.descricao ? <span className="text-neutral-500"> · {c.descricao}</span> : null}
                {c.contaPagarId ? <span className="text-xs text-neutral-400"> · em contas a pagar</span> : null}
              </td>
              <td className="py-1.5 text-right tabular-nums">{brl(c.valorCents)}</td>
              <td className="w-16 py-1.5 text-right">
                {v.status !== "VENDIDO" && (
                  <button onClick={() => remover(c.id, !!c.contaPagarId)} className="text-xs text-neutral-400 hover:text-red-600">
                    remover
                  </button>
                )}
              </td>
            </tr>
          ))}
          {v.origem === "CONSIGNACAO" && (
            <tr className="border-b border-neutral-100">
              <td />
              <td className="py-1.5">Repasse ao dono (consignado)</td>
              <td className="py-1.5 text-right tabular-nums">{brl(v.consignacaoValorCents)}</td>
              <td />
            </tr>
          )}
          <tr className="font-medium">
            <td />
            <td className="py-1.5">Custo total</td>
            <td className="py-1.5 text-right tabular-nums">{brl(v.custoCents)}</td>
            <td />
          </tr>
        </tbody>
      </table>
      {v.status !== "VENDIDO" && v.status !== "DEVOLVIDO" && (
        <form onSubmit={lancar} className="flex flex-col gap-2 border-t border-neutral-100 pt-3">
          <div className="grid gap-2 sm:grid-cols-[180px_1fr_160px_auto]">
            <select aria-label="Tipo de custo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCusto)} className={campo}>
              {(Object.keys(ROTULO_CUSTO) as TipoCusto[]).map((t) => (
                <option key={t} value={t}>
                  {ROTULO_CUSTO[t]}
                </option>
              ))}
            </select>
            <input id="custo-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" className={campo} />
            <CampoDinheiro id="custo-valor" valor={valor} onChange={setValor} />
            <button disabled={salvando} className={botaoSecundario}>
              {salvando ? "…" : "Lançar custo"}
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pagar} onChange={(e) => setPagar(e.target.checked)} />
            Lançar em contas a pagar
          </label>
          {pagar && (
            <div className="grid gap-2 sm:grid-cols-4">
              <input id="custo-fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} placeholder="Oficina / prestador" className={`${campo} sm:col-span-2`} />
              <select aria-label="Forma de pagamento" value={forma} onChange={(e) => setForma(e.target.value as typeof forma)} className={campo}>
                {FORMAS_PAGAR.map(([x, r]) => (
                  <option key={x} value={x}>
                    {r}
                  </option>
                ))}
              </select>
              <input aria-label="Vencimento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} className={campo} />
              <label className="flex items-center gap-2 text-sm sm:col-span-4">
                <input type="checkbox" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
                Já foi pago
              </label>
            </div>
          )}
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </form>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- enviar */

function PainelEnviar({ id, totalFotos, onPronto }: { id: string; totalFotos: number; onPronto: (t: string) => void }) {
  const [cliente, setCliente] = useState<ClienteEscolhido>(null);
  const [fotos, setFotos] = useState(Math.min(totalFotos, 5));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    setErro(null);
    if (!cliente || !("contactId" in cliente)) return setErro("escolha um contato da lista");
    setEnviando(true);
    const r = await fetch(`/api/veiculos/${id}/enviar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: cliente.contactId, fotos }) });
    setEnviando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    onPronto(`Enviado para ${cliente.nome}. A conversa fica no Inbox.`);
  }
  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">Enviar pelo WhatsApp</h2>
      <p className="text-xs text-neutral-500">Vai a ficha do carro (sem custo nem placa completa) como legenda da capa, e as outras fotos em seguida, pelo número da loja.</p>
      <BuscaCliente id="enviar-cliente" valor={cliente} onChange={(c) => setCliente(c && "contactId" in c ? c : null)} rotuloNovo="Só contatos que já existem (cadastre o novo em Contatos ou pelo Inbox)." />
      <label className="flex items-center gap-2 text-sm">
        Fotos:
        <input type="number" min={0} max={Math.min(totalFotos, 10)} value={fotos} onChange={(e) => setFotos(Number(e.target.value))} className={`${campo} w-20`} />
        <span className="text-xs text-neutral-500">de {totalFotos}</span>
      </label>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <button onClick={enviar} disabled={enviando} className={botaoPrimario}>
          {enviando ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- reservar */

function SeletorVendedor({ opcoes, valor, onChange, vazio = "—" }: { opcoes?: Opcoes; valor: string; onChange: (id: string) => void; vazio?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={rotulo}>Vendedor</span>
      <select id="venda-vendedor" value={valor} onChange={(e) => onChange(e.target.value)} className={campo}>
        <option value="">{vazio}</option>
        {opcoes?.vendedores.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function PainelReservar({ v, opcoes, onPronto }: { v: Ficha; opcoes?: Opcoes; onPronto: (t: string) => void }) {
  const [cliente, setCliente] = useState<ClienteEscolhido>(null);
  const [vendedor, setVendedor] = useState(opcoes?.eu ?? "");
  const [preco, setPreco] = useState<number | null>(v.precoCents);
  const [sinal, setSinal] = useState<number | null>(null);
  const [meio, setMeio] = useState<(typeof MEIOS)[number][0]>("PIX");
  const [ate, setAte] = useState(diaDaqui(3));
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!vendedor && opcoes) setVendedor(opcoes.eu);
  }, [opcoes, vendedor]);

  async function salvar() {
    setErro(null);
    const c = clienteParaRota(cliente);
    if (!c) return setErro("escolha o cliente");
    if (!preco) return setErro("informe o preço combinado");
    setSalvando(true);
    const r = await fetch(`/api/veiculos/${v.id}/reserva`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, vendedorId: vendedor || null, precoCents: preco, sinalCents: sinal ?? 0, meioDoSinal: sinal ? meio : null, reservadaAte: diaParaISO(ate), observacoes: obs.trim() || null }),
    });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    onPronto(sinal ? `Reservado. Sinal de ${brl(sinal)} lançado no Caixa.` : "Reservado.");
  }
  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">Reservar</h2>
      <BuscaCliente id="reserva-cliente" valor={cliente} onChange={setCliente} />
      <div className="grid gap-3 sm:grid-cols-3">
        <SeletorVendedor opcoes={opcoes} valor={vendedor} onChange={setVendedor} />
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Preço combinado</span>
          <CampoDinheiro id="reserva-preco" valor={preco} onChange={setPreco} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Reservado até</span>
          <input id="reserva-ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Sinal (opcional)</span>
          <CampoDinheiro id="reserva-sinal" valor={sinal} onChange={setSinal} />
        </label>
        {!!sinal && (
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Sinal pago em</span>
            <select id="reserva-meio" value={meio} onChange={(e) => setMeio(e.target.value as typeof meio)} className={campo}>
              {MEIOS.map(([x, r]) => (
                <option key={x} value={x}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <textarea aria-label="Observações" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações (opcional)" className={campo} />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <button onClick={salvar} disabled={salvando} className={botaoPrimario}>
          {salvando ? "Salvando…" : "Reservar"}
        </button>
      </div>
    </section>
  );
}

function PainelCancelar({ id, reserva, onPronto }: { id: string; reserva: Venda; onPronto: (t: string) => void }) {
  const [motivo, setMotivo] = useState("");
  const [devolver, setDevolver] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function cancelar() {
    setErro(null);
    const r = await fetch(`/api/veiculos/${id}/reserva`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ motivo: motivo.trim() || null, devolverSinal: devolver }) });
    if (!r.ok) return setErro(await erroDaResposta(r));
    onPronto("Reserva cancelada. O carro voltou a ficar disponível.");
  }
  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">Cancelar reserva</h2>
      <input id="cancelar-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (cliente desistiu, financiamento negado…)" className={campo} />
      {reserva.sinalCents > 0 && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={devolver} onChange={(e) => setDevolver(e.target.checked)} />
          Devolver o sinal de {brl(reserva.sinalCents)} (estorna no Caixa). Sem marcar, a loja fica com o sinal.
        </label>
      )}
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <button onClick={cancelar} className={botaoPrimario}>
          Cancelar reserva
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- vender */

function PainelVender({ v, reserva, opcoes, onPronto }: { v: Ficha; reserva: Venda | null; opcoes?: Opcoes; onPronto: (t: string) => void }) {
  const [cliente, setCliente] = useState<ClienteEscolhido>(null);
  const [vendedor, setVendedor] = useState("");
  const [preco, setPreco] = useState<number | null>(reserva?.precoCents ?? v.precoCents);
  const [comTroca, setComTroca] = useState(false);
  const [troca, setTroca] = useState<FormVeiculo>(FORM_VAZIO);
  const [valorTroca, setValorTroca] = useState<number | null>(null);
  const [entrada, setEntrada] = useState<number | null>(null);
  const [meioEntrada, setMeioEntrada] = useState<(typeof MEIOS)[number][0]>("PIX");
  const [financiado, setFinanciado] = useState<number | null>(null);
  const [banco, setBanco] = useState("");
  const [vencFinanciamento, setVencFinanciamento] = useState(diaDaqui(15));
  const [numParcelas, setNumParcelas] = useState(1);
  const [periodicidade, setPeriodicidade] = useState<"MENSAL" | "QUINZENAL" | "SEMANAL">("MENSAL");
  const [primeiroVenc, setPrimeiroVenc] = useState(diaDaqui(30));
  const [comissao, setComissao] = useState<number | null>(null);
  const [vencRepasse, setVencRepasse] = useState(diaDaqui(5));
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!vendedor && opcoes) setVendedor(reserva ? "" : opcoes.eu);
  }, [opcoes, vendedor, reserva]);

  const sinal = reserva?.sinalCents ?? 0;
  const restante = (preco ?? 0) - (comTroca ? valorTroca ?? 0 : 0) - sinal - (entrada ?? 0) - (financiado ?? 0);

  async function salvar() {
    setErro(null);
    const c = reserva ? { daReserva: true } : clienteParaRota(cliente);
    if (!c) return setErro("escolha o cliente");
    if (!preco) return setErro("informe o preço de venda");
    if (restante < 0) return setErro("troca, sinal, entrada e financiamento passam do preço");
    let trocaRota = null;
    if (comTroca) {
      if (!valorTroca) return setErro("informe quanto vale a troca");
      try {
        trocaRota = { veiculo: paraRota(troca, { exigirPreco: false, gerencia: false }), valorCents: valorTroca };
      } catch (x) {
        return setErro(`Troca: ${(x as Error).message}`);
      }
    }
    setSalvando(true);
    const r = await fetch(`/api/veiculos/${v.id}/venda`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...c,
        ...(vendedor ? { vendedorId: vendedor } : {}),
        precoCents: preco,
        troca: trocaRota,
        entradaCents: entrada ?? 0,
        meioDaEntrada: entrada ? meioEntrada : null,
        financiadoCents: financiado ?? 0,
        banco: banco.trim() || null,
        vencimentoFinanciamento: financiado ? diaParaISO(vencFinanciamento) : null,
        restante: restante > 0 ? { numParcelas, periodicidade, primeiroVencimento: diaParaISO(primeiroVenc) } : null,
        comissaoCents: comissao,
        vencimentoRepasse: v.origem === "CONSIGNACAO" ? diaParaISO(vencRepasse) : null,
        observacoes: obs.trim() || null,
      }),
    });
    setSalvando(false);
    if (!r.ok) return setErro(await erroDaResposta(r));
    const { trocaId } = await r.json();
    onPronto(trocaId ? "Venda registrada. O carro da troca entrou no estoque em preparação." : "Venda registrada e lançada em Financeiro → A receber.");
  }

  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">{reserva ? "Concluir venda da reserva" : "Vender"}</h2>
      {reserva ? (
        <p className="text-sm">
          Cliente: <strong>{reserva.contact.name ?? reserva.contact.waName ?? reserva.contact.phoneNumber}</strong>
          {sinal ? ` · sinal já recebido: ${brl(sinal)}` : ""}
        </p>
      ) : (
        <BuscaCliente id="venda-cliente" valor={cliente} onChange={setCliente} />
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <SeletorVendedor opcoes={opcoes} valor={vendedor} onChange={setVendedor} vazio={reserva ? `o da reserva${reserva.vendedor ? ` (${reserva.vendedor.name})` : ""}` : "—"} />
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Preço de venda</span>
          <CampoDinheiro id="venda-preco" valor={preco} onChange={setPreco} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Comissão do vendedor</span>
          <CampoDinheiro id="venda-comissao" valor={comissao} onChange={setComissao} />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={comTroca} onChange={(e) => setComTroca(e.target.checked)} />
        Cliente deu um carro na troca
      </label>
      {comTroca && (
        <div className="flex flex-col gap-3 rounded-md border border-dashed border-neutral-300 p-3">
          <label className="flex max-w-xs flex-col gap-1">
            <span className={rotulo}>Valor da troca (abate do preço)</span>
            <CampoDinheiro id="troca-valor" valor={valorTroca} onChange={setValorTroca} />
          </label>
          <CamposVeiculo f={troca} set={(p) => setTroca((x) => ({ ...x, ...p }))} gerencia={false} comPreco={false} prefixo="troca" />
          <p className="text-xs text-neutral-500">O carro da troca entra no estoque em preparação, com o valor da troca como custo de compra.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Entrada (recebida agora)</span>
          <CampoDinheiro id="venda-entrada" valor={entrada} onChange={setEntrada} />
        </label>
        {!!entrada && (
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Entrada paga em</span>
            <select id="venda-meio" value={meioEntrada} onChange={(e) => setMeioEntrada(e.target.value as typeof meioEntrada)} className={campo}>
              {MEIOS.map(([x, r]) => (
                <option key={x} value={x}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Financiado (o banco paga a loja)</span>
          <CampoDinheiro id="venda-financiado" valor={financiado} onChange={setFinanciado} />
        </label>
        {!!financiado && (
          <>
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Banco / financeira</span>
              <input id="venda-banco" value={banco} onChange={(e) => setBanco(e.target.value)} className={campo} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={rotulo}>Banco paga em</span>
              <input id="venda-venc-fin" type="date" value={vencFinanciamento} onChange={(e) => setVencFinanciamento(e.target.value)} className={campo} />
            </label>
          </>
        )}
      </div>

      <div className={`rounded-md px-3 py-2 text-sm ${restante < 0 ? "bg-red-500/10 text-red-600" : restante > 0 ? "bg-amber-500/10 text-amber-800" : "bg-emerald-500/10 text-emerald-700"}`}>
        {restante < 0 ? `Passa do preço em ${brl(-restante)}` : restante > 0 ? `Restante no crediário da loja: ${brl(restante)}` : "Pagamento fechado."}
      </div>
      {restante > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Parcelas</span>
            <input id="venda-parcelas" type="number" min={1} max={60} value={numParcelas} onChange={(e) => setNumParcelas(Number(e.target.value))} className={campo} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>A cada</span>
            <select id="venda-periodicidade" value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as typeof periodicidade)} className={campo}>
              <option value="MENSAL">Mês</option>
              <option value="QUINZENAL">Quinzena</option>
              <option value="SEMANAL">Semana</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={rotulo}>Primeiro vencimento</span>
            <input id="venda-primeiro" type="date" value={primeiroVenc} onChange={(e) => setPrimeiroVenc(e.target.value)} className={campo} />
          </label>
        </div>
      )}
      {v.origem === "CONSIGNACAO" && v.gerencia && (
        <label className="flex max-w-xs flex-col gap-1">
          <span className={rotulo}>Pagar o dono ({brl(v.consignacaoValorCents)}) em</span>
          <input id="venda-repasse" type="date" value={vencRepasse} onChange={(e) => setVencRepasse(e.target.value)} className={campo} />
        </label>
      )}
      <textarea aria-label="Observações da venda" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Observações (opcional)" className={campo} />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <button onClick={salvar} disabled={salvando} className={botaoPrimario}>
          {salvando ? "Registrando…" : "Registrar venda"}
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- venda */

const ROTULO_PARCELA: Record<string, string> = { PAGA: "Paga", ABERTA: "Em aberto", PARCIAL: "Parcial", CANCELADA: "Cancelada", REEMBOLSADA: "Reembolsada" };

function ResumoVenda({ venda }: { venda: Venda }) {
  const nome = venda.contact.name ?? venda.contact.waName ?? venda.contact.phoneNumber ?? "Sem nome";
  const parcelas = venda.financeiro?.parcelas.filter((p) => p.status !== "CANCELADA") ?? [];
  return (
    <section className={secao}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {venda.status === "RESERVA" ? `Reservado até ${dataBR(venda.reservadaAte)}` : `Vendido em ${new Date(venda.concluidaEm ?? venda.createdAt).toLocaleDateString("pt-BR")}`}
        </h2>
        {venda.financeiro?.resumo && (
          <span className="text-xs text-neutral-500">
            Recebido {brl(venda.financeiro.resumo.recebidoCents)} · falta {brl(venda.financeiro.resumo.saldoCents)}
          </span>
        )}
      </div>
      <p className="text-sm">
        Cliente: <strong>{nome}</strong>
        {venda.vendedor ? ` · vendedor ${venda.vendedor.name}` : ""} · {brl(venda.precoCents)}
        {venda.comissaoCents ? ` · comissão ${brl(venda.comissaoCents)}` : ""}
      </p>
      {venda.trocas.map((t) => (
        <p key={t.id} className="text-sm">
          Troca ({brl(venda.trocaCents)}):{" "}
          <Link href={`/veiculos/${t.id}`} className="text-accent hover:underline">
            {t.marca} {t.modelo} {t.anoModelo}
            {t.placa ? ` · ${placaParaTela(t.placa)}` : ""}
          </Link>
        </p>
      ))}
      {parcelas.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {parcelas.map((p) => (
              <tr key={p.id} className="border-b border-neutral-100">
                <td className="py-1 pr-2 text-xs tabular-nums text-neutral-500">{dataBR(p.vencimento)}</td>
                <td className="py-1 pr-2">
                  {p.tipo === "ENTRADA" ? "Entrada / sinal" : p.totalParcelas > 1 ? `Parcela ${p.numero}/${p.totalParcelas}` : "Parcela"}
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{brl(p.valorCents)}</td>
                <td className={`py-1 text-right text-xs ${p.vencida ? "text-red-600" : p.status === "PAGA" ? "text-emerald-700" : "text-neutral-500"}`}>
                  {p.vencida ? "Vencida" : ROTULO_PARCELA[p.status] ?? p.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {venda.financeiro && (
        <Link href="/receber" className="text-xs text-accent hover:underline">
          Receber e acompanhar em Financeiro → A receber
        </Link>
      )}
    </section>
  );
}
