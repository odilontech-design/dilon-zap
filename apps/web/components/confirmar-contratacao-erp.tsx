"use client";

import { useState } from "react";

type Ok = { jaCriado: false; loginUrl: string; email: string; senha: string; fimDoTeste: string; primeiraCobranca: string; valorMensalCents: number; linkDePagamento: string | null; avisoCobranca: string | null } | { jaCriado: true };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

export function ConfirmarContratacaoErp({ token }: { token: string }) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<Ok | null>(null);

  async function confirmar() {
    setErro(null); setEnviando(true);
    try {
      const r = await fetch("/api/contratar-erp/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(j.error ?? "Não foi possível concluir. Tente de novo.");
      setOk(j);
    } finally { setEnviando(false); }
  }

  if (ok?.jaCriado) return <p className="rounded-lg border border-neutral-200 bg-surface p-6 text-sm">Este escritório já foi criado. Veja o e-mail de boas-vindas com o acesso, ou fale com a Dilon Tech.</p>;
  if (ok) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-6">
        <p className="text-lg font-semibold">Seu escritório está pronto 🎉</p>
        <div className="rounded-md bg-neutral-50 p-4 text-sm leading-relaxed">
          <p><strong>Endereço:</strong> <a className="text-accent underline" href={ok.loginUrl}>{ok.loginUrl}</a></p>
          <p><strong>E-mail:</strong> {ok.email}</p>
          <p><strong>Senha provisória:</strong> <code className="select-all rounded bg-white px-2 py-0.5 text-base font-semibold">{ok.senha}</code></p>
          <p className="mt-2 text-xs text-neutral-600">Anote agora: ela aparece só aqui e no e-mail de boas-vindas. No primeiro acesso você cria a sua senha.</p>
        </div>
        <p className="text-sm text-neutral-700">Teste sem cobrança até <strong>{dataBR(ok.fimDoTeste)}</strong>. Primeira cobrança de <strong>{brl(ok.valorMensalCents)}</strong> em <strong>{dataBR(ok.primeiraCobranca)}</strong>.</p>
        {ok.linkDePagamento ? (
          <a href={ok.linkDePagamento} className="rounded-md border border-accent px-4 py-3 text-center text-sm font-medium text-accent hover:bg-neutral-50">Deixar o pagamento cadastrado (opcional agora)</a>
        ) : (
          <p className="text-xs text-neutral-500">O link de pagamento chega por e-mail antes da primeira cobrança.</p>
        )}
        <a href={ok.loginUrl} className="rounded-md bg-accent px-4 py-3 text-center text-sm font-medium text-white hover:opacity-90">Entrar no sistema</a>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-surface p-6">
      <p className="text-base font-semibold">Confirmar e criar meu escritório</p>
      <p className="text-sm text-neutral-600">Ao confirmar, criamos o seu escritório e o seu acesso. O aceite do termo que você marcou fica registrado.</p>
      {erro && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      <button type="button" onClick={confirmar} disabled={enviando} className="rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {enviando ? "Criando seu escritório… (pode levar alguns segundos)" : "Confirmar e criar"}
      </button>
    </div>
  );
}
