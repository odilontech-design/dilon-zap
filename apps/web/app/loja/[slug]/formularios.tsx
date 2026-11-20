"use client";

import { useState } from "react";
import { registrarContato } from "./rastreio";
import { CAMPOS, type Campo, type ConfigFicha } from "@/lib/ficha-campos";

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

// ---- Ficha completa de financiamento (quando a loja liga em Meu site > Páginas) ----

type Grupo = Record<string, string>;

function CampoDaFicha({ c, valor, onChange, aoSairDoCep }: { c: Campo; valor: string; onChange: (v: string) => void; aoSairDoCep?: () => void }) {
  const comum = { "aria-label": c.rotulo, required: c.obrigatorio, value: valor, className: campo };
  const entrada =
    c.tipo === "escolha" || c.tipo === "uf" ? (
      <select {...comum} onChange={(e) => onChange(e.target.value)}>
        <option value="">{c.obrigatorio ? "Escolha" : "—"}</option>
        {c.opcoes?.map((o) => <option key={o}>{o}</option>)}
      </select>
    ) : (
      <input
        {...comum}
        onChange={(e) => onChange(e.target.value)}
        onBlur={c.tipo === "cep" ? aoSairDoCep : undefined}
        type={c.tipo === "data" ? "date" : c.tipo === "email" ? "email" : "text"}
        inputMode={c.tipo === "cpf" || c.tipo === "cep" ? "numeric" : c.tipo === "telefone" ? "tel" : c.tipo === "dinheiro" ? "decimal" : undefined}
        autoComplete={c.tipo === "cpf" ? "off" : undefined}
        placeholder={c.dica ?? (c.tipo === "cpf" ? "000.000.000-00" : c.tipo === "telefone" ? "(21) 99999-9999" : c.tipo === "dinheiro" ? "0,00" : undefined)}
      />
    );
  return (
    <label className={`flex flex-col gap-1 ${c.largo ? "sm:col-span-2" : ""}`}>
      <span className="text-xs font-medium text-neutral-600">{c.rotulo}{c.obrigatorio && <span className="text-red-600"> *</span>}</span>
      {entrada}
    </label>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-surface p-5">
      <legend className="px-1 text-sm font-semibold">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function FichaFinanciamento({ slug, carros, carroInicial, config, nomeDaLoja, linkPolitica }: { slug: string; carros: CarroDaLista[]; carroInicial: string; config: ConfigFicha; nomeDaLoja: string; linkPolitica: string }) {
  const { estado, erro, enviar } = useEnvio(slug, "financiamento");
  const [g, setG] = useState<Record<string, Grupo>>({ veiculo: { veiculoId: carroInicial } });
  const [refP, setRefP] = useState<Grupo[]>(Array.from({ length: config.refPessoais }, () => ({})));
  const [refB, setRefB] = useState<Grupo[]>(Array.from({ length: config.refBancarias }, () => ({})));
  const [consentimento, setConsentimento] = useState(false);
  const [isca, setIsca] = useState("");
  if (estado === "feito") return <Feito texto="Sua ficha chegou à loja. A equipe vai analisar com os bancos e chamar você no WhatsApp." />;
  const set = (grupo: string, chave: string) => (v: string) => setG((a) => ({ ...a, [grupo]: { ...a[grupo], [chave]: v } }));
  const grade = (grupo: keyof typeof CAMPOS, campos: Campo[], extra?: (c: Campo) => (() => void) | undefined) => (
    <div className="grid gap-3 sm:grid-cols-2">
      {campos.map((c) => <CampoDaFicha key={c.chave} c={c} valor={g[grupo]?.[c.chave] ?? ""} onChange={set(grupo, c.chave)} aoSairDoCep={extra?.(c)} />)}
    </div>
  );
  const cepDoEndereco = async () => {
    const cep = (g.endereco?.cep ?? "").replace(/\D/g, "");
    if (cep.length !== 8) return;
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).then((x) => x.json()).catch(() => null);
    if (!r || r.erro) return;
    setG((a) => ({ ...a, endereco: { ...a.endereco, logradouro: a.endereco?.logradouro || r.logradouro || "", bairro: r.bairro || a.endereco?.bairro || "", cidade: r.localidade || a.endereco?.cidade || "", uf: r.uf || a.endereco?.uf || "" } }));
  };
  const lista = (itens: Grupo[], setItens: (x: Grupo[]) => void, campos: Campo[], nome: string) =>
    itens.map((item, i) => (
      <div key={i} className="flex flex-col gap-2">
        {itens.length > 1 && <p className="text-xs font-medium text-neutral-500">{nome} {i + 1}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          {campos.map((c) => <CampoDaFicha key={c.chave} c={c} valor={item[c.chave] ?? ""} onChange={(v) => setItens(itens.map((x, j) => (j === i ? { ...x, [c.chave]: v } : x)))} />)}
        </div>
      </div>
    ));
  return (
    <form
      className="relative flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        enviar({ ficha: { ...g, refPessoais: refP, refBancarias: refB }, consentimento, site: isca });
      }}
    >
      <Bloco titulo="Dados pessoais">{grade("pessoais", CAMPOS.pessoais)}</Bloco>
      {config.endereco && <Bloco titulo="Endereço">{grade("endereco", CAMPOS.endereco, (c) => (c.tipo === "cep" ? cepDoEndereco : undefined))}</Bloco>}
      {config.profissional && <Bloco titulo="Dados profissionais">{grade("profissional", CAMPOS.profissional)}</Bloco>}
      {config.conjuge && <Bloco titulo="Cônjuge">{grade("conjuge", CAMPOS.conjuge)}</Bloco>}
      {config.refPessoais > 0 && <Bloco titulo={config.refPessoais > 1 ? "Referências pessoais" : "Referência pessoal"}>{lista(refP, setRefP, CAMPOS.refPessoal, "Referência")}</Bloco>}
      {config.refBancarias > 0 && <Bloco titulo={config.refBancarias > 1 ? "Referências bancárias" : "Referência bancária"}>{lista(refB, setRefB, CAMPOS.refBancaria, "Conta")}</Bloco>}
      {config.veiculo && (
        <Bloco titulo="Veículo e financiamento">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">Carro de interesse</span>
            <select aria-label="Carro de interesse" value={g.veiculo?.veiculoId ?? ""} onChange={(e) => set("veiculo", "veiculoId")(e.target.value)} className={campo}>
              <option value="">Ainda não escolhi / não está na lista</option>
              {carros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          {grade("veiculo", CAMPOS.veiculo)}
        </Bloco>
      )}
      <Isca valor={isca} onChange={setIsca} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" required checked={consentimento} onChange={(e) => setConsentimento(e.target.checked)} className="mt-1" />
        <span>Autorizo a {nomeDaLoja} a usar estes dados para analisar meu crédito junto a bancos e financeiras, conforme a <a href={linkPolitica} target="_blank" rel="noreferrer" className="underline">política de privacidade</a>.</span>
      </label>
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      <div>
        <button disabled={estado === "enviando"} className={botao} style={{ background: "var(--loja)", color: "var(--loja-texto)" }}>
          {estado === "enviando" ? "Enviando…" : "Enviar ficha"}
        </button>
      </div>
      <p className="text-xs text-neutral-500">Seus dados chegam protegidos à loja, são usados só para a análise de crédito e apagados em até 180 dias.</p>
    </form>
  );
}
