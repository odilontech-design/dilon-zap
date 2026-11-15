"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, brl, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";

type Carro = { id: string; nome: string; precoCents: number; capaId: string | null };
type Banner = { id: string; titulo: string | null; link: string | null; ativo: boolean; temCelular: boolean };
type Dados = {
  painel: {
    site: { noAr: boolean; endereco: string; dominio: string | null };
    veiculosNoSite: number;
    contatos30d: number;
    variacao: number | null;
    formularios: { anuncio: number; financiamento: number; vendaSeuCarro: number };
    atencao: { texto: string; aba?: string }[];
    alteracoes: { id: string; quem: string; oQue: string; quando: string }[];
  };
  destaques: string[];
  ofertaVeiculoId: string | null;
  quemSomosTitulo: string;
  quemSomosTexto: string;
  sobre: string;
  instagram: string;
  facebook: string;
  siteAtual: string;
  banners: Banner[];
  carros: Carro[];
};

const ABAS = [
  { id: "inicio", rotulo: "Início" },
  { id: "banners", rotulo: "Banners" },
  { id: "destaques", rotulo: "Destaques e ofertas" },
  { id: "paginas", rotulo: "Páginas" },
  { id: "dados", rotulo: "Dados da loja" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "avancado", rotulo: "Avançado" },
  { id: "configuracoes", rotulo: "Aparência e domínio" },
] as const;
type Aba = (typeof ABAS)[number]["id"];

async function chamar(url: string, metodo: string, corpo?: object | FormData): Promise<string | null> {
  const r = await fetch(url, { method: metodo, ...(corpo instanceof FormData ? { body: corpo } : corpo ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) } : {}) });
  return r.ok ? null : erroDaResposta(r);
}

/** "Meu site": o painel do site da loja e as abas para mudar o que aparece nele (no jeito do AutoCerto). */
export function MeuSite() {
  const { data, mutate } = useSWR<Dados>("/api/veiculos/site", fetcher);
  const params = useSearchParams();
  const router = useRouter();
  const aba = (ABAS.find((a) => a.id === params.get("aba"))?.id ?? "inicio") as Aba;
  const ir = (a: Aba) => (a === "configuracoes" ? router.push("/veiculos/configuracoes") : router.replace(`/veiculos/site?aba=${a}`));
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Meu site</h2>
          <p className="text-sm text-neutral-500">Como está o site da loja agora e o que precisa de atenção.</p>
        </div>
        <a href={data.painel.site.endereco} target="_blank" rel="noreferrer" className={botaoPrimario}>Ver meu site</a>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-neutral-200 text-sm" aria-label="Abas do Meu site">
        {ABAS.map((a) => (
          <button key={a.id} type="button" onClick={() => ir(a.id)} aria-current={aba === a.id ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 ${aba === a.id ? "border-accent font-medium text-accent" : "border-transparent text-neutral-500 hover:text-neutral-800"}`}>
            {a.rotulo}
          </button>
        ))}
      </nav>
      {aba === "inicio" && <Inicio d={data} ir={ir} />}
      {aba === "inicio" && <TrazerDoSite d={data} recarregar={mutate} />}
      {aba === "banners" && <Banners d={data} recarregar={mutate} />}
      {aba === "destaques" && <Destaques d={data} recarregar={mutate} />}
      {aba === "paginas" && <Paginas d={data} recarregar={mutate} />}
      {(aba === "dados" || aba === "whatsapp" || aba === "avancado") && <AbasDaLoja aba={aba} recarregar={mutate} />}
    </div>
  );
}

function Cartao({ titulo, valor, detalhe }: { titulo: string; valor: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-4">
      <p className="text-xs font-medium text-neutral-500">{titulo}</p>
      <p className="mt-1 text-2xl font-bold">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-neutral-500">{detalhe}</p>}
    </div>
  );
}

function Inicio({ d, ir }: { d: Dados; ir: (a: Aba) => void }) {
  const p = d.painel;
  const max = Math.max(1, p.formularios.anuncio, p.formularios.financiamento, p.formularios.vendaSeuCarro);
  const barras: [string, number][] = [["Proposta no anúncio", p.formularios.anuncio], ["Ficha de financiamento", p.formularios.financiamento], ["Venda seu carro", p.formularios.vendaSeuCarro]];
  return (
    <div className="flex flex-col gap-4" data-testid="site-inicio">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cartao titulo="Site" valor={<span className={p.site.noAr ? "text-emerald-700" : "text-red-600"}>{p.site.noAr ? "No ar" : "Desligado"}</span>} detalhe={p.site.dominio ?? p.site.endereco.replace(/^https?:\/\//, "")} />
        <Cartao titulo="Domínio" valor={p.site.dominio ? "Próprio" : "Do Zap"} detalhe={p.site.dominio ? p.site.dominio : "Cadastre o domínio da loja em Aparência, dados e domínio"} />
        <Cartao titulo="Veículos no site" valor={p.veiculosNoSite} detalhe="à venda agora" />
        <Cartao titulo="Contatos pelo site" valor={p.contatos30d} detalhe={`nos últimos 30 dias${p.variacao !== null ? ` · ${p.variacao >= 0 ? "+" : ""}${p.variacao}% em relação aos 30 dias anteriores` : ""}`} />
      </div>
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <section className={secao}>
          <h3 className="text-sm font-semibold">Precisa de atenção</h3>
          {p.atencao.length === 0 ? (
            <p className="text-sm text-neutral-500">Nada precisa de atenção agora.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {p.atencao.map((a) => (
                <li key={a.texto} className="flex items-start justify-between gap-3 rounded-md bg-amber-500/10 px-3 py-2 text-amber-800">
                  <span>{a.texto}</span>
                  {a.aba && <button type="button" onClick={() => ir(a.aba as Aba)} className="shrink-0 text-xs font-medium underline">Resolver</button>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={secao}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Contatos do site por formulário</h3>
            <span className="text-xs text-neutral-500">Últimos 30 dias</span>
          </div>
          <ul className="flex flex-col gap-2 text-sm">
            {barras.map(([nome, n]) => (
              <li key={nome} className="grid grid-cols-[1fr_2fr_auto] items-center gap-3">
                <span className="text-neutral-600">{nome}</span>
                <span className="h-2 rounded-full bg-neutral-100"><span className="block h-2 rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} /></span>
                <span className="font-semibold">{n}</span>
              </li>
            ))}
          </ul>
          <Link href="/crm" className="text-right text-xs font-medium text-accent hover:underline">Ver no CRM →</Link>
        </section>
      </div>
      <section className={secao}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Últimas alterações</h3>
          <span className="text-xs text-neutral-500">Quem mudou o quê no site</span>
        </div>
        {p.alteracoes.length === 0 ? (
          <p className="text-sm text-neutral-500">Nenhuma alteração no site ainda.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 text-sm">
            {p.alteracoes.map((a) => (
              <li key={a.id} className="flex justify-between gap-3 py-2">
                <span>{a.oQue} <span className="text-neutral-500">· {a.quem}</span></span>
                <span className="text-xs text-neutral-500">{new Date(a.quando).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

type Trazido = {
  banners: { achados: number; trazidos: number; jaTinha: number; falhas: string[] };
  ofertas: { achadas: number; noZap: number; aplicadas: boolean; motivo?: string };
  quemSomos: { achado: boolean; aplicado: boolean; motivo?: string };
};

/** Copia do site que a loja já tem (AutoCerto) os banners, as últimas ofertas e o Quem somos. */
function TrazerDoSite({ d, recarregar }: { d: Dados; recarregar: () => void }) {
  const [endereco, setEndereco] = useState(d.siteAtual);
  const [substituir, setSubstituir] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Trazido | null>(null);
  const trazer = async () => {
    setRodando(true);
    setErro(null);
    setR(null);
    const resp = await fetch("/api/veiculos/site/trazer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endereco: endereco || null, substituir }) });
    setRodando(false);
    if (!resp.ok) return setErro(await erroDaResposta(resp));
    setR(await resp.json());
    recarregar();
  };
  return (
    <section className={secao} data-testid="site-trazer">
      <h3 className="text-sm font-semibold">Trazer do site atual</h3>
      <p className="text-xs text-neutral-500">Copia do site que a loja já tem os banners do topo, os carros de “Últimas ofertas” e o texto do “Quem somos”. Nada é apagado: banner já trazido não vem de novo, e destaques e Quem somos só são preenchidos se estiverem vazios. Para as ofertas aparecerem, importe antes o estoque do site (Veículos → Importar).</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1"><span className={rotulo}>Endereço do site atual</span><input className={campo} value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="www.sualoja.com.br" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={substituir} onChange={(e) => setSubstituir(e.target.checked)} /> Substituir destaques e Quem somos</label>
        <button type="button" className={botaoPrimario} disabled={rodando || !endereco.trim()} onClick={trazer}>{rodando ? "Trazendo…" : "Trazer do site atual"}</button>
      </div>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {r && (
        <ul className="flex flex-col gap-1 text-sm">
          <li>Banners: {r.banners.achados === 0 ? "nenhum encontrado no site." : `${r.banners.trazidos} trazido(s)${r.banners.jaTinha ? `, ${r.banners.jaTinha} já estavam aqui` : ""} de ${r.banners.achados}.`}{r.banners.falhas.length > 0 && <span className="text-red-600"> Não vieram: {r.banners.falhas.join("; ")}.</span>}</li>
          <li>Últimas ofertas: {r.ofertas.achadas === 0 ? "nenhuma encontrada no site." : r.ofertas.aplicadas ? `${r.ofertas.noZap} de ${r.ofertas.achadas} carro(s) postos em destaque.` : `${r.ofertas.achadas} encontrada(s), ${r.ofertas.noZap} no Zap — ${r.ofertas.motivo}.`}</li>
          <li>Quem somos: {r.quemSomos.aplicado ? "texto trazido (confira na aba Páginas)." : r.quemSomos.motivo ? `${r.quemSomos.motivo}.` : "não encontrado no site."}</li>
        </ul>
      )}
    </section>
  );
}

function Banners({ d, recarregar }: { d: Dados; recarregar: () => void }) {
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const acao = async (url: string, metodo: string, corpo?: object) => {
    setAviso(null);
    const erro = await chamar(url, metodo, corpo);
    if (erro) setAviso({ texto: erro, erro: true });
    recarregar();
  };
  return (
    <div className="flex flex-col gap-4" data-testid="site-banners">
      <section className={secao}>
        <h3 className="text-sm font-semibold">Enviar banner</h3>
        <p className="text-xs text-neutral-500">As imagens que passam no topo da página inicial. Computador: 1920 × 600 px (ou proporção parecida). Celular, opcional: 800 × 800 px. PNG, JPG ou WEBP, até 6 MB.</p>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            setEnviando(true);
            setAviso(null);
            const erro = await chamar("/api/veiculos/site/banners", "POST", new FormData(form));
            setEnviando(false);
            if (erro) return setAviso({ texto: erro, erro: true });
            form.reset();
            setAviso({ texto: "Banner enviado. Ele já aparece no site." });
            recarregar();
          }}
        >
          <label className="flex flex-col gap-1"><span className={rotulo}>Imagem do computador</span><input name="desktop" type="file" accept="image/png,image/jpeg,image/webp" required className="text-sm" /></label>
          <label className="flex flex-col gap-1"><span className={rotulo}>Imagem do celular (opcional)</span><input name="celular" type="file" accept="image/png,image/jpeg,image/webp" className="text-sm" /></label>
          <label className="flex flex-col gap-1"><span className={rotulo}>Título (para a equipe e para quem usa leitor de tela)</span><input name="titulo" maxLength={120} placeholder="Ofertas da semana" className={campo} /></label>
          <label className="flex flex-col gap-1"><span className={rotulo}>Leva para (opcional)</span><input name="link" maxLength={500} placeholder="/financiamento ou https://…" className={campo} /></label>
          <div className="sm:col-span-2"><button className={botaoPrimario} disabled={enviando}>{enviando ? "Enviando…" : "Enviar banner"}</button></div>
        </form>
        {aviso && <p className={`text-sm ${aviso.erro ? "text-red-600" : "text-accent"}`}>{aviso.texto}</p>}
      </section>
      <section className={secao}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">No seu site agora</h3>
          <span className="text-xs text-neutral-500">{d.banners.length} banner(s) · use as setas para mudar a ordem</span>
        </div>
        {d.banners.length === 0 && <p className="text-sm text-neutral-500">Nenhum banner. Sem banner, o topo do site mostra a abertura com a busca.</p>}
        <ul className="flex flex-col gap-2">
          {d.banners.map((b, i) => (
            <li key={b.id} className={`flex flex-wrap items-center gap-3 rounded-lg border p-2 ${b.ativo ? "border-neutral-200" : "border-dashed border-neutral-300 opacity-60"}`}>
              <div className="flex flex-col">
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => acao(`/api/veiculos/site/banners/${b.id}`, "PUT", { mover: "cima" })} className="px-1 text-neutral-500 disabled:opacity-30">▲</button>
                <button type="button" aria-label="Descer" disabled={i === d.banners.length - 1} onClick={() => acao(`/api/veiculos/site/banners/${b.id}`, "PUT", { mover: "baixo" })} className="px-1 text-neutral-500 disabled:opacity-30">▼</button>
              </div>
              <span className="text-xs text-neutral-400">{i + 1}</span>
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">{b.titulo || "Banner sem título"}</p>
                <p className="text-xs text-neutral-500">Leva para: {b.link || "só imagem"} · {b.temCelular ? "com versão de celular" : "mesma imagem no celular"}</p>
              </div>
              <button type="button" className={botaoSecundario} onClick={() => acao(`/api/veiculos/site/banners/${b.id}`, "PUT", { ativo: !b.ativo })}>{b.ativo ? "Tirar do ar" : "Pôr no ar"}</button>
              <button type="button" className={botaoSecundario} onClick={() => confirm("Apagar este banner?") && acao(`/api/veiculos/site/banners/${b.id}`, "DELETE")}>Apagar</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Destaques({ d, recarregar }: { d: Dados; recarregar: () => void }) {
  const [lista, setLista] = useState<string[]>(d.destaques);
  const [oferta, setOferta] = useState<string>(d.ofertaVeiculoId ?? "");
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  useEffect(() => { setLista(d.destaques); setOferta(d.ofertaVeiculoId ?? ""); }, [d.destaques, d.ofertaVeiculoId]);
  const porId = new Map(d.carros.map((c) => [c.id, c]));
  const mover = (i: number, j: number) => setLista((l) => { const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const capa = (c: Carro) => (c.capaId ? <img src={`/api/veiculos/fotos/${c.capaId}`} alt="" className="h-12 w-16 shrink-0 rounded object-cover" /> : <span className="h-12 w-16 shrink-0 rounded bg-neutral-100" />);
  return (
    <div className="flex flex-col gap-4" data-testid="site-destaques">
      <section className={secao}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Veículos em destaque</h3>
          <span className="text-xs text-neutral-500">até 8 na página inicial · {lista.length}/8</span>
        </div>
        {lista.length === 0 && <p className="text-sm text-neutral-500">Nenhum destaque: a página inicial mostra só a lista de carros.</p>}
        <ol className="grid gap-2 sm:grid-cols-2">
          {lista.map((id, i) => {
            const c = porId.get(id);
            return (
              <li key={id} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2 text-sm">
                <span className="w-4 text-xs text-neutral-400">{i + 1}</span>
                {c ? capa(c) : <span className="h-12 w-16 rounded bg-red-500/10" />}
                <span className="min-w-0 flex-1 truncate">{c ? c.nome : "Carro que já não está à venda"}</span>
                <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(i, i - 1)} className="px-1 disabled:opacity-30">▲</button>
                <button type="button" aria-label="Descer" disabled={i === lista.length - 1} onClick={() => mover(i, i + 1)} className="px-1 disabled:opacity-30">▼</button>
                <button type="button" aria-label="Tirar dos destaques" onClick={() => setLista((l) => l.filter((x) => x !== id))} className="px-1 text-red-600">✕</button>
              </li>
            );
          })}
        </ol>
      </section>
      <section className={secao}>
        <h3 className="text-sm font-semibold">Oferta que abre ao entrar no site</h3>
        <p className="text-xs text-neutral-500">Uma janela com um carro, mostrada uma vez por visita. Deixe sem para não abrir nada.</p>
        <select className={`${campo} max-w-md`} value={oferta} onChange={(e) => setOferta(e.target.value)}>
          <option value="">Sem oferta ao entrar</option>
          {d.carros.map((c) => <option key={c.id} value={c.id}>{c.nome} · {brl(c.precoCents)}</option>)}
        </select>
      </section>
      <div className="flex items-center gap-3">
        <button className={botaoPrimario} onClick={async () => { setAviso(null); const erro = await chamar("/api/veiculos/site", "PUT", { destaques: lista, ofertaVeiculoId: oferta || null }); setAviso(erro ? { texto: erro, erro: true } : { texto: "Destaques e oferta salvos. Já aparecem no site." }); recarregar(); }}>Salvar destaques e oferta</button>
        {aviso && <span className={`text-sm ${aviso.erro ? "text-red-600" : "text-accent"}`}>{aviso.texto}</span>}
      </div>
      <section className={secao}>
        <h3 className="text-sm font-semibold">Carros à venda</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {d.carros.filter((c) => !lista.includes(c.id)).map((c) => (
            <li key={c.id} className="flex items-center gap-2 rounded-lg border border-neutral-200 p-2 text-sm">
              {capa(c)}
              <span className="min-w-0 flex-1"><span className="block truncate">{c.nome}</span><span className="text-xs text-neutral-500">{brl(c.precoCents)}</span></span>
              <button type="button" className={botaoSecundario} disabled={lista.length >= 8} onClick={() => setLista((l) => [...l, c.id])}>Destacar</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Paginas({ d, recarregar }: { d: Dados; recarregar: () => void }) {
  const [f, setF] = useState({ quemSomosTitulo: d.quemSomosTitulo, quemSomosTexto: d.quemSomosTexto || d.sobre, instagram: d.instagram, facebook: d.facebook });
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const salvar = async () => {
    setAviso(null);
    const erro = await chamar("/api/veiculos/site", "PUT", { quemSomosTitulo: f.quemSomosTitulo || null, quemSomosTexto: f.quemSomosTexto || null, instagram: f.instagram || null, facebook: f.facebook || null });
    setAviso(erro ? { texto: erro, erro: true } : { texto: "Páginas salvas." });
    recarregar();
  };
  return (
    <div className="flex flex-col gap-4" data-testid="site-paginas">
      <section className={secao}>
        <h3 className="text-sm font-semibold">Para o site todo: redes sociais</h3>
        <label className="flex flex-col gap-1"><span className={rotulo}>Instagram</span><input className={campo} value={f.instagram} onChange={(e) => setF({ ...f, instagram: e.target.value })} placeholder="@sualoja ou https://www.instagram.com/sualoja/" /></label>
        <label className="flex flex-col gap-1"><span className={rotulo}>Facebook</span><input className={campo} value={f.facebook} onChange={(e) => setF({ ...f, facebook: e.target.value })} placeholder="https://www.facebook.com/sualoja" /></label>
      </section>
      <section className={secao}>
        <h3 className="text-sm font-semibold">Quem somos</h3>
        <label className="flex flex-col gap-1"><span className={rotulo}>Título</span><input className={campo} maxLength={200} value={f.quemSomosTitulo} onChange={(e) => setF({ ...f, quemSomosTitulo: e.target.value })} placeholder="Há mais de 20 anos vendendo carros com procedência" /></label>
        <label className="flex flex-col gap-1"><span className={rotulo}>Texto</span><textarea className={`${campo} min-h-[180px]`} maxLength={6000} value={f.quemSomosTexto} onChange={(e) => setF({ ...f, quemSomosTexto: e.target.value })} placeholder="Conte a história da loja, o que a diferencia e por que comprar com vocês." /></label>
      </section>
      <div className="flex items-center gap-3">
        <button className={botaoPrimario} onClick={salvar}>Salvar páginas</button>
        {aviso && <span className={`text-sm ${aviso.erro ? "text-red-600" : "text-accent"}`}>{aviso.texto}</span>}
      </div>
    </div>
  );
}

// ---- Dados da loja, WhatsApp e Avançado ----

type Telefone = { tipo: string; numero: string };
type DadosLoja = {
  cep: string; logradouro: string; bairro: string; cidade: string; uf: string;
  telefones: Telefone[]; mapaAtivo: boolean; ponto: string;
  horarioSemana: string; horarioSabado: string; horarioDomingo: string; horarioAntigo: string;
  whatsapp: string; whatsappMensagem: string;
  metaPixelId: string; ga4Id: string; googleAdsId: string; gtmId: string; dominio: string | null;
};
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

function useSalvar(recarregar: () => void) {
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const salvar = async (corpo: object, ok: string) => {
    setAviso(null);
    setSalvando(true);
    const erro = await chamar("/api/veiculos/site/loja", "PUT", corpo);
    setSalvando(false);
    setAviso(erro ? { texto: erro, erro: true } : { texto: ok });
    recarregar();
  };
  const Aviso = () => (aviso ? <span className={`text-sm ${aviso.erro ? "text-red-600" : "text-accent"}`}>{aviso.texto}</span> : null);
  return { salvar, salvando, Aviso };
}

function AbasDaLoja({ aba, recarregar }: { aba: "dados" | "whatsapp" | "avancado"; recarregar: () => void }) {
  const { data, mutate } = useSWR<DadosLoja>("/api/veiculos/site/loja", fetcher);
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;
  const tudo = () => { mutate(); recarregar(); };
  if (aba === "dados") return <DadosDaLoja d={data} recarregar={tudo} />;
  if (aba === "whatsapp") return <WhatsappDoSite d={data} recarregar={tudo} />;
  return <Avancado d={data} recarregar={tudo} />;
}

function DadosDaLoja({ d, recarregar }: { d: DadosLoja; recarregar: () => void }) {
  const [f, setF] = useState(d);
  const [tels, setTels] = useState<Telefone[]>(d.telefones.length ? d.telefones : [{ tipo: "WHATSAPP", numero: "" }]);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const { salvar, salvando, Aviso } = useSalvar(recarregar);
  const set = (k: keyof DadosLoja) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  // Preenche rua, bairro, cidade e estado pelo CEP (ViaCEP, direto do navegador).
  const buscarCep = async () => {
    const cep = f.cep.replace(/\D/g, "");
    if (cep.length !== 8) return;
    setBuscandoCep(true);
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json()).catch(() => null);
    setBuscandoCep(false);
    if (!r || r.erro) return;
    setF((a) => ({ ...a, logradouro: a.logradouro || r.logradouro || "", bairro: r.bairro || a.bairro, cidade: r.localidade || a.cidade, uf: r.uf || a.uf }));
  };
  const ponto = f.ponto.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]" data-testid="site-dados">
      <div className="flex flex-col gap-4">
        <section className={secao}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Endereço e telefones</h3>
            <span className="text-xs text-neutral-500">Aparecem no topo, no rodapé e na página Localização</span>
          </div>
          <p className="rounded-md bg-sky-500/10 px-3 py-2 text-xs text-sky-800">O CEP e o 1º telefone também vão nos anúncios dos portais (OLX, Webmotors e outros).</p>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <label className="flex flex-col gap-1"><span className={rotulo}>CEP</span><input className={campo} value={f.cep} onChange={set("cep")} onBlur={buscarCep} inputMode="numeric" placeholder="25071-182" /></label>
            <label className="flex flex-col gap-1"><span className={rotulo}>Endereço e número {buscandoCep && <span className="text-neutral-400">· buscando CEP…</span>}</span><input className={campo} value={f.logradouro} onChange={set("logradouro")} placeholder="Av. Brigadeiro Lima e Silva, nº 1120" /></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_100px]">
            <label className="flex flex-col gap-1"><span className={rotulo}>Bairro</span><input className={campo} value={f.bairro} onChange={set("bairro")} /></label>
            <label className="flex flex-col gap-1"><span className={rotulo}>Cidade</span><input className={campo} value={f.cidade} onChange={set("cidade")} /></label>
            <label className="flex flex-col gap-1"><span className={rotulo}>Estado</span><select className={campo} value={f.uf} onChange={set("uf")}><option value="">—</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
          </div>
          <div className="flex flex-col gap-2">
            <span className={rotulo}>Telefones <span className="text-neutral-400">até 3</span></span>
            {tels.map((t, i) => (
              <div key={i} className="flex gap-2">
                <select aria-label="Tipo" className={`${campo} max-w-[150px]`} value={t.tipo} onChange={(e) => setTels(tels.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)))}>
                  <option value="WHATSAPP">WhatsApp</option><option value="CELULAR">Celular</option><option value="FIXO">Fixo</option>
                </select>
                <input aria-label="Número" className={campo} value={t.numero} inputMode="tel" placeholder="(21) 96762-9631" onChange={(e) => setTels(tels.map((x, j) => (j === i ? { ...x, numero: e.target.value } : x)))} />
                <button type="button" aria-label="Tirar telefone" className={botaoSecundario} onClick={() => setTels(tels.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {tels.length < 3 && <button type="button" className={`${botaoSecundario} self-start`} onClick={() => setTels([...tels, { tipo: "WHATSAPP", numero: "" }])}>+ Telefone</button>}
          </div>
        </section>
        <section className={secao}>
          <h3 className="text-sm font-semibold">Horário de funcionamento</h3>
          {d.horarioAntigo && <p className="text-xs text-amber-700">Horário de antes (texto livre): {d.horarioAntigo.replace(/\n/g, " · ")}. Preencha as faixas abaixo para trocar.</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1"><span className={rotulo}>Segunda a sexta</span><input className={campo} value={f.horarioSemana} onChange={set("horarioSemana")} placeholder="8h às 19h" /></label>
            <label className="flex flex-col gap-1"><span className={rotulo}>Sábado</span><input className={campo} value={f.horarioSabado} onChange={set("horarioSabado")} placeholder="8h às 16h" /></label>
            <label className="flex flex-col gap-1"><span className={rotulo}>Domingo</span><input className={campo} value={f.horarioDomingo} onChange={set("horarioDomingo")} placeholder="Fechado" /></label>
          </div>
          <p className="text-xs text-neutral-500">Em branco aparece “Fechado”.</p>
        </section>
        <div className="flex items-center gap-3">
          <button className={botaoPrimario} disabled={salvando} onClick={() => salvar({ secao: "dados", cep: f.cep, logradouro: f.logradouro, bairro: f.bairro, cidade: f.cidade, uf: f.uf, telefones: tels.filter((t) => t.numero.trim()), mapaAtivo: f.mapaAtivo, ponto: f.ponto, horarioSemana: f.horarioSemana, horarioSabado: f.horarioSabado, horarioDomingo: f.horarioDomingo }, "Dados da loja salvos. Já aparecem no site.")}>{salvando ? "Salvando…" : "Salvar"}</button>
          <Aviso />
        </div>
      </div>
      <section className={`${secao} self-start`}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Mapa no site</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.mapaAtivo} onChange={(e) => setF({ ...f, mapaAtivo: e.target.checked })} /> Mostrar</label>
        </div>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Ponto exato da loja (opcional)</span>
          <input className={campo} value={f.ponto} onChange={set("ponto")} placeholder="Cole o link do Google Maps ou -22.79373, -43.29856" />
          <span className="text-xs text-neutral-500">No Google Maps, ache a porta da loja, toque e segure no ponto e copie as coordenadas (ou o link). Vazio = o mapa usa o endereço.</span>
        </label>
        {f.mapaAtivo && (f.ponto || f.logradouro) && (
          <iframe title="Prévia do mapa" className="h-56 w-full rounded-md border border-neutral-200" loading="lazy" src={`https://www.google.com/maps?q=${encodeURIComponent(ponto ? `${ponto[1]},${ponto[2]}` : [f.logradouro, f.bairro, f.cidade, f.uf].filter(Boolean).join(", "))}&z=17&output=embed`} />
        )}
        {ponto && <a className="text-xs text-accent hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${ponto[1]},${ponto[2]}`}>Ver no Google Maps</a>}
      </section>
    </div>
  );
}

function WhatsappDoSite({ d, recarregar }: { d: DadosLoja; recarregar: () => void }) {
  const [numero, setNumero] = useState(d.whatsapp);
  const [mensagem, setMensagem] = useState(d.whatsappMensagem);
  const { salvar, salvando, Aviso } = useSalvar(recarregar);
  const previa = mensagem.trim() || "Olá! Vim pelo site da loja e quero mais informações.";
  return (
    <section className={secao} data-testid="site-whatsapp">
      <h3 className="text-sm font-semibold">WhatsApp do site</h3>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className={rotulo}>Número do botão</span><input className={campo} value={numero} onChange={(e) => setNumero(e.target.value)} inputMode="tel" placeholder="vazio = número conectado ao Zap" /></label>
          <label className="flex flex-col gap-1"><span className={rotulo}>Mensagem que já vem escrita</span><textarea className={`${campo} min-h-[90px]`} maxLength={300} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Olá! Vim pelo site e quero mais informações." /></label>
          <p className="text-xs text-neutral-500">Vale para o botão verde flutuante, o rodapé e a página Localização. No anúncio de cada carro, a mensagem leva o carro e o link dele.</p>
        </div>
        <div className="rounded-lg bg-[#efeae2] p-4 text-sm">
          <p className="text-xs text-neutral-500">O cliente toca no botão e já abre a conversa:</p>
          <p className="mt-2 rounded-md bg-[#075e54] px-3 py-2 font-semibold text-white">{numero || "Número conectado"}</p>
          <p className="ml-auto mt-3 max-w-[85%] whitespace-pre-line rounded-lg bg-[#d9fdd3] px-3 py-2 text-neutral-800">{previa}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className={botaoPrimario} disabled={salvando} onClick={() => salvar({ secao: "whatsapp", numero, mensagem }, "WhatsApp do site salvo.")}>{salvando ? "Salvando…" : "Salvar"}</button>
        <Aviso />
      </div>
    </section>
  );
}

function Avancado({ d, recarregar }: { d: DadosLoja; recarregar: () => void }) {
  const [f, setF] = useState({ metaPixelId: d.metaPixelId, ga4Id: d.ga4Id, googleAdsId: d.googleAdsId, gtmId: d.gtmId });
  const { salvar, salvando, Aviso } = useSalvar(recarregar);
  const linha = (k: keyof typeof f, nome: string, exemplo: string, dica: string) => (
    <label className="flex flex-col gap-1"><span className={rotulo}>{nome}</span><input className={campo} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder={exemplo} /><span className="text-xs text-neutral-500">{dica}</span></label>
  );
  return (
    <div className="flex flex-col gap-4" data-testid="site-avancado">
      <section className={secao}>
        <h3 className="text-sm font-semibold">Códigos de medição</h3>
        <p className="text-xs text-neutral-500">Em vez de colar scripts, informe só o ID de cada serviço: o Zap coloca o código certo em todas as páginas e conta cada clique no WhatsApp como contato e cada formulário como lead.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {linha("metaPixelId", "Pixel da Meta (Facebook/Instagram)", "só números", "Gerenciador de Eventos da Meta › Fontes de dados.")}
          {linha("ga4Id", "Google Analytics 4", "G-XXXXXXXXXX", "Analytics › Administrador › Fluxos de dados.")}
          {linha("googleAdsId", "Google Ads (tag de conversão)", "AW-123456789", "Google Ads › Metas › Conversões › Tag.")}
          {linha("gtmId", "Google Tag Manager", "GTM-XXXXXXX", d.dominio ? `Carrega só em ${d.dominio}.` : "Carrega só quando o site estiver no domínio próprio da loja.")}
        </div>
        <div className="flex items-center gap-3">
          <button className={botaoPrimario} disabled={salvando} onClick={() => salvar({ secao: "avancado", ...f }, "Códigos salvos.")}>{salvando ? "Salvando…" : "Salvar"}</button>
          <Aviso />
        </div>
      </section>
      <section className={secao}>
        <h3 className="text-sm font-semibold">Domínio e e-mail</h3>
        <p className="text-xs text-neutral-500">
          O DNS do domínio (inclusive as entradas do e-mail, MX e TXT) fica no painel onde o domínio está registrado ou hospedado, não aqui. Ao trazer o domínio para o Zap, só a
          entrada do site (www) muda: as entradas de e-mail precisam continuar iguais, senão o e-mail da loja para. Veja em <a href="/veiculos/configuracoes" className="text-accent hover:underline">Aparência e domínio</a>.
        </p>
      </section>
    </div>
  );
}
