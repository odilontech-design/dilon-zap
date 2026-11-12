"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { botaoPrimario, botaoSecundario, campo, erroDaResposta, fetcher, rotulo, secao } from "../comum";

type Config = {
  vitrineAtiva: boolean;
  whatsapp: string | null;
  nomeLoja: string | null;
  endereco: string | null;
  sobre: string | null;
  mostrarReservados: boolean;
  link: string;
  nomeEmpresa: string;
  numeroConectado: string | null;
};

/** Liga a vitrine pública e define o que ela mostra sobre a loja. */
export function ConfigVitrine() {
  const { data, error, mutate } = useSWR<Config>("/api/veiculos/config", fetcher);
  const [f, setF] = useState({ vitrineAtiva: false, whatsapp: "", nomeLoja: "", endereco: "", sobre: "", mostrarReservados: true });
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (data)
      setF({
        vitrineAtiva: data.vitrineAtiva,
        whatsapp: data.whatsapp ?? "",
        nomeLoja: data.nomeLoja ?? "",
        endereco: data.endereco ?? "",
        sobre: data.sobre ?? "",
        mostrarReservados: data.mostrarReservados,
      });
  }, [data]);

  if (error) return <p className="text-sm text-red-600">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-neutral-500">Carregando…</p>;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setAviso(null);
    setSalvando(true);
    const r = await fetch("/api/veiculos/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setSalvando(false);
    if (!r.ok) return setAviso({ texto: await erroDaResposta(r), erro: true });
    setAviso({ texto: f.vitrineAtiva ? "Vitrine no ar." : "Configuração salva. A vitrine está desligada." });
    mutate();
  }

  return (
    <form onSubmit={salvar} className="flex max-w-2xl flex-col gap-4">
      <section className={secao}>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={f.vitrineAtiva} onChange={(e) => setF({ ...f, vitrineAtiva: e.target.checked })} />
          Vitrine pública ligada
        </label>
        <p className="text-xs text-neutral-500">
          Uma página aberta na internet com os carros disponíveis, fotos, preço e o botão “Tenho interesse”, que abre o WhatsApp da loja com o carro já na mensagem. Não mostra custo,
          placa inteira, chassi nem nada interno. Para esconder um carro específico, desmarque “Mostrar na vitrine” na ficha dele.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded bg-neutral-100 px-2 py-1 text-xs">{data.link}</code>
          <button type="button" className={botaoSecundario} onClick={() => navigator.clipboard?.writeText(data.link).then(() => setAviso({ texto: "Link copiado." }))}>
            Copiar link
          </button>
          {data.vitrineAtiva && (
            <a href={data.link} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">
              Abrir vitrine
            </a>
          )}
        </div>
      </section>

      <section className={secao}>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Nome da loja na vitrine</span>
          <input id="vitrine-nome" value={f.nomeLoja} onChange={(e) => setF({ ...f, nomeLoja: e.target.value })} placeholder={data.nomeEmpresa} className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>WhatsApp do botão “Tenho interesse”</span>
          <input id="vitrine-whatsapp" value={f.whatsapp} onChange={(e) => setF({ ...f, whatsapp: e.target.value })} placeholder={data.numeroConectado ? `vazio = número conectado (${data.numeroConectado})` : "DDD + número"} inputMode="tel" className={campo} />
          {!f.whatsapp && !data.numeroConectado && <span className="text-xs text-amber-700">Sem número conectado e sem WhatsApp aqui, a vitrine fica sem o botão.</span>}
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Endereço</span>
          <input id="vitrine-endereco" value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} placeholder="Av. Brasil, 1000 · Centro · Cidade/UF" className={campo} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={rotulo}>Sobre a loja</span>
          <textarea id="vitrine-sobre" rows={3} value={f.sobre} onChange={(e) => setF({ ...f, sobre: e.target.value })} placeholder="Seminovos revisados, financiamento em até 60x, aceitamos seu usado na troca." className={campo} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.mostrarReservados} onChange={(e) => setF({ ...f, mostrarReservados: e.target.checked })} />
          Mostrar carros reservados (com o selo “Reservado”)
        </label>
      </section>

      {aviso && <p className={`rounded-md px-3 py-2 text-sm ${aviso.erro ? "bg-red-500/10 text-red-600" : "bg-accent/10 text-accent"}`}>{aviso.texto}</p>}
      <div>
        <button disabled={salvando} className={botaoPrimario}>
          {salvando ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}
