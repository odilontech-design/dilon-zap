"use client";

import { useState } from "react";
import useSWR from "swr";

/**
 * Painel do site de uma empresa (aba "Site"): endereço do site e chave, com "Testar conexão". A chave é digitada
 * aqui, vai direto ao servidor e nunca volta: depois de salva, a tela só mostra que está configurada.
 */

type Resp =
  | { configurada: false; temRecurso: boolean }
  | { configurada: true; temRecurso: boolean; url: string; testadoEm: string | null; testeOk: boolean | null; atualizadoEm: string };

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const campo = "w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100";

export function PainelEcommercePanel({ tenantId }: { tenantId: string }) {
  const { data, mutate } = useSWR<Resp>(`/api/admin/tenants/${tenantId}/painel-ecommerce`, fetcher);
  const [url, setUrl] = useState("");
  const [chave, setChave] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<"testar" | "salvar" | "remover" | null>(null);

  // Só aparece para quem tem o recurso ligado (ou já tem o painel cadastrado).
  if (!data || (!data.temRecurso && !data.configurada)) return null;

  const endereco = url || (data.configurada ? data.url : "");

  async function chamar(metodo: "POST" | "PUT" | "DELETE", acao: "testar" | "salvar" | "remover") {
    setMsg(null);
    setOcupado(acao);
    try {
      const r = await fetch(`/api/admin/tenants/${tenantId}/painel-ecommerce`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: metodo === "DELETE" ? undefined : JSON.stringify({ url: endereco, chave: chave || undefined }),
      });
      const tipo = r.headers.get("content-type") ?? "";
      if (!tipo.includes("application/json")) return setMsg({ ok: false, texto: "Sua sessão expirou. Entre de novo; nada foi feito." });
      const j = await r.json();
      if (acao === "testar") {
        setMsg(j.ok ? { ok: true, texto: `Conexão funcionando (painel versão ${j.versao}, gerado em ${new Date(j.geradoEm).toLocaleString("pt-BR")}).` } : { ok: false, texto: j.erro ?? "Não conectou." });
      } else if (!r.ok) {
        setMsg({ ok: false, texto: typeof j.error === "string" ? j.error : "Não deu para salvar." });
      } else {
        setMsg({ ok: true, texto: acao === "salvar" ? "Salvo. A chave foi guardada cifrada." : "Painel do site removido desta empresa." });
        if (acao === "salvar") setChave("");
      }
      mutate();
    } catch {
      setMsg({ ok: false, texto: "Sem conexão com o servidor. Nada foi feito." });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <section className="mb-8 rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-1 text-sm font-semibold text-neutral-100">Painel do site (e-commerce)</h2>
      <p className="mb-3 text-xs text-neutral-400">
        De onde a aba "Site" lê os números da loja online. A chave é digitada aqui e nunca é mostrada depois; só a gestão da empresa vê a aba.
      </p>
      {data.configurada && (
        <p className="mb-3 text-xs text-neutral-300">
          Configurado para <b>{data.url}</b>
          {data.testeOk === true && <span className="text-emerald-400"> · último teste funcionou {data.testadoEm ? `(${new Date(data.testadoEm).toLocaleString("pt-BR")})` : ""}</span>}
          {data.testeOk === false && <span className="text-red-400"> · o último teste falhou</span>}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs text-neutral-300">
          Endereço do site
          <input value={url || (data.configurada ? data.url : "")} onChange={(e) => setUrl(e.target.value)} placeholder="https://minhaloja.com.br" className={`${campo} mt-1`} autoComplete="off" />
        </label>
        <label className="text-xs text-neutral-300">
          Chave do painel {data.configurada ? "(deixe em branco para manter a atual)" : ""}
          <input type="password" value={chave} onChange={(e) => setChave(e.target.value)} className={`${campo} mt-1`} autoComplete="new-password" spellCheck={false} />
        </label>
      </div>
      {msg && (
        <p role="status" className={`mt-3 rounded-md border px-3 py-2 text-xs ${msg.ok ? "border-emerald-900 bg-emerald-950/40 text-emerald-300" : "border-red-900 bg-red-950/40 text-red-300"}`}>
          {msg.texto}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={!!ocupado || !endereco} onClick={() => chamar("POST", "testar")} className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs text-neutral-100 hover:bg-neutral-800 disabled:opacity-50">
          {ocupado === "testar" ? "Testando…" : "Testar conexão"}
        </button>
        <button disabled={!!ocupado || !endereco} onClick={() => chamar("PUT", "salvar")} className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-medium text-neutral-950 hover:opacity-90 disabled:opacity-50">
          {ocupado === "salvar" ? "Salvando…" : "Salvar"}
        </button>
        {data.configurada && (
          <button disabled={!!ocupado} onClick={() => confirm("Remover o painel do site desta empresa? A chave guardada é apagada.") && chamar("DELETE", "remover")} className="ml-auto rounded-md border border-red-900 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50">
            Remover
          </button>
        )}
      </div>
    </section>
  );
}
