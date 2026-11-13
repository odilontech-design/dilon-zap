"use client";

import { useState } from "react";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";

type Painel = {
  configurada: boolean;
  conta: { status: "CONECTADA" | "ERRO" | "DESCONECTADA"; contaNome: string | null; contaEmail: string | null; erro: string | null; planoPadrao: string | null; conectadaEm: string } | null;
  contagem: Record<string, number>;
  semKm: number;
  problemas: { id: string; veiculoId: string; status: string; erro: string | null; veiculo: { marca: string; modelo: string; versao: string | null; anoModelo: number; placa: string | null } }[];
};
type Conferencia = { naWebmotors: number; noZap: number; casam: number; soNoZap: { id: string; nome: string; placa: string | null }[]; soNaWebmotors: { codigo: string; placa: string | null }[] };
type Modalidade = { codigo: string; descricao: string; total: number; usados: number };

const ROTULOS: [string, string][] = [["PUBLICADO", "No ar"], ["FILA", "Na fila"], ["ERRO", "Com problema"]];

/** Conta da Webmotors: CNPJ + e-mail + senha do sistema de revendedores, plano dos anúncios e o que precisa de atenção. */
export function PainelWebmotors() {
  const { data, mutate } = useSWR<Painel>("/api/portais/webmotors", fetcher, { refreshInterval: 30_000 });
  const conectada = data?.conta?.status === "CONECTADA";
  const planos = useSWR<{ modalidades: Modalidade[] }>(conectada ? "/api/portais/webmotors/plano" : null, fetcher);
  const [form, setForm] = useState({ cnpj: "", email: "", senha: "" });
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [conf, setConf] = useState<Conferencia | null>(null);
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
      return r.json();
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className={secao} data-testid="painel-webmotors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Webmotors</h2>
        {conectada ? (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">Conectada</span>
        ) : data.conta?.status === "ERRO" ? (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600">Precisa de atenção</span>
        ) : (
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">Não conectada</span>
        )}
      </div>
      {data.conta?.erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-600">{data.conta.erro}</p>}
      {!conectada ? (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await chamar("/api/portais/webmotors/conectar", "POST", form)) {
              setForm({ cnpj: "", email: "", senha: "" });
              setAviso({ texto: "Webmotors conectada. Escolha o plano dos anúncios e os carros." });
            }
          }}
        >
          <p className="text-sm text-neutral-600 sm:col-span-3">Use o CNPJ, o e-mail e a senha do sistema de revendedores da Webmotors (os mesmos do painel deles). A senha fica guardada cifrada.</p>
          <label className="flex flex-col gap-1" htmlFor="wm-cnpj"><span className={rotulo}>CNPJ</span><input id="wm-cnpj" className={campo} value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></label>
          <label className="flex flex-col gap-1" htmlFor="wm-email"><span className={rotulo}>E-mail</span><input id="wm-email" type="email" className={campo} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="flex flex-col gap-1" htmlFor="wm-senha"><span className={rotulo}>Senha</span><input id="wm-senha" type="password" className={campo} value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} /></label>
          <div className="sm:col-span-3"><button className={botaoPrimario} disabled={ocupado || !form.cnpj || !form.email || !form.senha}>Conectar a Webmotors</button></div>
        </form>
      ) : (
        <>
          <p className="text-sm text-neutral-600">Conta {data.conta?.contaNome} ({data.conta?.contaEmail}).</p>
          <label className="flex max-w-sm flex-col gap-1" htmlFor="wm-plano">
            <span className={rotulo}>Plano dos anúncios</span>
            <select id="wm-plano" className={campo} value={data.conta?.planoPadrao ?? ""} disabled={ocupado || !planos.data} onChange={(e) => chamar("/api/portais/webmotors/plano", "PUT", { codigo: e.target.value || null })}>
              <option value="">{planos.error ? "Erro ao consultar a Webmotors" : planos.data ? "Escolha…" : "Carregando…"}</option>
              {planos.data?.modalidades.map((m) => (
                <option key={m.codigo} value={m.codigo}>{m.descricao} ({m.usados}/{m.total} em uso)</option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 text-sm">
            {ROTULOS.map(([s, nome]) => (
              <span key={s} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs">{nome}: {data.contagem[s] ?? 0}</span>
            ))}
          </div>
          {data.semKm > 0 && <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700">{data.semKm} carro(s) sem quilometragem informada: a Webmotors exige a km e o Zap não publica sem ela.</p>}
          <div className="flex flex-wrap gap-2">
            <button className={botaoPrimario} disabled={ocupado || !data.conta?.planoPadrao} onClick={() => chamar("/api/portais/webmotors/anunciar", "POST", { todos: true })}>Anunciar todos os disponíveis</button>
            <button className={botaoSecundario} disabled={ocupado} onClick={async () => setConf(await chamar("/api/portais/webmotors/conferir", "GET"))}>Conferir com a Webmotors</button>
            <button className={botaoSecundario} disabled={ocupado} onClick={() => chamar("/api/portais/webmotors/desconectar", "POST")}>Desconectar</button>
          </div>
          {conf && (
            <div className="rounded-md bg-neutral-50 px-3 py-2 text-xs text-neutral-700" data-testid="conferencia-webmotors">
              <p className="font-medium">Só leitura: nada foi publicado nem alterado.</p>
              <p>A Webmotors tem {conf.naWebmotors} anúncio(s); o Zap tem {conf.noZap} carro(s) à venda. {conf.casam} casam pela placa: o Zap adota esses anúncios em vez de criar outros.</p>
              {conf.soNoZap.length > 0 && <p className="mt-1">Só no Zap ({conf.soNoZap.length}): {conf.soNoZap.slice(0, 8).map((c) => `${c.nome}${c.placa ? ` (${c.placa})` : ""}`).join(", ")}{conf.soNoZap.length > 8 ? "…" : ""}</p>}
              {conf.soNaWebmotors.length > 0 && <p className="mt-1">Só na Webmotors ({conf.soNaWebmotors.length}): {conf.soNaWebmotors.slice(0, 8).map((a) => a.placa ?? a.codigo).join(", ")}{conf.soNaWebmotors.length > 8 ? "…" : ""}</p>}
            </div>
          )}
          {data.problemas.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-red-600">
              {data.problemas.map((p) => (
                <li key={p.id}>{p.veiculo.marca} {p.veiculo.modelo} {p.veiculo.anoModelo}: {p.erro}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {aviso && <p className={`text-sm ${aviso.erro ? "text-red-600" : "text-accent"}`}>{aviso.texto}</p>}
    </section>
  );
}
