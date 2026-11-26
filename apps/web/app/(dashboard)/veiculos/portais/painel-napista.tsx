"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";
import { EscolherVersoesNapista } from "./versoes-napista";

type Painel = {
  configurada: boolean;
  conta: { status: "CONECTADA" | "ERRO" | "DESCONECTADA"; contaNome: string | null; contaEmail: string | null; erro: string | null; conectadaEm: string; leadEm: string | null; leadErro: string | null } | null;
  contagem: Record<string, number>;
  semKm: number;
  leads30d: number;
  problemas: { id: string; veiculoId: string; status: string; erro: string | null; veiculo: { marca: string; modelo: string; versao: string | null; anoModelo: number; placa: string | null } }[];
};
type Loja = { id: string; nome: string; documento: string };
type Conferencia = { noPortal: number; noZap: number; casam: number; soNoZap: { id: string; nome: string; placa: string | null }[]; soNoPortal: { codigo: string; placa: string | null }[] };

const ROTULOS: [string, string][] = [["PUBLICADO", "No ar"], ["FILA", "Na fila"], ["ERRO", "Com problema"]];
const RETORNO: Record<string, { texto: string; erro?: boolean }> = {
  conectada: { texto: "NaPista conectado. Agora é só escolher os carros; os contatos dos compradores vão cair no CRM." },
  negada: { texto: "A autorização foi negada no NaPista.", erro: true },
  invalida: { texto: "O retorno do NaPista não confere com o pedido. Tente conectar de novo.", erro: true },
  falhou: { texto: "O NaPista não confirmou a conexão. Tente de novo em instantes.", erro: true },
  "sem-loja": { texto: "Esse usuário do NaPista não gerencia nenhuma loja.", erro: true },
  "nao-configurada": { texto: "A integração com o NaPista ainda não foi liberada no servidor.", erro: true },
};

/** Conta do NaPista: autoriza com o login do NaPista, escolhe a loja, anuncia, confere e mostra o que precisa de atenção. */
export function PainelNapista() {
  const { data, mutate } = useSWR<Painel>("/api/portais/napista", fetcher, { refreshInterval: 30_000 });
  const conectada = data?.conta?.status === "CONECTADA";
  const lojas = useSWR<{ lojas: Loja[] }>(conectada ? "/api/portais/napista/loja" : null, fetcher);
  const params = useSearchParams();
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conf, setConf] = useState<Conferencia | null>(null);
  useEffect(() => {
    const r = params.get("napista");
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
      lojas.mutate();
      return r.json();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className={secao} data-testid="painel-napista">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">NaPista</h2>
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
          <p className="text-sm text-neutral-600">Entre com o mesmo usuário e senha que a loja usa no NaPista e autorize o Zap a publicar o estoque e a ler os contatos. A senha do NaPista não passa pelo Zap.</p>
          {!data.configurada && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">A integração ainda não foi liberada no servidor (acesso de integrador do NaPista).</p>}
          <div>
            <a href="/api/portais/napista/conectar" className={`${botaoPrimario} inline-block ${data.configurada ? "" : "pointer-events-none opacity-50"}`}>{data.conta ? "Reconectar o NaPista" : "Conectar o NaPista"}</a>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-600">Loja {data.conta?.contaNome}{data.conta?.contaEmail ? ` (CNPJ ${data.conta.contaEmail})` : ""}.</p>
          {(lojas.data?.lojas.length ?? 0) > 1 && (
            <label className="flex max-w-sm flex-col gap-1" htmlFor="np-loja">
              <span className={rotulo}>Loja no NaPista</span>
              <select id="np-loja" className={campo} defaultValue="" disabled={ocupado} onChange={(e) => e.target.value && chamar("/api/portais/napista/loja", "PUT", { sellerId: e.target.value })}>
                <option value="">Trocar de loja…</option>
                {lojas.data!.lojas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2 text-sm">
            {ROTULOS.map(([s, nome]) => <span key={s} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{nome}: {data.contagem[s] ?? 0}</span>)}
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">Contatos em 30 dias: {data.leads30d}</span>
          </div>
          <p className="text-xs text-neutral-500">
            {data.conta?.leadErro ? <span className="text-red-600">Contatos do NaPista com problema: {data.conta.leadErro}</span> : data.conta?.leadEm ? `Contatos conferidos pela última vez em ${new Date(data.conta.leadEm).toLocaleString("pt-BR")}.` : "Os contatos dos compradores entram no CRM a cada 10 minutos."}
          </p>
          {data.semKm > 0 && (
            <p className="rounded-md bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
              {data.semKm} carro(s) sem quilometragem: vão ao NaPista sem esse campo (o NaPista não exige). Se quiser informar a km,{" "}
              <a href="/veiculos/completar" className="font-medium underline">complete aqui</a>.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button className={botaoPrimario} disabled={ocupado} onClick={() => chamar("/api/portais/napista/anunciar", "POST", { todos: true })}>Anunciar todos os disponíveis</button>
            <button className={botaoSecundario} disabled={ocupado} onClick={async () => setConf(await chamar("/api/portais/napista/conferir", "GET"))}>Conferir com o NaPista</button>
            <button className={botaoSecundario} disabled={ocupado} onClick={() => chamar("/api/portais/napista/desconectar", "POST")}>Desconectar</button>
          </div>
          <EscolherVersoesNapista pendentes={data.problemas.filter((p) => /Versão|Escolher marca/.test(p.erro ?? "")).length} aoSalvar={() => mutate()} />
          {conf && (
            <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700" data-testid="conferencia-napista">
              <p className="font-medium">Só leitura: nada foi publicado nem alterado.</p>
              <p>O NaPista tem {conf.noPortal} anúncio(s) no ar; o Zap tem {conf.noZap} carro(s) à venda. {conf.casam} casam pela placa: o Zap adota esses anúncios em vez de criar outros.</p>
              {conf.soNoZap.length > 0 && <p className="mt-1">Só no Zap ({conf.soNoZap.length}): {conf.soNoZap.slice(0, 8).map((c) => `${c.nome}${c.placa ? ` (${c.placa})` : ""}`).join(", ")}{conf.soNoZap.length > 8 ? "…" : ""}</p>}
              {conf.soNoPortal.length > 0 && <p className="mt-1">Só no NaPista ({conf.soNoPortal.length}): {conf.soNoPortal.slice(0, 8).map((a) => a.placa ?? a.codigo).join(", ")}{conf.soNoPortal.length > 8 ? "…" : ""}</p>}
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
