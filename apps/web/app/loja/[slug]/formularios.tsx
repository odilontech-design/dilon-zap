"use client";

import { useState } from "react";
import { registrarContato } from "./rastreio";

/** Formulários das páginas "Venda seu carro" e "Financiamento". Mandam para o CRM da loja. */

const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--loja)]/40";
const botao = "rounded-lg px-5 py-3 text-sm font-medium hover:opacity-90 disabled:opacity-50";

function useEnvio(slug: string, caminho: string) {
  const [estado, setEstado] = useState<"livre" | "enviando" | "feito">("livre");
  const [erro, setErro] = useState<string | null>(null);
  async function enviar(corpo: object) {
    setErro(null);
    setEstado("enviando");
    const r = await fetch(`/api/loja/${slug}/${caminho}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
    if (!r.ok) {
      setErro((await r.json().catch(() => null))?.error ?? "não deu para enviar, tente de novo");
      setEstado("livre");
      return;
    }
    registrarContato("formulario");
    setEstado("feito");
  }
  return { estado, erro, enviar };
}

function Feito({ texto }: { texto: string }) {
  return (
    <div role="status" className="rounded-xl border border-neutral-200 bg-surface p-6 text-sm">
      <p className="font-medium">Recebemos seu contato.</p>
      <p className="mt-1 text-neutral-600">{texto}</p>
    </div>
  );
}

/** Armadilha para robô: invisível para gente. */
function Isca({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  return <input tabIndex={-1} autoComplete="off" aria-hidden value={valor} onChange={(e) => onChange(e.target.value)} name="site" className="absolute -left-[9999px] h-0 w-0 opacity-0" />;
}

export function FormularioAvaliacao({ slug }: { slug: string }) {
  const { estado, erro, enviar } = useEnvio(slug, "venda-seu-carro");
  const [f, setF] = useState({ nome: "", telefone: "", marca: "", modelo: "", ano: "", km: "", mensagem: "", site: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  if (estado === "feito") return <Feito texto="Um vendedor vai avaliar o seu carro e chamar você no WhatsApp." />;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar({
          nome: f.nome,
          telefone: f.telefone,
          marca: f.marca,
          modelo: f.modelo,
          ano: f.ano ? Number(f.ano.replace(/\D/g, "")) || null : null,
          km: f.km ? Number(f.km.replace(/\D/g, "")) : null,
          mensagem: f.mensagem || null,
          site: f.site,
        });
      }}
      className="relative flex flex-col gap-3 rounded-xl border border-neutral-200 bg-surface p-5"
    >
      <h2 className="text-sm font-semibold">Seus dados</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Seu nome" required minLength={2} value={f.nome} onChange={set("nome")} placeholder="Seu nome" className={campo} />
        <input aria-label="Seu WhatsApp" required value={f.telefone} onChange={set("telefone")} placeholder="WhatsApp com DDD" inputMode="tel" className={campo} />
      </div>
      <h2 className="mt-2 text-sm font-semibold">O carro que você quer vender</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Marca" required value={f.marca} onChange={set("marca")} placeholder="Marca (ex.: Fiat)" className={campo} />
        <input aria-label="Modelo" required value={f.modelo} onChange={set("modelo")} placeholder="Modelo e versão (ex.: Argo 1.0 Drive)" className={campo} />
        <input aria-label="Ano" value={f.ano} onChange={set("ano")} placeholder="Ano (ex.: 2020)" inputMode="numeric" className={campo} />
        <input aria-label="Quilometragem" value={f.km} onChange={set("km")} placeholder="Quilometragem (ex.: 45000)" inputMode="numeric" className={campo} />
      </div>
      <textarea aria-label="Observações" rows={3} value={f.mensagem} onChange={set("mensagem")} placeholder="Algo mais? Estado do carro, se tem financiamento, quanto espera receber… (opcional)" className={campo} />
      <Isca valor={f.site} onChange={(v) => setF({ ...f, site: v })} />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <button disabled={estado === "enviando"} className={botao} style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
          {estado === "enviando" ? "Enviando…" : "Quero uma avaliação"}
        </button>
      </div>
    </form>
  );
}

export type CarroDaLista = { id: string; nome: string };

export function FormularioFinanciamento({ slug, carros, carroInicial }: { slug: string; carros: CarroDaLista[]; carroInicial: string }) {
  const { estado, erro, enviar } = useEnvio(slug, "financiamento");
  const [f, setF] = useState({ nome: "", telefone: "", veiculoId: carroInicial, entrada: "", mensagem: "", site: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  if (estado === "feito") return <Feito texto="Nossa equipe vai chamar você no WhatsApp com as condições de financiamento." />;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const entrada = Number(f.entrada.replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
        enviar({ nome: f.nome, telefone: f.telefone, veiculoId: f.veiculoId || null, entradaReais: entrada > 0 ? entrada : null, mensagem: f.mensagem || null, site: f.site });
      }}
      className="relative flex flex-col gap-3 rounded-xl border border-neutral-200 bg-surface p-5"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <input aria-label="Seu nome" required minLength={2} value={f.nome} onChange={set("nome")} placeholder="Seu nome" className={campo} />
        <input aria-label="Seu WhatsApp" required value={f.telefone} onChange={set("telefone")} placeholder="WhatsApp com DDD" inputMode="tel" className={campo} />
        <select aria-label="Carro de interesse" value={f.veiculoId} onChange={set("veiculoId")} className={campo}>
          <option value="">Ainda não escolhi o carro</option>
          {carros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <input aria-label="Valor de entrada" value={f.entrada} onChange={set("entrada")} placeholder="Entrada, se tiver (ex.: 15.000)" inputMode="decimal" className={campo} />
      </div>
      <textarea aria-label="Observações" rows={3} value={f.mensagem} onChange={set("mensagem")} placeholder="Tem carro para dar na troca? Prazo desejado? (opcional)" className={campo} />
      <Isca valor={f.site} onChange={(v) => setF({ ...f, site: v })} />
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <button disabled={estado === "enviando"} className={botao} style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
          {estado === "enviando" ? "Enviando…" : "Quero simular"}
        </button>
      </div>
      <p className="text-xs text-neutral-500">Não pedimos CPF nem dados bancários por aqui. A simulação é feita pela nossa equipe, por WhatsApp.</p>
    </form>
  );
}
