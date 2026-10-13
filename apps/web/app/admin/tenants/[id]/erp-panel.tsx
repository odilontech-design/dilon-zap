"use client";

import { useState } from "react";
import useSWR from "swr";
import { ERP_PLANOS, PLANOS_ERP, reaisParaCentavos, type ErpPlano } from "@/lib/erp-regras";

/**
 * ERP Dilon Contabilidade na ficha da empresa: ativar, ajustar plano/limites/preço,
 * ver o uso, suspender/reativar e redefinir a senha do administrador do escritório.
 */

type Erp = {
  escritorioSlug: string; loginUrl: string; plano: ErpPlano; mensalCents: number;
  limiteEmpresas: number | null; limiteUsuarios: number | null;
  status: "ATIVO" | "SUSPENSO"; suspensoPor: "AUTO" | "MANUAL" | null; suspensoMotivo: string | null;
  empresasAtivas: number | null; usuariosEquipe: number | null; acessosPortal: number | null;
  ultimaAtividadeEm: string | null; usoAtualizadoEm: string | null;
};
type Resp = { configurado: boolean; erp: Erp | null };
type Senha = { email: string; nome: string; senhaProvisoria: string };

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const campo = "w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100";
const btn = "rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50";

export function ErpPanel({ tenantId, tenantName, onSalvo }: { tenantId: string; tenantName: string; onSalvo: () => void }) {
  const { data, mutate } = useSWR<Resp>(`/api/admin/tenants/${tenantId}/erp`, fetcher);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [senha, setSenha] = useState<Senha | null>(null);

  async function enviar(corpo: Record<string, unknown>, metodo: "POST" | "PUT" = "POST") {
    setOcupado(true); setErro(null); setAviso(null);
    try {
      const r = await fetch(`/api/admin/tenants/${tenantId}/erp`, { method: metodo, headers: { "Content-Type": "application/json" }, body: metodo === "PUT" ? undefined : JSON.stringify(corpo) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(typeof j.error === "string" ? j.error : "Não foi possível concluir."); return null; }
      if (j.admin) setSenha(j.admin);
      if (j.avisoCobranca) setAviso(j.avisoCobranca);
      await mutate(); onSalvo();
      return j;
    } finally { setOcupado(false); }
  }

  if (!data) return null;
  const erp = data.erp;

  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-medium text-neutral-200">ERP Dilon Contabilidade</h2>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-300">
        {!data.configurado && <p className="mb-3 rounded-md bg-amber-950/50 p-2 text-xs text-amber-300">Integração não configurada neste ambiente (ERP_CONTABILIDADE_URL e ERP_CONTABILIDADE_TOKEN).</p>}
        {erro && <p className="mb-3 rounded-md bg-red-950/50 p-2 text-xs text-red-300">{erro}</p>}
        {aviso && <p className="mb-3 rounded-md bg-amber-950/50 p-2 text-xs text-amber-300">{aviso}</p>}
        {senha && (
          <div className="mb-3 rounded-md border border-emerald-800 bg-emerald-950/40 p-3 text-xs">
            <p className="mb-1 text-emerald-300">Senha provisória de {senha.nome} ({senha.email}). Anote agora: ela não será mostrada de novo.</p>
            <code className="select-all text-base text-emerald-200">{senha.senhaProvisoria}</code>
            <button className="ml-3 text-neutral-400 underline" onClick={() => setSenha(null)}>ocultar</button>
          </div>
        )}
        {erp ? <Ativo erp={erp} ocupado={ocupado} enviar={enviar} /> : <Ativar nome={tenantName} ocupado={ocupado || !data.configurado} enviar={enviar} />}
      </div>
    </section>
  );
}

function Ativar({ nome, ocupado, enviar }: { nome: string; ocupado: boolean; enviar: (c: Record<string, unknown>) => Promise<unknown> }) {
  const [plano, setPlano] = useState<ErpPlano>("ESSENCIAL");
  const [preco, setPreco] = useState("297,00");
  const [le, setLe] = useState("30");
  const [lu, setLu] = useState("3");
  const [escNome, setEscNome] = useState(nome);
  const [admNome, setAdmNome] = useState("");
  const [admEmail, setAdmEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function escolher(p: ErpPlano) {
    setPlano(p);
    const d = ERP_PLANOS[p];
    setLe(d.limiteEmpresas?.toString() ?? ""); setLu(d.limiteUsuarios?.toString() ?? "");
    if (d.sugestaoMensalCents) setPreco((d.sugestaoMensalCents / 100).toFixed(2).replace(".", ","));
  }
  function ativar() {
    const mensal = reaisParaCentavos(preco);
    if (mensal === null) return setMsg("Preço inválido.");
    const e = le.trim() ? Number(le) : null, u = lu.trim() ? Number(lu) : null;
    if ((e !== null && !(Number.isInteger(e) && e > 0)) || (u !== null && !(Number.isInteger(u) && u > 0))) return setMsg("Limites devem ser números inteiros positivos (vazio = ilimitado).");
    setMsg(null);
    void enviar({ acao: "ativar", plano, mensalCents: mensal, limiteEmpresas: e, limiteUsuarios: u, escritorioNome: escNome, adminNome: admNome, adminEmail: admEmail, codigo: codigo || undefined });
  }

  return (
    <div>
      <p className="mb-3 text-xs text-neutral-500">Cria o escritório no ERP, gera o administrador com senha provisória e soma o valor à assinatura desta empresa.</p>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLANOS_ERP.map((p) => (
          <button key={p} onClick={() => escolher(p)} className={`rounded-md border px-3 py-2 text-left ${plano === p ? "border-emerald-600 bg-emerald-950/40" : "border-neutral-700"}`}>
            <span className="block text-sm font-medium">{ERP_PLANOS[p].nome}</span>
            <span className="block text-xs opacity-70">{ERP_PLANOS[p].resumo}</span>
          </button>
        ))}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <label className="text-xs">Preço mensal (R$)<input className={campo} value={preco} onChange={(e) => setPreco(e.target.value)} /></label>
        <label className="text-xs">Limite de empresas<input className={campo} value={le} onChange={(e) => setLe(e.target.value)} placeholder="ilimitado" /></label>
        <label className="text-xs">Limite de usuários<input className={campo} value={lu} onChange={(e) => setLu(e.target.value)} placeholder="ilimitado" /></label>
        <label className="text-xs">Nome do escritório<input className={campo} value={escNome} onChange={(e) => setEscNome(e.target.value)} /></label>
        <label className="text-xs">Código de acesso (opcional)<input className={campo} value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="gerado do nome" /></label>
        <span />
        <label className="text-xs">Administrador — nome<input className={campo} value={admNome} onChange={(e) => setAdmNome(e.target.value)} /></label>
        <label className="text-xs">Administrador — e-mail<input className={campo} value={admEmail} onChange={(e) => setAdmEmail(e.target.value)} /></label>
      </div>
      {msg && <p className="mb-2 text-xs text-red-300">{msg}</p>}
      <button disabled={ocupado || !escNome || !admNome || !admEmail} onClick={ativar} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50">Ativar ERP</button>
    </div>
  );
}

function Ativo({ erp, ocupado, enviar }: { erp: Erp; ocupado: boolean; enviar: (c: Record<string, unknown>, m?: "POST" | "PUT") => Promise<unknown> }) {
  const [editando, setEditando] = useState(false);
  const [plano, setPlano] = useState(erp.plano);
  const [preco, setPreco] = useState((erp.mensalCents / 100).toFixed(2).replace(".", ","));
  const [le, setLe] = useState(erp.limiteEmpresas?.toString() ?? "");
  const [lu, setLu] = useState(erp.limiteUsuarios?.toString() ?? "");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const uso = (u: number | null, l: number | null) => (u === null ? "—" : l === null ? `${u}` : `${u} / ${l}`);
  const cheio = (u: number | null, l: number | null) => u !== null && l !== null && u >= l;

  async function salvar() {
    const mensal = reaisParaCentavos(preco);
    if (mensal === null) return setMsg("Preço inválido.");
    const e = le.trim() ? Number(le) : null, u = lu.trim() ? Number(lu) : null;
    if ((e !== null && !(Number.isInteger(e) && e > 0)) || (u !== null && !(Number.isInteger(u) && u > 0))) return setMsg("Limites devem ser inteiros positivos (vazio = ilimitado).");
    setMsg(null);
    if (await enviar({ acao: "alterar", plano, mensalCents: mensal, limiteEmpresas: e, limiteUsuarios: u })) setEditando(false);
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${erp.status === "ATIVO" ? "bg-emerald-900/60 text-emerald-300" : "bg-red-900/60 text-red-300"}`}>{erp.status === "ATIVO" ? "Ativo" : "Suspenso"}</span>
        <span className="text-xs">{ERP_PLANOS[erp.plano].nome} · {brl(erp.mensalCents)}/mês</span>
        {erp.status === "SUSPENSO" && <span className="text-xs text-neutral-400">{erp.suspensoPor === "AUTO" ? "automático" : "manual"} · {erp.suspensoMotivo}</span>}
      </div>

      <dl className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div><dt className="text-neutral-500">Empresas-cliente</dt><dd className={cheio(erp.empresasAtivas, erp.limiteEmpresas) ? "text-amber-300" : ""}>{uso(erp.empresasAtivas, erp.limiteEmpresas)}</dd></div>
        <div><dt className="text-neutral-500">Usuários</dt><dd className={cheio(erp.usuariosEquipe, erp.limiteUsuarios) ? "text-amber-300" : ""}>{uso(erp.usuariosEquipe, erp.limiteUsuarios)}</dd></div>
        <div><dt className="text-neutral-500">Acessos ao portal</dt><dd>{erp.acessosPortal ?? "—"}</dd></div>
        <div><dt className="text-neutral-500">Última atividade</dt><dd>{erp.ultimaAtividadeEm ? new Date(erp.ultimaAtividadeEm).toLocaleString("pt-BR") : "—"}</dd></div>
      </dl>

      <p className="mb-3 text-xs text-neutral-400">
        Acesso: <a className="text-emerald-400 underline" href={erp.loginUrl} target="_blank" rel="noreferrer">{erp.loginUrl}</a> · código <code>{erp.escritorioSlug}</code>
      </p>

      {editando ? (
        <div className="mb-3 rounded-md border border-neutral-800 p-3">
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PLANOS_ERP.map((p) => (
              <button key={p} onClick={() => { setPlano(p); const d = ERP_PLANOS[p]; setLe(d.limiteEmpresas?.toString() ?? ""); setLu(d.limiteUsuarios?.toString() ?? ""); if (d.sugestaoMensalCents) setPreco((d.sugestaoMensalCents / 100).toFixed(2).replace(".", ",")); }} className={`rounded-md border px-2 py-1.5 text-left text-xs ${plano === p ? "border-emerald-600" : "border-neutral-700"}`}>{ERP_PLANOS[p].nome}</button>
            ))}
          </div>
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <label className="text-xs">Preço mensal (R$)<input className={campo} value={preco} onChange={(e) => setPreco(e.target.value)} /></label>
            <label className="text-xs">Limite de empresas<input className={campo} value={le} onChange={(e) => setLe(e.target.value)} placeholder="ilimitado" /></label>
            <label className="text-xs">Limite de usuários<input className={campo} value={lu} onChange={(e) => setLu(e.target.value)} placeholder="ilimitado" /></label>
          </div>
          {msg && <p className="mb-2 text-xs text-red-300">{msg}</p>}
          <button className={btn} disabled={ocupado} onClick={salvar}>Salvar</button>
          <button className={`${btn} ml-2`} onClick={() => setEditando(false)}>Cancelar</button>
        </div>
      ) : (
        <div className="mb-3 flex flex-wrap gap-2">
          <button className={btn} disabled={ocupado} onClick={() => setEditando(true)}>Plano, limites e preço</button>
          <button className={btn} disabled={ocupado} onClick={() => enviar({}, "PUT")}>Atualizar uso</button>
          <button className={btn} disabled={ocupado} onClick={() => enviar({ acao: "sincronizar" })}>Sincronizar com a cobrança</button>
          {erp.status === "ATIVO" ? (
            <button className={btn} disabled={ocupado} onClick={() => { const m = window.prompt("Motivo da suspensão (o escritório perde o acesso na hora; os dados ficam intactos):"); if (m && m.trim().length >= 3) void enviar({ acao: "suspender", motivo: m.trim() }); }}>Suspender</button>
          ) : (
            <button className={btn} disabled={ocupado} onClick={() => enviar({ acao: "reativar" })}>Reativar</button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">Redefinir senha de (e-mail)<input className={`${campo} w-64`} value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className={btn} disabled={ocupado || !email} onClick={async () => { if (await enviar({ acao: "redefinir-senha", email })) setEmail(""); }}>Gerar senha provisória</button>
      </div>
    </div>
  );
}
