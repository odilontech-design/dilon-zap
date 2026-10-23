"use client";

import { useState } from "react";

type Ajustes = { conversasAbertasATodos: boolean; restringirFilaGeral: boolean; termoPedido: string | null; pedidosSoGerencia: boolean; negociacaoCompleta: boolean };

/**
 * Ajustes que antes só mudavam direto no banco. Cada mudança salva na hora e
 * fica na auditoria.
 */
export function AjustesEmpresa({
  tenantId,
  inicial,
  suspensoEm,
  onSalvo,
}: {
  tenantId: string;
  inicial: Ajustes;
  suspensoEm: string | null;
  onSalvo: () => void;
}) {
  const [ajustes, setAjustes] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(mudanca: Partial<{ conversasAbertasATodos: boolean; restringirFilaGeral: boolean; termoPedido: string; pedidosSoGerencia: boolean; negociacaoCompleta: boolean }>) {
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
            <p className="text-sm text-neutral-200">Pedidos e valores devidos só para responsável e financeiro</p>
            <p className="text-xs text-neutral-500">
              O atendente deixa de ver o botão e o menu de pedidos e o selo de quanto o cliente deve.
            </p>
          </div>
          <input
            type="checkbox"
            checked={ajustes.pedidosSoGerencia}
            disabled={salvando}
            onChange={(e) => salvar({ pedidosSoGerencia: e.target.checked })}
            className="mt-1 h-4 w-4"
            aria-label="Pedidos e valores devidos só para responsável e financeiro"
          />
        </div>
        <div className={linha}>
          <div>
            <p className="text-sm text-neutral-200">Negociação exige responsável, valor e origem</p>
            <p className="text-xs text-neutral-500">Vale para o CRM e para a etapa escolhida no Inbox. Origem vira lista.</p>
          </div>
          <input
            type="checkbox"
            checked={ajustes.negociacaoCompleta}
            disabled={salvando}
            onChange={(e) => salvar({ negociacaoCompleta: e.target.checked })}
            className="mt-1 h-4 w-4"
            aria-label="Negociação exige responsável, valor e origem"
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
      <SuspensaoDoAcesso tenantId={tenantId} suspensoEm={suspensoEm} onSalvo={onSalvo} />
    </section>
  );
}

/**
 * Suspende o acesso por falta de pagamento: o pessoal da empresa cai numa tela
 * de aviso, o WhatsApp segue conectado e nada é apagado. Pede confirmação, e
 * reativar é um clique.
 */
function SuspensaoDoAcesso({ tenantId, suspensoEm, onSalvo }: { tenantId: string; suspensoEm: string | null; onSalvo: () => void }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const suspensa = !!suspensoEm;

  async function mudar(suspender: boolean) {
    if (suspender && !window.confirm("Suspender o acesso desta empresa? Todos os usuários dela passam a ver só o aviso de pendência.")) return;
    setErro(null);
    setSalvando(true);
    const res = await fetch(`/api/admin/tenants/${tenantId}/suspensao`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suspender }),
    });
    setSalvando(false);
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      return setErro(typeof corpo.error === "string" ? corpo.error : "não deu pra salvar");
    }
    onSalvo();
  }

  return (
    <div className={`mt-3 rounded-lg border px-4 py-3 ${suspensa ? "border-red-900 bg-red-950/40" : "border-neutral-800 bg-neutral-900"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-200">{suspensa ? "Acesso suspenso" : "Suspender acesso"}</p>
          <p className="text-xs text-neutral-500">
            {suspensa
              ? `Desde ${new Date(suspensoEm!).toLocaleString("pt-BR")}. Os usuários veem só o aviso de pendência; o WhatsApp segue conectado.`
              : "Por falta de pagamento. Os usuários veem só um aviso para falar com o suporte; dados e WhatsApp ficam como estão."}
          </p>
        </div>
        <button
          onClick={() => mudar(!suspensa)}
          disabled={salvando}
          className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            suspensa ? "bg-green-700 text-white hover:bg-green-600" : "bg-red-800 text-white hover:bg-red-700"
          }`}
        >
          {suspensa ? "Reativar acesso" : "Suspender acesso"}
        </button>
      </div>
      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
    </div>
  );
}
