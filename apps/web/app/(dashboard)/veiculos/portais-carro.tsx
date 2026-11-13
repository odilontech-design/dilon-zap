"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, rotulo, secao } from "./comum";

type Dados = {
  contaOlx: "CONECTADA" | "ERRO" | "DESCONECTADA" | null;
  olx: {
    ativo: boolean;
    status: string;
    rotulo: string;
    url: string | null;
    erro: string | null;
    catalogo: { marca: string; modelo: string; versao: string } | null;
  } | null;
  contaWebmotors: "CONECTADA" | "ERRO" | "DESCONECTADA" | null;
  webmotors: Anuncio | null;
  contaMobiauto: "CONECTADA" | "ERRO" | "DESCONECTADA" | null;
  mobiauto: Anuncio | null;
};

type Anuncio = { ativo: boolean; status: string; rotulo: string; url: string | null; erro: string | null };

type Opcao = { id: string; nome: string; nota: number };

const COR: Record<string, string> = {
  PUBLICADO: "bg-emerald-500/10 text-emerald-700",
  ERRO: "bg-red-500/10 text-red-600",
  FILA: "bg-neutral-100 text-neutral-600",
  ENVIADO: "bg-amber-500/10 text-amber-700",
  REMOVENDO: "bg-amber-500/10 text-amber-700",
  REMOVIDO: "bg-neutral-100 text-neutral-500",
};

/** Seção da ficha: o anúncio deste carro na OLX (e, depois, nos outros portais). */
export function AnuncioNosPortais({ id, gerencia }: { id: string; gerencia: boolean }) {
  const { data, mutate } = useSWR<Dados>(`/api/veiculos/${id}/portais`, fetcher, { refreshInterval: 30_000 });
  const [escolhendo, setEscolhendo] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  if (!data) return null;
  const conectada = data.contaOlx === "CONECTADA";
  const pub = data.olx;
  const wmConectada = data.contaWebmotors === "CONECTADA";
  const mbConectada = data.contaMobiauto === "CONECTADA";
  // Sem conta e sem histórico: a seção só aparece para a gestão, com o caminho para conectar.
  if (!conectada && !pub && !wmConectada && !data.webmotors && !mbConectada && !data.mobiauto && !gerencia) return null;

  async function salvar(corpo: object) {
    setAviso(null);
    const r = await fetch(`/api/veiculos/${id}/portais`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    setEscolhendo(false);
    mutate();
  }

  return (
    <section className={secao}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Portais de anúncio</h2>
        {!conectada && gerencia && (
          <Link href="/veiculos/portais" className="text-xs text-accent hover:underline">
            Conectar a OLX
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">OLX</span>
        {pub ? (
          <span className={`rounded-full px-2 py-0.5 text-xs ${pub.ativo ? COR[pub.status] ?? "" : "bg-neutral-100 text-neutral-500"}`}>{pub.rotulo}</span>
        ) : (
          <span className="text-xs text-neutral-500">não anunciado</span>
        )}
        {pub?.url && pub.status === "PUBLICADO" && (
          <a href={pub.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
            ver anúncio
          </a>
        )}
      </div>
      {pub?.ativo && pub.erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{pub.erro}</p>}
      {gerencia && conectada && (
        <div className="flex flex-wrap gap-2">
          {!pub?.ativo ? (
            <button className={botaoPrimario} onClick={() => salvar({ ativo: true })}>
              Anunciar na OLX
            </button>
          ) : (
            <button className={botaoSecundario} onClick={() => salvar({ ativo: false })}>
              Tirar da OLX
            </button>
          )}
          <button className={botaoSecundario} onClick={() => setEscolhendo(!escolhendo)}>
            {pub?.catalogo ? "Trocar modelo no catálogo da OLX" : "Escolher modelo no catálogo da OLX"}
          </button>
        </div>
      )}
      <LinhaWebmotors dados={data.webmotors} conectada={wmConectada} gerencia={gerencia} onLigar={(ativo) => salvar({ portal: "WEBMOTORS", ativo })} />
      <LinhaWebmotors nome="MobiAuto" dados={data.mobiauto} conectada={mbConectada} gerencia={gerencia} onLigar={(ativo) => salvar({ portal: "MOBIAUTO", ativo })} />
      {escolhendo && <EscolherCatalogo veiculoId={id} onEscolheu={(catalogo) => salvar({ ativo: true, catalogo })} />}
      {aviso && <p className={`text-sm ${aviso.erro ? "text-red-600" : "text-accent"}`}>{aviso.texto}</p>}
      <p className="text-xs text-neutral-500">
        Disponível e anunciado: vai para a OLX sozinho. Mudou preço, km ou fotos: atualiza. Vendeu ou reservou: sai do ar.
      </p>
    </section>
  );
}

/** O anúncio na Webmotors: liga e desliga; o modelo é achado sozinho pelo nome (o que faltar aparece no aviso). Sem km informada, não publica. */
function LinhaWebmotors({ nome = "Webmotors", dados, conectada, gerencia, onLigar }: { nome?: string; dados: Anuncio | null; conectada: boolean; gerencia: boolean; onLigar: (ativo: boolean) => void }) {
  if (!conectada && !dados) return null;
  return (
    <div className="flex flex-col gap-2" data-testid={`linha-${nome.toLowerCase()}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{nome}</span>
        {dados ? (
          <span className={`rounded-full px-2 py-0.5 text-xs ${dados.ativo ? COR[dados.status] ?? "" : "bg-neutral-100 text-neutral-500"}`}>{dados.rotulo}</span>
        ) : (
          <span className="text-xs text-neutral-500">não anunciado</span>
        )}
        {dados?.url && dados.status === "PUBLICADO" && (
          <a href={dados.url} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">
            ver anúncio
          </a>
        )}
      </div>
      {dados?.ativo && dados.erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{dados.erro}</p>}
      {gerencia && conectada && (
        <div>
          {!dados?.ativo ? (
            <button className={botaoPrimario} onClick={() => onLigar(true)}>
              Anunciar na {nome}
            </button>
          ) : (
            <button className={botaoSecundario} onClick={() => onLigar(false)}>
              Tirar da {nome}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Marca → modelo → versão do catálogo da OLX, com o mais parecido com a ficha primeiro. */
function EscolherCatalogo({ veiculoId, onEscolheu }: { veiculoId: string; onEscolheu: (c: { marca: string; modelo: string; versao: string }) => void }) {
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [versao, setVersao] = useState("");
  const base = `/api/portais/olx/catalogo?veiculoId=${veiculoId}`;
  const marcas = useSWR<{ opcoes: Opcao[] }>(base, fetcher);
  const modelos = useSWR<{ opcoes: Opcao[] }>(marca ? `${base}&marca=${marca}` : null, fetcher);
  const versoes = useSWR<{ opcoes: Opcao[] }>(marca && modelo ? `${base}&marca=${marca}&modelo=${modelo}` : null, fetcher);

  const lista = (r: typeof marcas, valor: string, mudar: (v: string) => void, nome: string, idCampo: string) => (
    <label className="flex flex-col gap-1" htmlFor={idCampo}>
      <span className={rotulo}>{nome}</span>
      <select id={idCampo} className={campo} value={valor} onChange={(e) => mudar(e.target.value)} disabled={!r.data}>
        <option value="">{r.error ? "Erro ao consultar a OLX" : r.data ? "Escolha…" : "Carregando…"}</option>
        {r.data?.opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
            {o.nota >= 0.85 ? "  (sugerido)" : ""}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="grid gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-3">
      {lista(marcas, marca, (v) => { setMarca(v); setModelo(""); setVersao(""); }, "Marca", "olx-marca")}
      {lista(modelos, modelo, (v) => { setModelo(v); setVersao(""); }, "Modelo", "olx-modelo")}
      {lista(versoes, versao, setVersao, "Versão", "olx-versao")}
      <div className="sm:col-span-3">
        <button className={botaoPrimario} disabled={!marca || !modelo || !versao} onClick={() => onEscolheu({ marca, modelo, versao })}>
          Usar este modelo e anunciar
        </button>
      </div>
    </div>
  );
}
