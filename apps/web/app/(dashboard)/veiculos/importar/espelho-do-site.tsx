"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, erroDaResposta, fetcher, secao } from "../comum";

type Situacao = {
  siteOrigemUrl: string | null;
  siteSincEm: string | null;
  siteSincResumo: string | null;
  pendentes: { id: string; marca: string; modelo: string; versao: string | null; anoModelo: number; sumiuDoSiteEm: string; motivoSemBaixa: string | null }[];
};

/**
 * O espelho do site atual: enquanto o site antigo for o cadastro principal, o Zap o
 * acompanha de hora em hora. Carro novo entra; carro que saiu é escondido da vitrine
 * e espera a confirmação da gestão (vendido ou engano).
 */
export function EspelhoDoSite({ onFotos }: { onFotos: () => void }) {
  const { data, mutate } = useSWR<Situacao>("/api/veiculos/sincronizar-site", fetcher, { refreshInterval: 60_000 });
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState<"baixar" | "reativar" | null>(null);
  if (!data?.siteOrigemUrl) return null;

  const baixaveis = data.pendentes.filter((c) => !c.motivoSemBaixa);
  const alternar = (id: string) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function emLote(acao: "baixar" | "reativar") {
    setAviso(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/veiculos/sincronizar-site/lote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, ids: [...marcados] }) });
      if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
      const d = (await r.json()) as { baixados?: number; reativados?: number; ignorados?: { nome: string; motivo: string }[] };
      const ignorados = d.ignorados ?? [];
      setAviso({
        texto:
          acao === "baixar"
            ? `${d.baixados ?? 0} carro(s) baixado(s) do estoque como vendidos.${ignorados.length ? ` ${ignorados.length} não foram baixados: ${ignorados[0].nome}, ${ignorados[0].motivo}.` : ""}`
            : `${d.reativados ?? 0} carro(s) voltaram para a vitrine.`,
        erro: ignorados.length > 0,
      });
      setMarcados(new Set());
      mutate();
    } finally {
      setOcupado(false);
      setConfirmando(null);
    }
  }

  async function sincronizar() {
    setAviso(null);
    setOcupado(true);
    try {
      const r = await fetch("/api/veiculos/sincronizar-site", { method: "POST" });
      if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
      const d = (await r.json()) as { resumo: string; novos: number; travado: boolean };
      setAviso({ texto: d.resumo, erro: d.travado });
      if (d.novos > 0) onFotos();
      mutate();
    } finally {
      setOcupado(false);
    }
  }

  const quando = data.siteSincEm ? new Date(data.siteSincEm).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : null;
  const falhou = data.siteSincResumo?.startsWith("Falhou");
  return (
    <section className={secao}>
      <h2 className="text-sm font-semibold">Acompanhando o site atual</h2>
      <p className="text-xs text-neutral-500">
        O Zap lê <strong>{data.siteOrigemUrl.replace(/^https?:\/\//, "")}</strong> de hora em hora: carro novo no site entra aqui; carro que saiu do site é escondido da vitrine do Zap e fica
        esperando a sua confirmação (nunca é vendido sozinho). O preço e a placa dos carros novos vêm da planilha do AutoCerto (acima).
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={botaoSecundario} disabled={ocupado} onClick={sincronizar}>
          {ocupado ? "Sincronizando…" : "Sincronizar agora"}
        </button>
        {quando && <span className="text-xs text-neutral-500">Última sincronização: {quando}</span>}
      </div>
      {data.siteSincResumo && <p className={`text-xs ${falhou ? "text-red-600" : "text-neutral-600"}`}>{data.siteSincResumo}</p>}
      {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-amber-500/10 text-amber-700" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
      {data.pendentes.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="text-sm font-medium text-amber-700">{data.pendentes.length} carro(s) saíram do site antigo e esperam a sua confirmação</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <button type="button" className="text-accent hover:underline" onClick={() => setMarcados(new Set(baixaveis.map((c) => c.id)))}>
              Marcar todos os que podem ser baixados ({baixaveis.length})
            </button>
            {marcados.size > 0 && (
              <button type="button" className="text-neutral-500 hover:underline" onClick={() => setMarcados(new Set())}>
                Limpar
              </button>
            )}
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {data.pendentes.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  aria-label={`Marcar ${c.marca} ${c.modelo} ${c.anoModelo}`}
                  checked={marcados.has(c.id)}
                 
                  onChange={() => alternar(c.id)}
                />
                <span>
                  <Link href={`/veiculos/${c.id}`} className="text-accent hover:underline">
                    {c.marca} {c.modelo} {c.versao ?? ""} {c.anoModelo}
                  </Link>{" "}
                  <span className="text-xs text-neutral-500">saiu em {new Date(c.sumiuDoSiteEm).toLocaleDateString("pt-BR")}</span>
                  {c.motivoSemBaixa && <span className="block text-xs text-amber-700">Não entra na baixa em lote: {c.motivoSemBaixa}.</span>}
                </span>
              </li>
            ))}
          </ul>
          {marcados.size > 0 && !confirmando && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={botaoPrimario} disabled={ocupado} onClick={() => setConfirmando("baixar")}>
                Baixar {marcados.size} como vendido(s)
              </button>
              <button type="button" className={botaoSecundario} disabled={ocupado} onClick={() => setConfirmando("reativar")}>
                Foi engano: {marcados.size} continuam à venda
              </button>
            </div>
          )}
          {marcados.size > 0 && confirmando && (
            <div className="mt-3 rounded-md border border-neutral-200 bg-white p-3 text-sm" role="alertdialog" aria-label="Confirmar a ação em lote">
              <p>
                {confirmando === "baixar"
                  ? `Baixar ${marcados.size} carro(s) do estoque como vendidos? Eles saem do pátio, da vitrine e dos portais. A venda (comprador e valor) não é registrada agora. Os reservados e consignados da lista são ignorados.`
                  : `Voltar ${marcados.size} carro(s) para a vitrine e parar de compará-los com o site antigo?`}
              </p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={botaoPrimario} disabled={ocupado} onClick={() => emLote(confirmando)}>
                  {ocupado ? "Aplicando…" : "Confirmar"}
                </button>
                <button type="button" className={botaoSecundario} disabled={ocupado} onClick={() => setConfirmando(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
