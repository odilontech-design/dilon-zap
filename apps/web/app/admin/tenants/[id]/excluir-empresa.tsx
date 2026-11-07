"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/contact";

type Impacto = {
  nome: string;
  usuarios: number;
  sessoes: number;
  contatos: number;
  conversas: number;
  mensagens: number;
  pedidos: number;
  ultimaMensagemEm: string | null;
  impeditivos: string[];
};

/**
 * Excluir a empresa que não usa a ferramenta. Definitivo, por isso: mostra o
 * que será apagado, bloqueia o que não pode ser apagado e só libera o botão
 * quando o nome da empresa é digitado igual.
 */
export function ExcluirEmpresa({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [impacto, setImpacto] = useState<Impacto | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [nome, setNome] = useState("");
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAberto(true);
    setNome("");
    setErro(null);
    setImpacto(null);
    setCarregando(true);
    const res = await fetch(`/api/admin/tenants/${tenantId}/exclusao`);
    setCarregando(false);
    if (!res.ok) {
      setErro("Não foi possível calcular o que será apagado. Tente de novo.");
      return;
    }
    setImpacto(await res.json());
  }

  async function excluir() {
    setExcluindo(true);
    setErro(null);
    const res = await fetch(`/api/admin/tenants/${tenantId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmaNome: nome }),
    });
    const corpo = await res.json().catch(() => ({}));
    setExcluindo(false);
    if (!res.ok) {
      setErro(typeof corpo.error === "string" ? corpo.error : "Não foi possível excluir.");
      return;
    }
    if (corpo.avisoMidia) alert(`Empresa excluída, mas os arquivos de mídia não foram limpos: ${corpo.avisoMidia}`);
    router.push("/admin");
    router.refresh();
  }

  const bloqueada = (impacto?.impeditivos.length ?? 0) > 0;
  const confere = nome.trim().toLowerCase() === tenantName.trim().toLowerCase();

  return (
    <section className="mb-8 rounded-lg border border-red-900/60 bg-red-950/20 p-4">
      <h2 className="text-sm font-medium text-red-300">Zona de risco</h2>
      <p className="mt-1 text-xs text-neutral-400">
        Para empresa que não usa a ferramenta. Apaga a empresa e tudo que é dela, e não tem como desfazer pelo painel.
      </p>
      <button
        onClick={abrir}
        className="mt-3 rounded-md border border-red-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950"
      >
        Excluir empresa
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => !excluindo && setAberto(false)}>
          <div
            className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-neutral-100">Excluir {tenantName}?</h3>

            {carregando && <p className="mt-3 text-sm text-neutral-400">Calculando o que será apagado...</p>}

            {impacto && (
              <>
                <p className="mt-3 text-sm text-neutral-300">Será apagado, para sempre:</p>
                <ul className="mt-1 text-sm text-neutral-300 list-disc pl-5">
                  <li>{impacto.usuarios} usuário(s) e {impacto.sessoes} número(s) de WhatsApp (o aparelho é desvinculado)</li>
                  <li>{impacto.contatos} contato(s), {impacto.conversas} conversa(s) e {impacto.mensagens} mensagem(ns)</li>
                  <li>{impacto.pedidos} pedido(s), o financeiro, as negociações e os arquivos enviados</li>
                </ul>
                <p className="mt-2 text-xs text-neutral-500">
                  Última mensagem: {impacto.ultimaMensagemEm ? formatDate(impacto.ultimaMensagemEm) : "nunca houve conversa"}.
                  O registro desta exclusão fica no log de auditoria.
                </p>

                {bloqueada ? (
                  <div className="mt-3 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
                    <p className="font-medium">Não dá para excluir ainda:</p>
                    <ul className="mt-1 list-disc pl-5">
                      {impacto.impeditivos.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mt-4">
                    <label className="block text-xs text-neutral-400 mb-1">
                      Para confirmar, digite o nome da empresa: <span className="text-neutral-200">{tenantName}</span>
                    </label>
                    <input
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      autoFocus
                      className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
                    />
                  </div>
                )}
              </>
            )}

            {erro && <p className="mt-3 text-sm text-red-400">{erro}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAberto(false)}
                disabled={excluindo}
                className="px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200"
              >
                Cancelar
              </button>
              {impacto && !bloqueada && (
                <button
                  onClick={excluir}
                  disabled={!confere || excluindo}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-40"
                >
                  {excluindo ? "Excluindo..." : "Excluir definitivamente"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
