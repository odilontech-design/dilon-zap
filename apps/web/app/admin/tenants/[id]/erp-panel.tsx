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
type Termo = {
  versao: string | null; prazoEm: string | null; situacao: "NAO_EXIGIDO" | "ACEITO" | "PENDENTE" | "VENCIDO" | "RECUSADO"; bloqueado: boolean; diasRestantes: number | null;
  decisao: { decisao: "ACEITO" | "RECUSADO"; em: string; signatario: string; email: string; hash: string } | null;
};
type Aviso = { titulo: string; texto: string; tom: "INFO" | "ALERTA" | "URGENTE"; ate: string | null };
type Condicoes = { plano: string; valorMensalCents: number; valorTabelaCents: number; garantiaMeses: number; primeiraCobranca: string; fimDoTeste: string; diaVencimento: number; observacao?: string };
type Aceite = { id: string; versao: string; decisao: "ACEITO" | "RECUSADO"; em: string; signatario: string; cpf: string; email: string; ip: string | null; hash: string };
type Resp = {
  configurado: boolean; erp: Erp | null; termo: Termo | null; aviso: Aviso | null;
  sugestaoDeCondicoes: Condicoes | null; versoesDeTermo: { atual: string; versoes: string[] } | null;
};
const ROTULO_TERMO = { NAO_EXIGIDO: "Não exigido", ACEITO: "Aceito", PENDENTE: "Aguardando aceite", VENCIDO: "Prazo vencido — bloqueado", RECUSADO: "Recusado — bloqueado" } as const;
const COR_TERMO = { NAO_EXIGIDO: "bg-neutral-800 text-neutral-300", ACEITO: "bg-emerald-900/60 text-emerald-300", PENDENTE: "bg-amber-900/60 text-amber-300", VENCIDO: "bg-red-900/60 text-red-300", RECUSADO: "bg-red-900/60 text-red-300" } as const;
const dataBR = (iso: string) => iso.split("-").reverse().join("/");
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
        {erp ? (
          <>
            <Ativo erp={erp} ocupado={ocupado} enviar={enviar} />
            <TermoEAviso tenantId={tenantId} data={data} ocupado={ocupado} enviar={enviar} />
          </>
        ) : (
          <Ativar nome={tenantName} ocupado={ocupado || !data.configurado} enviar={enviar} />
        )}
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
  const [vincular, setVincular] = useState("");
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
    void enviar({ acao: "ativar", plano, mensalCents: mensal, limiteEmpresas: e, limiteUsuarios: u, escritorioNome: escNome, adminNome: admNome, adminEmail: admEmail, codigo: codigo || undefined, vincularCodigo: vincular || undefined });
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
        <label className="text-xs sm:col-span-3">Escritório que já existe no ERP? Informe o código dele para ligar em vez de criar outro
          <input className={campo} value={vincular} onChange={(e) => setVincular(e.target.value)} placeholder="ex.: guttierres (deixe vazio para criar um novo)" />
        </label>
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

function TermoEAviso({ tenantId, data, ocupado, enviar }: { tenantId: string; data: Resp; ocupado: boolean; enviar: (c: Record<string, unknown>) => Promise<unknown> }) {
  const termo = data.termo;
  const sug = data.sugestaoDeCondicoes;
  const [prazo, setPrazo] = useState("");
  const [versao, setVersao] = useState(data.versoesDeTermo?.atual ?? "");
  const [cond, setCond] = useState<Condicoes | null>(null);
  const [aberto, setAberto] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [aceites, setAceites] = useState<Aceite[] | null>(null);
  // Aviso
  const [titulo, setTitulo] = useState("");
  const [texto, setTexto] = useState("");
  const [tom, setTom] = useState<"INFO" | "ALERTA" | "URGENTE">("INFO");
  const [ate, setAte] = useState("");

  const c = cond ?? sug;
  const edita = (k: keyof Condicoes, v: string) => c && setCond({ ...c, [k]: k === "valorMensalCents" || k === "valorTabelaCents" ? (reaisParaCentavos(v) ?? 0) : k === "garantiaMeses" || k === "diaVencimento" ? Number(v) : v });

  async function verAceites() {
    const r = await fetch(`/api/admin/tenants/${tenantId}/erp/aceites`).then((x) => x.json()).catch(() => null);
    setAceites(r?.aceites ?? []);
  }

  function exigir() {
    if (!c || !versao) return setMsg("Escolha a versão do termo.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(prazo)) return setMsg("Informe o prazo do aceite.");
    setMsg(null);
    void enviar({ acao: "exigir-termo", versao, prazoEm: prazo, condicoes: c }).then(() => setAberto(false));
  }

  return (
    <div className="mt-6 border-t border-neutral-800 pt-4">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">Termo de aceite</h3>
      {termo && (
        <div className="mb-3 space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-0.5 ${COR_TERMO[termo.situacao]}`}>{ROTULO_TERMO[termo.situacao]}</span>
            {termo.versao && <span>versão {termo.versao}</span>}
            {termo.prazoEm && <span>prazo {dataBR(termo.prazoEm)}{termo.diasRestantes !== null ? ` (${termo.diasRestantes === 0 ? "vence hoje" : `${termo.diasRestantes} dia(s)`})` : ""}</span>}
          </div>
          {termo.decisao && (
            <p className="text-neutral-400">
              {termo.decisao.decisao === "ACEITO" ? "Aceito" : "Recusado"} por {termo.decisao.signatario} ({termo.decisao.email}) em {new Date(termo.decisao.em).toLocaleString("pt-BR")} · código {termo.decisao.hash.slice(0, 12)}
            </p>
          )}
        </div>
      )}
      {!aberto ? (
        <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={ocupado || !data.versoesDeTermo} onClick={() => setAberto(true)}>{termo?.versao ? "Exigir de novo / mudar prazo" : "Exigir aceite do termo"}</button>
          {termo?.versao && <button className={btn} disabled={ocupado} onClick={() => window.confirm("Retirar a exigência? O escritório deixa de ver a faixa e de ser bloqueado por esse termo.") && enviar({ acao: "retirar-termo" })}>Retirar exigência</button>}
          <button className={btn} onClick={verAceites}>Ver comprovantes</button>
        </div>
      ) : (
        c && (
          <div className="rounded-md border border-neutral-800 p-3">
            <p className="mb-2 text-[11px] text-neutral-500">Estas condições entram no texto que o sócio lê e aceita. Sem aceite até o prazo — ou com recusa — o escritório (e o portal dos clientes dele) fica bloqueado; nada é apagado.</p>
            <div className="mb-2 grid gap-2 sm:grid-cols-4">
              <label className="text-xs">Versão do termo
                <select className={campo} value={versao} onChange={(e) => setVersao(e.target.value)}>{(data.versoesDeTermo?.versoes ?? []).map((v) => <option key={v}>{v}</option>)}</select>
              </label>
              <label className="text-xs">Prazo para aceitar<input type="date" className={campo} value={prazo} onChange={(e) => setPrazo(e.target.value)} /></label>
              <label className="text-xs">Valor acordado (R$/mês)<input className={campo} defaultValue={(c.valorMensalCents / 100).toFixed(2).replace(".", ",")} onChange={(e) => edita("valorMensalCents", e.target.value)} /></label>
              <label className="text-xs">Valor de tabela (R$)<input className={campo} defaultValue={(c.valorTabelaCents / 100).toFixed(2).replace(".", ",")} onChange={(e) => edita("valorTabelaCents", e.target.value)} /></label>
              <label className="text-xs">Garantia (meses)<input className={campo} defaultValue={c.garantiaMeses} onChange={(e) => edita("garantiaMeses", e.target.value)} /></label>
              <label className="text-xs">Primeira cobrança<input type="date" className={campo} defaultValue={c.primeiraCobranca} onChange={(e) => edita("primeiraCobranca", e.target.value)} /></label>
              <label className="text-xs">Fim do teste<input type="date" className={campo} defaultValue={c.fimDoTeste} onChange={(e) => edita("fimDoTeste", e.target.value)} /></label>
              <label className="text-xs">Dia do vencimento<input className={campo} defaultValue={c.diaVencimento} onChange={(e) => edita("diaVencimento", e.target.value)} /></label>
            </div>
            <label className="mb-2 block text-xs">Observação que entra no texto (opcional)<input className={campo} maxLength={300} defaultValue={c.observacao ?? ""} onChange={(e) => edita("observacao", e.target.value)} placeholder="ex.: cobrado junto com o Dilon Zap, total de R$ 694,00/mês" /></label>
            {msg && <p className="mb-2 text-xs text-red-300">{msg}</p>}
            <button className={btn} disabled={ocupado} onClick={exigir}>Exigir aceite</button>
            <button className={`${btn} ml-2`} onClick={() => setAberto(false)}>Cancelar</button>
          </div>
        )
      )}
      {aceites && (
        <div className="mt-3 text-xs">
          {aceites.length === 0 ? <p className="text-neutral-500">Nenhuma decisão registrada.</p> : (
            <table className="w-full text-left"><thead className="text-neutral-500"><tr><th className="pr-3">Quando</th><th className="pr-3">Decisão</th><th className="pr-3">Quem</th><th className="pr-3">CPF</th><th className="pr-3">IP</th><th>Código</th></tr></thead>
              <tbody>{aceites.map((a) => <tr key={a.id} className="border-t border-neutral-800"><td className="pr-3 py-1">{new Date(a.em).toLocaleString("pt-BR")}</td><td className="pr-3">{a.decisao === "ACEITO" ? "Aceito" : "Recusado"} (v{a.versao})</td><td className="pr-3">{a.signatario}<div className="text-neutral-500">{a.email}</div></td><td className="pr-3">{a.cpf}</td><td className="pr-3">{a.ip ?? "—"}</td><td><code>{a.hash.slice(0, 12)}</code></td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}

      <h3 className="mb-2 mt-5 text-xs font-medium uppercase tracking-wide text-neutral-400">Aviso no painel do escritório</h3>
      {data.aviso && (
        <p className="mb-2 text-xs text-neutral-300">No ar: <strong>{data.aviso.titulo}</strong> ({data.aviso.tom.toLowerCase()}){data.aviso.ate ? ` até ${dataBR(data.aviso.ate)}` : ""} <button className="ml-2 text-neutral-400 underline" disabled={ocupado} onClick={() => enviar({ acao: "retirar-aviso" })}>retirar</button></p>
      )}
      <div className="grid gap-2 sm:grid-cols-4">
        <label className="text-xs sm:col-span-2">Título<input className={campo} maxLength={120} value={titulo} onChange={(e) => setTitulo(e.target.value)} /></label>
        <label className="text-xs">Tipo
          <select className={campo} value={tom} onChange={(e) => setTom(e.target.value as typeof tom)}><option value="INFO">Informativo</option><option value="ALERTA">Alerta</option><option value="URGENTE">Urgente</option></select>
        </label>
        <label className="text-xs">Some em (opcional)<input type="date" className={campo} value={ate} onChange={(e) => setAte(e.target.value)} /></label>
        <label className="text-xs sm:col-span-4">Mensagem<textarea className={campo} rows={2} maxLength={600} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
      </div>
      <button className={`${btn} mt-2`} disabled={ocupado || !titulo.trim() || !texto.trim()} onClick={() => enviar({ acao: "publicar-aviso", titulo, texto, tom, ate })}>Publicar aviso</button>
    </div>
  );
}
