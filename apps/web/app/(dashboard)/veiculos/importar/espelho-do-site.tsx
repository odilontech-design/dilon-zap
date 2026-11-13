"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { botaoSecundario, erroDaResposta, fetcher, secao } from "../comum";

type Situacao = {
  siteOrigemUrl: string | null;
  siteSincEm: string | null;
  siteSincResumo: string | null;
  pendentes: { id: string; marca: string; modelo: string; versao: string | null; anoModelo: number; sumiuDoSiteEm: string }[];
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
  if (!data?.siteOrigemUrl) return null;

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
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {data.pendentes.map((c) => (
              <li key={c.id}>
                <Link href={`/veiculos/${c.id}`} className="text-accent hover:underline">
                  {c.marca} {c.modelo} {c.versao ?? ""} {c.anoModelo}
                </Link>{" "}
                <span className="text-xs text-neutral-500">saiu em {new Date(c.sumiuDoSiteEm).toLocaleDateString("pt-BR")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
