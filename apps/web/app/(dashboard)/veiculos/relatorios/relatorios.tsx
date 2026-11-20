"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { brl, fetcher, secao } from "../comum";

const ABAS = [
  { id: "estoque", rotulo: "Estoque" },
  { id: "visitas", rotulo: "Visitas no site" },
  { id: "integracao", rotulo: "Integração" },
  { id: "desempenho", rotulo: "Desempenho por veículo" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

const STATUS: Record<string, string> = { PREPARACAO: "Em preparação", DISPONIVEL: "À venda", RESERVADO: "Reservado" };

/** Veículos > Relatórios, no jeito do AutoCerto: Estoque, Visitas no site, Integração e Desempenho por veículo. */
export function RelatoriosVeiculos() {
  const params = useSearchParams();
  const router = useRouter();
  const aba = (ABAS.find((a) => a.id === params.get("aba"))?.id ?? "estoque") as Aba;
  const dias = [7, 30, 90].includes(Number(params.get("dias"))) ? Number(params.get("dias")) : 30;
  const ir = (a: Aba, d = dias) => router.replace(`/veiculos/relatorios?aba=${a}&dias=${d}`);
  const comPeriodo = aba === "visitas" || aba === "desempenho";
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-1 border-b border-neutral-200 text-sm" aria-label="Relatórios">
          {ABAS.map((a) => (
            <button key={a.id} type="button" onClick={() => ir(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 ${aba === a.id ? "border-accent font-medium text-accent" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
              {a.rotulo}
            </button>
          ))}
        </nav>
        {comPeriodo && (
          <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs">
            {[7, 30, 90].map((d) => (
              <button key={d} type="button" onClick={() => ir(aba, d)} className={`px-3 py-1.5 ${dias === d ? "bg-neutral-100 font-semibold" : ""}`}>{d} dias</button>
            ))}
          </div>
        )}
      </div>
      {aba === "estoque" && <Estoque />}
      {aba === "visitas" && <Visitas dias={dias} />}
      {aba === "integracao" && <Integracao />}
      {aba === "desempenho" && <Desempenho dias={dias} />}
    </div>
  );
}

function Cartao({ titulo, valor, detalhe, alerta }: { titulo: string; valor: React.ReactNode; detalhe?: React.ReactNode; alerta?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4">
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className={`mt-1 text-2xl font-bold ${alerta ? "text-amber-700" : ""}`}>{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-neutral-500">{detalhe}</p>}
    </div>
  );
}

const Carregando = () => <p className="text-sm text-neutral-500">Carregando…</p>;
const th = "px-3 py-2 text-left text-xs font-medium text-neutral-500";
const td = "px-3 py-2";

// ---- Estoque ----

type LinhaEstoque = { id: string; nome: string; placa: string | null; status: string; dias: number; km: number | null; precoCents: number; fipeCents: number | null; custoCents: number; margemCents: number | null; fotos: number; naVitrine: boolean; portais: string[] };
type DadosEstoque = { linhas: LinhaEstoque[]; total: number; porStatus: Record<string, number>; valorAVendaCents: number; custoCents: number; idadeMedia: number; parados90: number; semFotos: number };

function Estoque() {
  const { data } = useSWR<DadosEstoque>("/api/veiculos/relatorios?tipo=estoque", fetcher);
  if (!data) return <Carregando />;
  return (
    <div className="flex flex-col gap-4" data-testid="relatorio-estoque">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Carros no pátio" valor={data.total} detalhe={`${data.porStatus.DISPONIVEL ?? 0} à venda · ${data.porStatus.PREPARACAO ?? 0} em preparação · ${data.porStatus.RESERVADO ?? 0} reservados`} />
        <Cartao titulo="Valor à venda" valor={brl(data.valorAVendaCents)} detalhe={`custo lançado: ${brl(data.custoCents)}`} />
        <Cartao titulo="Idade média" valor={`${data.idadeMedia} dias`} detalhe={`${data.parados90} carro(s) com 90 dias ou mais`} alerta={data.parados90 > 0} />
        <Cartao titulo="Sem fotos" valor={data.semFotos} detalhe="não aparecem bem no site nem nos portais" alerta={data.semFotos > 0} />
      </div>
      <section className={secao}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Carros no pátio (do mais antigo ao mais novo)</h3>
          <a href="/api/veiculos/relatorios?tipo=estoque&formato=csv" className="text-sm font-medium text-accent hover:underline">Baixar planilha (CSV)</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-neutral-200">
              <tr><th className={th}>Veículo</th><th className={th}>Situação</th><th className={`${th} text-right`}>Dias</th><th className={`${th} text-right`}>Km</th><th className={`${th} text-right`}>Preço</th><th className={`${th} text-right`}>FIPE</th><th className={`${th} text-right`}>Custo</th><th className={`${th} text-right`}>Margem</th><th className={`${th} text-right`}>Fotos</th><th className={th}>Portais</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {data.linhas.map((l) => (
                <tr key={l.id}>
                  <td className={td}><Link href={`/veiculos/${l.id}`} className="font-medium hover:underline">{l.nome}</Link>{l.placa && <span className="block text-xs text-neutral-500">{l.placa}</span>}</td>
                  <td className={td}>{STATUS[l.status] ?? l.status}</td>
                  <td className={`${td} text-right ${l.dias >= 90 ? "font-semibold text-amber-700" : ""}`}>{l.dias}</td>
                  <td className={`${td} text-right`}>{l.km == null ? <span className="text-amber-700">—</span> : l.km.toLocaleString("pt-BR")}</td>
                  <td className={`${td} text-right`}>{l.precoCents ? brl(l.precoCents) : <span className="text-amber-700">sem preço</span>}</td>
                  <td className={`${td} text-right text-neutral-500`}>{l.fipeCents ? brl(l.fipeCents) : "—"}</td>
                  <td className={`${td} text-right text-neutral-500`}>{l.custoCents ? brl(l.custoCents) : "—"}</td>
                  <td className={`${td} text-right ${l.margemCents != null && l.margemCents < 0 ? "text-red-600" : ""}`}>{l.margemCents == null ? "—" : brl(l.margemCents)}</td>
                  <td className={`${td} text-right ${l.fotos === 0 ? "text-amber-700" : ""}`}>{l.fotos}</td>
                  <td className={`${td} text-xs text-neutral-600`}>{l.portais.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ---- Visitas no site ----

type N = { visitas: number; whatsapp: number; formularios: number };
type DadosVisitas = { dias: number; porDia: ({ dia: string } & N)[]; totais: N; variacao: number | null; conversao: number | null; maisVistos: ({ id: string; nome: string } & N)[] };

function Visitas({ dias }: { dias: number }) {
  const { data } = useSWR<DadosVisitas>(`/api/veiculos/relatorios?tipo=visitas&dias=${dias}`, fetcher);
  if (!data) return <Carregando />;
  const max = Math.max(1, ...data.porDia.map((d) => d.visitas));
  return (
    <div className="flex flex-col gap-4" data-testid="relatorio-visitas">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Visitas" valor={data.totais.visitas.toLocaleString("pt-BR")} detalhe={data.variacao == null ? `últimos ${dias} dias` : `${data.variacao >= 0 ? "+" : ""}${data.variacao}% em relação aos ${dias} dias anteriores`} />
        <Cartao titulo="Cliques no WhatsApp" valor={data.totais.whatsapp.toLocaleString("pt-BR")} />
        <Cartao titulo="Formulários enviados" valor={data.totais.formularios.toLocaleString("pt-BR")} detalhe="proposta, financiamento e venda seu carro" />
        <Cartao titulo="Viraram contato" valor={data.conversao == null ? "—" : `${data.conversao.toLocaleString("pt-BR")}%`} detalhe="das visitas, clicaram no WhatsApp ou mandaram formulário" />
      </div>
      <section className={secao}>
        <h3 className="text-sm font-semibold">Visitas por dia</h3>
        {data.totais.visitas === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma visita contada ainda. A contagem começou com esta versão do Zap; os números aparecem conforme o site recebe visitas.</p>
        ) : (
          <div className="flex h-40 items-end gap-[2px]" role="img" aria-label={`Visitas por dia nos últimos ${dias} dias`}>
            {data.porDia.map((d) => (
              <div key={d.dia} className="group relative flex-1">
                <div className="rounded-t bg-accent/70 transition group-hover:bg-accent" style={{ height: `${Math.max(2, (d.visitas / max) * 150)}px` }} />
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-neutral-900 px-2 py-1 text-[11px] text-white group-hover:block">
                  {d.dia.split("-").reverse().slice(0, 2).join("/")}: {d.visitas} visita(s), {d.whatsapp} WhatsApp
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      <section className={secao}>
        <h3 className="text-sm font-semibold">Carros mais vistos</h3>
        {data.maisVistos.length === 0 ? <p className="text-sm text-neutral-500">Ainda sem visitas em páginas de carro.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200"><tr><th className={th}>Veículo</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>WhatsApp</th><th className={`${th} text-right`}>Formulários</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {data.maisVistos.map((c) => (
                <tr key={c.id}><td className={td}><Link href={`/veiculos/${c.id}`} className="hover:underline">{c.nome}</Link></td><td className={`${td} text-right font-semibold`}>{c.visitas}</td><td className={`${td} text-right`}>{c.whatsapp}</td><td className={`${td} text-right`}>{c.formularios}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ---- Integração ----

type DadosIntegracao = {
  aVenda: number;
  portais: { portal: string; nome: string; conectado: boolean; situacaoConta: string | null; publicados: number; naFila: number; comErro: number; foraDoPortal: number }[];
  erros: { veiculoId: string; nome: string; placa: string | null; portal: string; erro: string }[];
};

function Integracao() {
  const { data } = useSWR<DadosIntegracao>("/api/veiculos/relatorios?tipo=integracao", fetcher);
  if (!data) return <Carregando />;
  return (
    <div className="flex flex-col gap-4" data-testid="relatorio-integracao">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.portais.map((p) => (
          <div key={p.portal} className="rounded-lg border border-neutral-200 bg-surface p-4 text-sm">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{p.nome}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${p.conectado ? "bg-emerald-500/10 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{p.conectado ? "Conectado" : p.situacaoConta ? "Com problema" : "Não conectado"}</span>
            </div>
            <p className="mt-2 text-2xl font-bold">{p.publicados}</p>
            <p className="text-xs text-neutral-500">anúncio(s) no ar</p>
            <ul className="mt-2 flex flex-col gap-0.5 text-xs text-neutral-600">
              <li>{p.naFila} na fila de envio</li>
              <li className={p.comErro ? "font-semibold text-red-600" : ""}>{p.comErro} com erro</li>
              <li>{p.foraDoPortal} de {data.aVenda} à venda fora deste portal</li>
            </ul>
          </div>
        ))}
      </div>
      <section className={secao}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Anúncios com erro</h3>
          <Link href="/veiculos/portais" className="text-sm text-accent hover:underline">Abrir Portais →</Link>
        </div>
        {data.erros.length === 0 ? <p className="text-sm text-neutral-500">Nenhum anúncio com erro.</p> : (
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200"><tr><th className={th}>Veículo</th><th className={th}>Portal</th><th className={th}>O que o portal disse</th></tr></thead>
            <tbody className="divide-y divide-neutral-100">
              {data.erros.map((e) => (
                <tr key={`${e.veiculoId}-${e.portal}`}><td className={td}><Link href={`/veiculos/${e.veiculoId}`} className="hover:underline">{e.nome}</Link>{e.placa && <span className="block text-xs text-neutral-500">{e.placa}</span>}</td><td className={td}>{e.portal}</td><td className={`${td} text-red-700`}>{e.erro}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// ---- Desempenho por veículo ----

type DadosDesempenho = { dias: number; linhas: { id: string; nome: string; status: string; dias: number; precoCents: number; visitas: number; whatsapp: number; formularios: number; leadsPortais: number; contatos: number; alerta: string | null }[] };

function Desempenho({ dias }: { dias: number }) {
  const { data } = useSWR<DadosDesempenho>(`/api/veiculos/relatorios?tipo=desempenho&dias=${dias}`, fetcher);
  if (!data) return <Carregando />;
  const alertas = data.linhas.filter((l) => l.alerta).length;
  return (
    <div className="flex flex-col gap-4" data-testid="relatorio-desempenho">
      <p className="text-sm text-neutral-500">Carros à venda nos últimos {dias} dias: visitas no site, cliques no WhatsApp, formulários e leads dos portais. {alertas > 0 && <strong className="text-amber-700">{alertas} carro(s) pedem atenção.</strong>}</p>
      <section className={`${secao} overflow-x-auto`}>
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-neutral-200">
            <tr><th className={th}>Veículo</th><th className={`${th} text-right`}>Dias no pátio</th><th className={`${th} text-right`}>Preço</th><th className={`${th} text-right`}>Visitas</th><th className={`${th} text-right`}>WhatsApp</th><th className={`${th} text-right`}>Formulários</th><th className={`${th} text-right`}>Leads portais</th><th className={`${th} text-right`}>Contatos</th></tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {data.linhas.map((l) => (
              <tr key={l.id} className={l.alerta ? "bg-amber-500/5" : ""}>
                <td className={td}><Link href={`/veiculos/${l.id}`} className="font-medium hover:underline">{l.nome}</Link>{l.alerta && <span className="block text-xs text-amber-700">{l.alerta}</span>}</td>
                <td className={`${td} text-right`}>{l.dias}</td>
                <td className={`${td} text-right`}>{brl(l.precoCents)}</td>
                <td className={`${td} text-right`}>{l.visitas}</td>
                <td className={`${td} text-right`}>{l.whatsapp}</td>
                <td className={`${td} text-right`}>{l.formularios}</td>
                <td className={`${td} text-right`}>{l.leadsPortais}</td>
                <td className={`${td} text-right font-semibold`}>{l.contatos}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.linhas.length === 0 && <p className="text-sm text-neutral-500">Nenhum carro à venda.</p>}
      </section>
    </div>
  );
}
