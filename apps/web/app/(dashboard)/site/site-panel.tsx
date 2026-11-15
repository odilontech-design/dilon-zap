"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import type { PainelV1, Origem } from "@/lib/painel-ecommerce";

/**
 * Aba "Site": os números do e-commerce da empresa, lidos do site dela (contrato v1). A Licyane e a gestão veem a
 * loja online sem abrir o admin do site. Se o site cair, a tela mostra o último resultado com o aviso, ou só o
 * aviso, e nunca quebra.
 */

type Resposta = { dados: PainelV1; buscadoEm: number; origem: Origem; erro?: string };
type Preset = "hoje" | "7" | "30" | "mes" | "custom";

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const inteiro = (n: number) => n.toLocaleString("pt-BR");
const pct = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const hora = (ms: number) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

// Datas no relógio de Brasília, como o contrato pede.
const FUSO = "America/Sao_Paulo";
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: FUSO });
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function periodoDoPreset(p: Exclude<Preset, "custom">): { de: string; ate: string } {
  const hoje = hojeBR();
  if (p === "hoje") return { de: hoje, ate: hoje };
  if (p === "7") return { de: somarDias(hoje, -6), ate: hoje };
  if (p === "30") return { de: somarDias(hoje, -29), ate: hoje };
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

async function buscar(url: string): Promise<Resposta> {
  const r = await fetch(url);
  const tipo = r.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("Sua sessão expirou. Entre de novo.");
  const j = await r.json();
  if (!r.ok) throw new Error(typeof j.error === "string" ? j.error : "Não deu para carregar o painel.");
  return j as Resposta;
}

const PRESETS: { id: Preset; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "7", rotulo: "7 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "mes", rotulo: "Este mês" },
  { id: "custom", rotulo: "Personalizado" },
];

export function SitePanel() {
  const [preset, setPreset] = useState<Preset>("30");
  const [custom, setCustom] = useState(() => periodoDoPreset("30"));
  const { de, ate } = preset === "custom" ? custom : periodoDoPreset(preset);
  const { data, error, isLoading, mutate } = useSWR<Resposta>(`/api/painel-ecommerce?de=${de}&ate=${ate}`, buscar, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Site</h1>
          <p className="text-xs text-neutral-500">Os números da loja online, direto do site. Vendas e faturamento contam pela data do pagamento.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`rounded-full border px-3 py-1 text-xs ${preset === p.id ? "border-accent bg-accent/10 font-medium text-accent" : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"}`}
            >
              {p.rotulo}
            </button>
          ))}
          <button onClick={() => mutate()} className="rounded-md border border-neutral-300 px-3 py-1 text-xs hover:bg-neutral-50" title="Buscar de novo no site (o resultado fica 5 minutos em cache)">
            Atualizar
          </button>
        </div>
      </div>

      {preset === "custom" && (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-neutral-600">
            De
            <input type="date" value={custom.de} max={custom.ate} onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))} className="mt-1 block rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm" />
          </label>
          <label className="text-xs text-neutral-600">
            Até
            <input type="date" value={custom.ate} min={custom.de} onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))} className="mt-1 block rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm" />
          </label>
          <span className="pb-2 text-[11px] text-neutral-500">No máximo 366 dias.</span>
        </div>
      )}

      {isLoading && !data && <p className="py-10 text-center text-sm text-neutral-500">Buscando os números no site…</p>}

      {error && !data && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <p className="font-medium">Não foi possível carregar o painel do site agora.</p>
          <p className="mt-1 text-xs">{(error as Error).message}</p>
          <button onClick={() => mutate()} className="mt-2 text-xs text-red-900 underline">Tentar de novo</button>
        </div>
      )}

      {data && (
        <>
          {data.origem === "reserva" && (
            <div role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
              O site não respondeu agora ({data.erro ?? "sem detalhe"}). Estes são os números de <b>{hora(data.buscadoEm)}</b>.
            </div>
          )}
          <Painel d={data.dados} buscadoEm={data.buscadoEm} origem={data.origem} />
        </>
      )}
    </div>
  );
}

function Painel({ d, buscadoEm, origem }: { d: PainelV1; buscadoEm: number; origem: Origem }) {
  const v = d.vendas;
  const f = d.funil;
  const c = d.carrinhoAbandonado;
  const desc = v.descontos;
  const totalDescontos = desc.comboCents + desc.cupomCents + desc.indicacaoCents + desc.cashbackCents;
  const [verWpp, setVerWpp] = useState<null | "todos" | "falhas">(null);

  return (
    <div className="space-y-6">
      <p className="text-[11px] text-neutral-500">
        Período de {d.periodo.de.split("-").reverse().join("/")} a {d.periodo.ate.split("-").reverse().join("/")} · {origem === "cache" ? "do cache" : origem === "reserva" ? "reserva" : "atualizado"} às {hora(buscadoEm)}
      </p>

      <Grupo titulo="Vendas">
        <Cartao rotulo="Faturamento" valor={brl(v.faturamentoCents)} destaque />
        <Cartao rotulo="Pedidos pagos" valor={inteiro(v.pedidosPagos)} />
        <Cartao rotulo="Ticket médio" valor={brl(v.ticketMedioCents)} />
        <Cartao rotulo="Frete" valor={brl(v.freteCents)} />
        <Cartao rotulo="Descontos dados" valor={brl(totalDescontos)} dica={`Combo ${brl(desc.comboCents)} · cupom ${brl(desc.cupomCents)} · indicação ${brl(desc.indicacaoCents)} · cashback ${brl(desc.cashbackCents)}`} />
      </Grupo>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Faturamento por dia</h2>
        <GraficoDiario serie={d.serieDiaria} />
      </section>

      <Grupo titulo="Funil (pedidos iniciados no período)">
        <Cartao rotulo="Conversão" valor={pct(f.conversaoBps)} destaque dica="Dos pedidos iniciados no período, quantos foram pagos, mesmo depois." />
        <Cartao rotulo="Iniciados" valor={inteiro(f.pedidosIniciados)} />
        <Cartao rotulo="Pagos" valor={inteiro(f.pagos)} />
        <Cartao rotulo="Aguardando pagamento" valor={inteiro(f.aguardandoPagamento)} />
        <Cartao rotulo="Cancelados" valor={inteiro(f.cancelados)} />
      </Grupo>

      <Grupo titulo="Carrinho abandonado">
        <Cartao rotulo="Lembretes de 1 h" valor={inteiro(c.lembrete1Enviados)} />
        <Cartao rotulo="Lembretes de 24 h" valor={inteiro(c.lembrete2Enviados)} />
        <Cartao rotulo="Pedidos lembrados" valor={inteiro(c.pedidosLembrados)} />
        <Cartao rotulo="Recuperados" valor={inteiro(c.recuperados)} dica="Receberam o lembrete e foram pagos depois do primeiro lembrete." />
        <Cartao rotulo="Valor recuperado" valor={brl(c.valorRecuperadoCents)} destaque />
      </Grupo>

      <Grupo titulo="Fila de agora" nota="Não depende do período.">
        <Cartao rotulo="Pagos, aguardando separação" valor={inteiro(d.statusAtual.pagoAguardandoSeparacao)} />
        <Cartao rotulo="Em separação" valor={inteiro(d.statusAtual.emSeparacao)} />
        <Cartao rotulo="Enviados" valor={inteiro(d.statusAtual.enviado)} />
      </Grupo>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tabela
          titulo="Produtos mais vendidos"
          colunas={["Produto", "Qtd", "Valor"]}
          linhas={d.produtos.maisVendidos.map((p) => [p.nome + (p.ingresso ? " (ingresso)" : ""), inteiro(p.quantidade), brl(p.valorCents)])}
          vazio="Nenhuma venda no período."
        />
        <div>
          <h2 className="mb-2 text-sm font-semibold">Sem estoque (entre os ativos)</h2>
          {d.produtos.semEstoque.length === 0 ? (
            <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-3 text-sm text-neutral-500">Nenhum produto ativo zerado.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 rounded-lg border border-neutral-200 bg-surface p-3">
              {d.produtos.semEstoque.map((nome) => (
                <span key={nome} className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-800">{nome}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tabela
          titulo="Cupons"
          colunas={["Cupom", "Pedidos", "Desconto", "Faturamento"]}
          linhas={d.cupons.porCupom.map((x) => [x.codigo, inteiro(x.pedidos), brl(x.descontoCents), brl(x.faturamentoCents)])}
          vazio="Nenhum cupom usado no período."
          rodape={`Combo da campanha: ${inteiro(d.cupons.combo.pedidos)} pedido(s), ${brl(d.cupons.combo.descontoCents)} em desconto.`}
        />
        <Tabela
          titulo="Indicação (cabeleireiras afiliadas)"
          colunas={["Afiliada", "Pedidos", "Valor", "Comissão"]}
          linhas={d.indicacao.topAfiliadas.map((a) => [a.nome ? `${a.nome} (${a.codigo})` : a.codigo, inteiro(a.pedidos), brl(a.valorCents), brl(a.comissaoCents)])}
          vazio="Nenhum pedido por indicação no período."
          rodape={`Total: ${inteiro(d.indicacao.pedidos)} pedido(s), ${brl(d.indicacao.valorCents)}, comissões de ${brl(d.indicacao.comissoesCents)}.`}
        />
      </div>

      <Grupo titulo="Clientes">
        <Cartao rotulo="Novas cadastradas" valor={inteiro(d.clientes.novasCadastradas)} />
        <Cartao rotulo="Novas cabeleireiras" valor={inteiro(d.clientes.novasCabeleireiras)} />
        <Cartao rotulo="Compradoras" valor={inteiro(d.clientes.compradoras)} />
        <Cartao rotulo="Compradoras novas" valor={inteiro(d.clientes.compradorasNovas)} />
        <Cartao rotulo="Compradoras recorrentes" valor={inteiro(d.clientes.compradorasRecorrentes)} />
      </Grupo>

      <Grupo titulo="Avisos às clientes">
        <Cartao rotulo="E-mails enviados" valor={inteiro(d.avisos.email.enviados)} dica={`${inteiro(d.avisos.email.pulados)} pulado(s)`} />
        <Cartao rotulo="E-mails com falha" valor={inteiro(d.avisos.email.falhas)} alerta={d.avisos.email.falhas > 0} />
        <Cartao rotulo="WhatsApps enviados" valor={inteiro(d.avisos.whatsapp.enviados)} dica={`${inteiro(d.avisos.whatsapp.pulados)} pulado(s) · clique para ver`} onClick={() => setVerWpp(verWpp === "todos" ? null : "todos")} ativo={verWpp === "todos"} />
        <Cartao rotulo="WhatsApps com falha" valor={inteiro(d.avisos.whatsapp.falhas)} alerta={d.avisos.whatsapp.falhas > 0} dica="clique para ver" onClick={() => setVerWpp(verWpp === "falhas" ? null : "falhas")} ativo={verWpp === "falhas"} />
      </Grupo>
      {verWpp && <DetalheWhatsapps de={d.periodo.de} ate={d.periodo.ate} soFalhas={verWpp === "falhas"} />}
    </div>
  );
}

function Grupo({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">
        {titulo} {nota && <span className="ml-1 text-[11px] font-normal text-neutral-500">{nota}</span>}
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">{children}</div>
    </section>
  );
}

function Cartao({ rotulo, valor, dica, destaque, alerta, onClick, ativo }: { rotulo: string; valor: string; dica?: string; destaque?: boolean; alerta?: boolean; onClick?: () => void; ativo?: boolean }) {
  return (
    <div
      title={dica}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`rounded-lg border px-3 py-3 ${onClick ? "cursor-pointer hover:bg-neutral-50 " : ""}${ativo ? "ring-2 ring-accent " : ""}${alerta ? "border-red-300 bg-red-50" : destaque ? "border-accent/40 bg-accent/5" : "border-neutral-200 bg-surface"}`}>
      <p className="text-[11px] text-neutral-500">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${alerta ? "text-red-800" : ""}`}>{valor}</p>
      {dica && <p className="mt-0.5 text-[10px] leading-tight text-neutral-400">{dica}</p>}
    </div>
  );
}

function Tabela({ titulo, colunas, linhas, vazio, rodape }: { titulo: string; colunas: string[]; linhas: string[][]; vazio: string; rodape?: string }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold">{titulo}</h2>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-xs text-neutral-500">
            <tr>
              {colunas.map((c, i) => (
                <th key={c} className={`px-3 py-2 font-medium ${i === 0 ? "text-left" : "text-right"}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 && (
              <tr>
                <td colSpan={colunas.length} className="px-3 py-5 text-center text-neutral-400">{vazio}</td>
              </tr>
            )}
            {linhas.map((l, i) => (
              <tr key={i} className="border-t border-neutral-100">
                {l.map((cel, j) => (
                  <td key={j} className={`px-3 py-2 ${j === 0 ? "text-left" : "text-right tabular-nums"}`}>{cel}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rodape && <p className="mt-1.5 text-[11px] text-neutral-500">{rodape}</p>}
    </div>
  );
}

/** Barras do faturamento por dia, em SVG puro. Dias zerados entram (o site manda a série completa). */
function GraficoDiario({ serie }: { serie: PainelV1["serieDiaria"] }) {
  const max = useMemo(() => Math.max(1, ...serie.map((s) => s.faturamentoCents)), [serie]);
  if (serie.length === 0) return <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-6 text-center text-sm text-neutral-400">Sem dados no período.</p>;
  const W = 720;
  const H = 180;
  const margem = { esq: 8, dir: 8, topo: 10, base: 22 };
  const largura = (W - margem.esq - margem.dir) / serie.length;
  const barra = Math.max(1, largura * 0.72);
  const curto = (iso: string) => iso.slice(8) + "/" + iso.slice(5, 7);
  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full min-w-[480px]" role="img" aria-label="Faturamento por dia">
        <line x1={margem.esq} x2={W - margem.dir} y1={H - margem.base} y2={H - margem.base} stroke="currentColor" className="text-neutral-300" />
        {serie.map((s, i) => {
          const h = ((H - margem.base - margem.topo) * s.faturamentoCents) / max;
          const x = margem.esq + i * largura + (largura - barra) / 2;
          return (
            <rect key={s.dia} x={x} y={H - margem.base - h} width={barra} height={Math.max(h, s.faturamentoCents > 0 ? 1 : 0)} rx={1.5} className="fill-accent">
              <title>{`${curto(s.dia)}: ${brl(s.faturamentoCents)} · ${s.pedidos} pedido(s)`}</title>
            </rect>
          );
        })}
        <text x={margem.esq} y={H - 6} fontSize="10" className="fill-neutral-500">{curto(serie[0].dia)}</text>
        <text x={W - margem.dir} y={H - 6} fontSize="10" textAnchor="end" className="fill-neutral-500">{curto(serie[serie.length - 1].dia)}</text>
        <text x={W - margem.dir} y={margem.topo + 4} fontSize="10" textAnchor="end" className="fill-neutral-500">{`máx. ${brl(max)}`}</text>
      </svg>
    </div>
  );
}

type Whatsapp = { id: string; quando: number; status: string; erro: string | null; tipo: string; pedido: string | null; contato: string; telefone: string; texto: string; conversationId: string };
const ROTULO_ENVIO: Record<string, string> = { PENDING: "Na fila", SENT: "Enviada", DELIVERED: "Entregue", READ: "Lida", FAILED: "Falhou" };
const quandoBR = (ms: number) => new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: FUSO });

/** Os WhatsApps que o site mandou, lidos do Inbox: quando, para quem, o quê, e se chegou. */
function DetalheWhatsapps({ de, ate, soFalhas }: { de: string; ate: string; soFalhas: boolean }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const { data, error, isLoading } = useSWR<{ mensagens: Whatsapp[] }>(
    `/api/painel-ecommerce/whatsapps?de=${de}&ate=${ate}${soFalhas ? "&falhas=1" : ""}`,
    async (u: string) => {
      const r = await fetch(u);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j) throw new Error(typeof j?.error === "string" ? j.error : "Não deu para carregar as mensagens.");
      return j;
    },
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  const lista = data?.mensagens ?? [];
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">{soFalhas ? "WhatsApps do site que falharam" : "WhatsApps enviados pelo site"}</h2>
      {isLoading && <p className="text-sm text-neutral-500">Carregando…</p>}
      {error && <p role="alert" className="text-sm text-red-700">{(error as Error).message}</p>}
      {data && lista.length === 0 && <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-5 text-center text-sm text-neutral-400">Nenhuma mensagem no período.</p>}
      {lista.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Quando</th>
                <th className="px-3 py-2 text-left font-medium">Para</th>
                <th className="px-3 py-2 text-left font-medium">Mensagem</th>
                <th className="px-3 py-2 text-left font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id} className="border-t border-neutral-100 align-top">
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{quandoBR(m.quando)}</td>
                  <td className="px-3 py-2">
                    <a href={`/inbox?open=${m.conversationId}`} className="font-medium hover:underline">{m.contato}</a>
                    <p className="text-[11px] text-neutral-500">{m.telefone}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{m.tipo}{m.pedido ? ` · pedido #${m.pedido}` : ""}</p>
                    <button onClick={() => setAberta(aberta === m.id ? null : m.id)} className="text-[11px] text-accent hover:underline">{aberta === m.id ? "ocultar texto" : "ver texto"}</button>
                    {aberta === m.id && <p className="mt-1 max-w-xl whitespace-pre-wrap rounded-md bg-neutral-50 p-2 text-xs">{m.texto}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={m.status === "FAILED" ? "text-red-700" : ""}>{ROTULO_ENVIO[m.status] ?? m.status}</span>
                    {m.erro && <p className="max-w-[16rem] text-[11px] text-red-700">{m.erro}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-neutral-500">Lido do Inbox: só o que o site mandou pela integração, até 300 mensagens, as mais recentes primeiro.</p>
    </section>
  );
}
