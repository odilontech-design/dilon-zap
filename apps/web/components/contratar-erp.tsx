"use client";

import { useEffect, useState } from "react";
import { ERP_PLANOS, MODULOS_DO_PLANO, PLANOS_DE_AUTOATENDIMENTO, ROTULO_MODULO_ERP, type ErpPlano, type PlanoDeAutoatendimento } from "@/lib/erp-regras";
import { DIAS_DE_TESTE } from "@/lib/saas";

/**
 * Contratação online do Dilon Contabilidade: plano → dados → termo → confirmação por e-mail.
 * O termo só é mostrado depois do nome do escritório (ele faz parte do texto) e o aceite
 * leva o hash do texto exibido: o servidor só aceita se for o mesmo que ele montaria agora.
 */

type Clausula = { titulo: string; paragrafos: string[] };
type Previa = { titulo: string; clausulas: Clausula[]; hash: string; versao: string; condicoes: { primeiraCobranca: string; fimDoTeste: string; valorMensalCents: number; garantiaMeses: number } };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
// text-base (16px): abaixo disso o iPhone dá zoom ao tocar no campo.
const campo = "w-full rounded-md border border-neutral-300 bg-surface px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-accent";
const rotulo = "font-medium text-neutral-700";

export function ContratarErp({ planoInicial }: { planoInicial: PlanoDeAutoatendimento | null }) {
  const [plano, setPlano] = useState<PlanoDeAutoatendimento>(planoInicial ?? "PROFISSIONAL");
  const [escritorioNome, setEscritorioNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");
  const [responsavelCpf, setResponsavelCpf] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [codigoDesejado, setCodigoDesejado] = useState("");
  const [website, setWebsite] = useState("");

  const [previa, setPrevia] = useState<Previa | null>(null);
  const [aceitei, setAceitei] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  // Mudou o plano ou o nome: o texto do termo muda, e o aceite anterior deixa de valer.
  useEffect(() => { setPrevia(null); setAceitei(false); }, [plano, escritorioNome]);

  const dadosOk = escritorioNome.trim().length > 1 && cnpj.replace(/\D/g, "").length === 14 && responsavelNome.trim().includes(" ") && responsavelCpf.replace(/\D/g, "").length === 11 && /.+@.+\..+/.test(email.trim()) && telefone.replace(/\D/g, "").length >= 10;

  async function lerTermo() {
    setErro(null); setCarregando(true);
    try {
      const r = await fetch("/api/contratar-erp/previa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plano, escritorioNome }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(j.error ?? "Não foi possível mostrar o termo.");
      setPrevia(j);
    } finally { setCarregando(false); }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!previa || !aceitei || enviando) return;
    setErro(null); setEnviando(true);
    try {
      const r = await fetch("/api/contratar-erp/iniciar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano, escritorioNome, cnpj, responsavelNome, responsavelCpf, email, telefone, codigoDesejado, termoHash: previa.hash, aceitei: true, website }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(j.error ?? "Não foi possível enviar. Tente de novo.");
      setEnviado(true);
    } finally { setEnviando(false); }
  }

  if (enviado) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-surface p-6 text-center">
        <p className="text-lg font-semibold">Falta só confirmar seu e-mail ✉️</p>
        <p className="text-sm text-neutral-600">Enviamos um link para <strong>{email}</strong>. Abra-o para criar o escritório (vale por 24 horas). Não chegou? Veja a caixa de spam.</p>
      </div>
    );
  }

  const p = ERP_PLANOS[plano as ErpPlano];
  return (
    <form onSubmit={enviar} className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">1. Escolha o plano</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {PLANOS_DE_AUTOATENDIMENTO.map((id) => {
            const pl = ERP_PLANOS[id];
            const ativo = id === plano;
            return (
              <button key={id} type="button" onClick={() => setPlano(id)} aria-pressed={ativo} className={`flex flex-col gap-1 rounded-lg border p-4 text-left transition ${ativo ? "border-accent bg-surface ring-2 ring-accent" : "border-neutral-200 bg-surface hover:border-neutral-400"}`}>
                <span className="text-sm font-semibold">{pl.nome}</span>
                <span className="text-xl font-semibold">{brl(pl.sugestaoMensalCents)}<span className="text-xs font-normal text-neutral-500">/mês</span></span>
                <span className="text-xs text-neutral-600">{pl.resumo}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-neutral-600">
          Inclui: rotinas, tarefas, empresas-cliente e equipe{MODULOS_DO_PLANO[plano].length ? ` + ${MODULOS_DO_PLANO[plano].map((m) => ROTULO_MODULO_ERP[m].split(" (")[0]).join(", ")}` : ""}. <strong>{DIAS_DE_TESTE} dias grátis</strong>, sem cartão para começar.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-5">
        <h2 className="text-base font-semibold">2. Dados do escritório</h2>
        <input tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute h-0 w-0 opacity-0" placeholder="website" />
        <label className="flex flex-col gap-1 text-sm"><span className={rotulo}>Nome do escritório</span>
          <input required value={escritorioNome} onChange={(e) => setEscritorioNome(e.target.value)} maxLength={120} autoComplete="organization" className={campo} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className={rotulo}>CNPJ</span>
          <input required inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} maxLength={18} placeholder="00.000.000/0000-00" className={campo} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className={rotulo}>Seu nome completo (sócio responsável)</span>
          <input required value={responsavelNome} onChange={(e) => setResponsavelNome(e.target.value)} maxLength={120} autoComplete="name" className={campo} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className={rotulo}>Seu CPF</span>
          <input required inputMode="numeric" value={responsavelCpf} onChange={(e) => setResponsavelCpf(e.target.value)} maxLength={14} placeholder="000.000.000-00" className={campo} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className={rotulo}>E-mail</span>
          <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} autoComplete="email" className={campo} />
          <span className="text-xs text-neutral-500">Será o seu login e receberá o link de confirmação.</span></label>
        <label className="flex flex-col gap-1 text-sm"><span className={rotulo}>WhatsApp</span>
          <input required type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={20} autoComplete="tel" className={campo} /></label>
        <label className="flex flex-col gap-1 text-sm"><span className={rotulo}>Código de acesso (opcional)</span>
          <input value={codigoDesejado} onChange={(e) => setCodigoDesejado(e.target.value)} maxLength={32} placeholder="ex.: meuescritorio" className={campo} />
          <span className="text-xs text-neutral-500">Sua equipe usa no login. Sem ele, criamos a partir do nome.</span></label>
        {!previa && (
          <button type="button" disabled={!dadosOk || carregando} onClick={lerTermo} className="rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {carregando ? "Montando o termo…" : "Continuar e ler o termo"}
          </button>
        )}
      </section>

      {previa && (
        <section className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-5">
          <h2 className="text-base font-semibold">3. Termo de adesão</h2>
          <div className="max-h-96 overflow-y-auto rounded-md border border-neutral-200 bg-white p-4 text-sm leading-relaxed text-neutral-800">
            <p className="mb-3 font-semibold">{previa.titulo}</p>
            {previa.clausulas.map((c) => (
              <div key={c.titulo} className="mb-3">
                <p className="font-semibold">{c.titulo}</p>
                {c.paragrafos.map((t, i) => <p key={i} className="mb-1.5">{t}</p>)}
              </div>
            ))}
          </div>
          <p className="text-xs text-neutral-600">Teste sem cobrança até <strong>{dataBR(previa.condicoes.fimDoTeste)}</strong>. Primeira cobrança de <strong>{brl(previa.condicoes.valorMensalCents)}</strong> em <strong>{dataBR(previa.condicoes.primeiraCobranca)}</strong>; você recebe o link de pagamento antes, e pode cancelar quando quiser.</p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={aceitei} onChange={(e) => setAceitei(e.target.checked)} className="mt-0.5" />
            <span>Li o termo e aceito, em nome do escritório (tenho poderes para isso). Fica registrado: texto, data e hora, meu IP, nome, CPF e e-mail.</span>
          </label>
          {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
          <button type="submit" disabled={!aceitei || enviando} className="rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {enviando ? "Enviando…" : "Aceitar e receber o link de confirmação"}
          </button>
          <p className="text-xs text-neutral-500">Plano {p.nome}. O escritório só é criado depois que você confirmar o e-mail.</p>
        </section>
      )}
      {!previa && erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
    </form>
  );
}
