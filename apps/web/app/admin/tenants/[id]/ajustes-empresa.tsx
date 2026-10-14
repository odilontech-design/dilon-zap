"use client";

import { useState } from "react";

type Ajustes = { conversasAbertasATodos: boolean; restringirFilaGeral: boolean; termoPedido: string | null };

/**
 * Ajustes que antes só mudavam direto no banco. Cada mudança salva na hora e
 * fica na auditoria.
 */
export function AjustesEmpresa({ tenantId, inicial, onSalvo }: { tenantId: string; inicial: Ajustes; onSalvo: () => void }) {
  const [ajustes, setAjustes] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(mudanca: Partial<{ conversasAbertasATodos: boolean; restringirFilaGeral: boolean; termoPedido: string }>) {
    setErro(null);
    setSalvando(true);
    const res = await fetch(`/api/admin/tenants/${tenantId}/ajustes`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mudanca),
    });
    setSalvando(false);
    if (!res.ok) return setErro("não deu pra salvar o ajuste");
    setAjustes(await res.json());
    onSalvo();
  }

  const linha = "flex items-start justify-between gap-4 py-3 border-b border-neutral-800 last:border-0";
  return (
    <section className="mb-8">
      <h2 className="text-sm font-medium text-neutral-200 mb-2">Ajustes da empresa</h2>
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-4">
        <div className={linha}>
          <div>
            <p className="text-sm text-neutral-200">Conversas abertas a todos</p>
            <p className="text-xs text-neutral-500">
              Todo atendente vê todas as conversas e o histórico, de qualquer setor ou responsável.
            </p>
          </div>
          <input
            type="checkbox"
            checked={ajustes.conversasAbertasATodos}
            disabled={salvando}
            onChange={(e) => salvar({ conversasAbertasATodos: e.target.checked })}
            className="mt-1 h-4 w-4"
            aria-label="Conversas abertas a todos"
          />
        </div>
        <div className={linha}>
          <div>
            <p className="text-sm text-neutral-200">Fila geral só para o responsável</p>
            <p className="text-xs text-neutral-500">Conversa sem setor e sem dono não aparece para os atendentes.</p>
          </div>
          <input
            type="checkbox"
            checked={ajustes.restringirFilaGeral}
            disabled={salvando}
            onChange={(e) => salvar({ restringirFilaGeral: e.target.checked })}
            className="mt-1 h-4 w-4"
            aria-label="Fila geral só para o responsável"
          />
        </div>
        <div className={linha}>
          <div>
            <p className="text-sm text-neutral-200">Nome do pedido nas telas</p>
            <p className="text-xs text-neutral-500">Para quem vende serviço sob orçamento.</p>
          </div>
          <select
            value={ajustes.termoPedido ?? "Pedido"}
            disabled={salvando}
            onChange={(e) => salvar({ termoPedido: e.target.value })}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm text-neutral-200"
          >
            <option value="Pedido">Pedido</option>
            <option value="Orçamento">Orçamento</option>
          </select>
        </div>
      </div>
      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
    </section>
  );
}
