"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";

type Painel = {
  configurada: boolean;
  conta: { status: "CONECTADA" | "ERRO" | "DESCONECTADA"; contaNome: string | null; contaEmail: string | null; erro: string | null; planoPadrao: string | null; conectadaEm: string } | null;
  contagem: Record<string, number>;
  semKm: number;
  problemas: { id: string; veiculoId: string; status: string; erro: string | null; veiculo: { marca: string; modelo: string; versao: string | null; anoModelo: number; placa: string | null } }[];
};
type Plano = { id: string; nome: string; total: number; disponiveis: number; usados: number };
type Loja = { id: string; nome: string; cnpj: string };
type Conferencia = { naMobiauto: number; noZap: number; casam: number; soNoZap: { id: string; nome: string; placa: string | null }[]; soNaMobiauto: { codigo: string; placa: string | null }[] };

const ROTULOS: [string, string][] = [["PUBLICADO", "No ar"], ["FILA", "Na fila"], ["ERRO", "Com problema"]];
const RETORNO: Record<string, { texto: string; erro?: boolean }> = {
  conectada: { texto: "MobiAuto conectada. Escolha a loja e o plano dos anúncios." },
  negada: { texto: "A autorização foi negada na MobiAuto.", erro: true },
  invalida: { texto: "O retorno da MobiAuto não confere com o pedido. Tente conectar de novo.", erro: true },
  falhou: { texto: "A MobiAuto não confirmou a conexão. Tente de novo em instantes.", erro: true },
  "sem-loja": { texto: "Esse usuário da MobiAuto não gerencia nenhuma loja.", erro: true },
  "nao-configurada": { texto: "A integração com a MobiAuto ainda não foi liberada no servidor.", erro: true },
};

/** Conta da MobiAuto (Mobigestor): autoriza por login na MobiAuto, escolhe a loja e o plano, e mostra o que precisa de atenção. */
export function PainelMobiauto() {
  const { data, mutate } = useSWR<Painel>("/api/portais/mobiauto", fetcher, { refreshInterval: 30_000 });
  const conectada = data?.conta?.status === "CONECTADA";
  const planos = useSWR<{ planos: Plano[] }>(conectada ? "/api/portais/mobiauto/plano" : null, fetcher);
  const lojas = useSWR<{ lojas: Loja[] }>(conectada ? "/api/portais/mobiauto/loja" : null, fetcher);
  const params = useSearchParams();
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conf, setConf] = useState<Conferencia | null>(null);
  useEffect(() => {
    const r = params.get("mobiauto");
    if (r && RETORNO[r]) setAviso(RETORNO[r]);
  }, [params]);
  if (!data) return null;

  async function chamar(url: string, metodo: string, corpo?: object) {
    setAviso(null);
    setOcupado(true);
    try {
      const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
      if (!r.ok) {
        setAviso({ texto: await erroDaResposta(r), erro: true });
        return null;
      }
      mutate();
      planos.mutate();
      lojas.mutate();
      return r.json();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className={secao} data-testid="painel-mobiauto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">MobiAuto</h2>
        {conectada ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">Conectada</span>
        ) : data.conta?.status === "ERRO" ? (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Precisa de atenção</span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Não conectada</span>
        )}
      </div>
      {aviso && <p className={`rounded-md px-3 py-2 text-xs ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
      {data.conta?.erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{data.conta.erro}</p>}
      {!conectada ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-neutral-600">Entre com o usuário do Mobigestor da loja e autorize o Zap a publicar o estoque. A senha da MobiAuto não passa pelo Zap.</p>
          {!data.configurada && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">A integração ainda não foi liberada no servidor (acesso de integrador da MobiAuto).</p>}
          <div>
            <a href="/api/portais/mobiauto/conectar" className={`${botaoPrimario} inline-block ${data.configurada ? "" : "pointer-events-none opacity-50"}`}>{data.conta ? "Reconectar a MobiAuto" : "Conectar a MobiAuto"}</a>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-600">Loja {data.conta?.contaNome}{data.conta?.contaEmail ? ` (CNPJ ${data.conta.contaEmail})` : ""}.</p>
          {(lojas.data?.lojas.length ?? 0) > 1 && (
            <label className="flex max-w-sm flex-col gap-1" htmlFor="mb-loja">
              <span className={rotulo}>Loja no Mobigestor</span>
              <select id="mb-loja" className={campo} defaultValue="" disabled={ocupado} onChange={(e) => e.target.value && chamar("/api/portais/mobiauto/loja", "PUT", { dealerId: e.target.value })}>
                <option value="">Trocar de loja…</option>
                {lojas.data!.lojas.map((l) => <option key={l.id} value={l.id}>{l.nome} ({l.id})</option>)}
              </select>
            </label>
          )}
          <label className="flex max-w-sm flex-col gap-1" htmlFor="mb-plano">
            <span className={rotulo}>Plano dos anúncios</span>
            <select id="mb-plano" className={campo} value={data.conta?.planoPadrao ?? ""} disabled={ocupado || !planos.data} onChange={(e) => chamar("/api/portais/mobiauto/plano", "PUT", { plano: e.target.value || null })}>
              <option value="">{planos.error ? "Erro ao consultar a MobiAuto" : planos.data ? "Escolha…" : "Carregando…"}</option>
              {planos.data?.planos.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.usados}/{p.total} em uso)</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 text-sm">
            {ROTULOS.map(([s, nome]) => <span key={s} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{nome}: {data.contagem[s] ?? 0}</span>)}
          </div>
          {data.semKm > 0 && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{data.semKm} carro(s) sem quilometragem informada: a MobiAuto exige a km e o Zap não publica sem ela.</p>}
          <div className="flex flex-wrap gap-2">
            <button className={botaoPrimario} disabled={ocupado || !data.conta?.planoPadrao} onClick={() => chamar("/api/portais/mobiauto/anunciar", "POST", { todos: true })}>Anunciar todos os disponíveis</button>
            <button className={botaoSecundario} disabled={ocupado} onClick={async () => setConf(await chamar("/api/portais/mobiauto/conferir", "GET"))}>Conferir com a MobiAuto</button>
            <button className={botaoSecundario} disabled={ocupado} onClick={() => chamar("/api/portais/mobiauto/desconectar", "POST")}>Desconectar</button>
          </div>
          {conf && (
            <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700" data-testid="conferencia-mobiauto">
              <p className="font-medium">Só leitura: nada foi publicado nem alterado.</p>
              <p>A MobiAuto tem {conf.naMobiauto} anúncio(s); o Zap tem {conf.noZap} carro(s) à venda. {conf.casam} casam pela placa: o Zap adota esses anúncios em vez de criar outros.</p>
              {conf.soNoZap.length > 0 && <p className="mt-1">Só no Zap ({conf.soNoZap.length}): {conf.soNoZap.slice(0, 8).map((c) => `${c.nome}${c.placa ? ` (${c.placa})` : ""}`).join(", ")}{conf.soNoZap.length > 8 ? "…" : ""}</p>}
              {conf.soNaMobiauto.length > 0 && <p className="mt-1">Só na MobiAuto ({conf.soNaMobiauto.length}): {conf.soNaMobiauto.slice(0, 8).map((a) => a.placa ?? a.codigo).join(", ")}{conf.soNaMobiauto.length > 8 ? "…" : ""}</p>}
            </div>
          )}
          {data.problemas.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-red-600">
              {data.problemas.map((p) => <li key={p.id}>{p.veiculo.marca} {p.veiculo.modelo} {p.veiculo.anoModelo}: {p.erro}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
