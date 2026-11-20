"use client";

import { useState } from "react";
import type { ResumoDoCredito } from "@/lib/credito";

export type CreditoDaFicha = ResumoDoCredito & { podeEditar: boolean };

const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** "1.500,00" / "1500.5" / "1500" → centavos. Vazio = sem limite (null); texto ruim = undefined. */
function lerLimite(texto: string): number | null | undefined {
  const t = texto.replace(/[R$\s]/g, "");
  if (!t) return null;
  // "1.500,00" (pt-BR) ou "1500.50": se há vírgula, ela é o decimal e o ponto é milhar.
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 100);
}

/**
 * A linha de crédito na ficha do contato (Believe, 20/11): quanto ele pode
 * ficar devendo em parcelas e quanto já usou. Só a gerência edita. Sem limite,
 * continua valendo o bloqueio antigo de venda a prazo para quem já deve — e o
 * texto diz isso, para ninguém achar que "sem limite" é "crédito livre".
 */
export function LinhaDeCredito({
  credito,
  salvar,
}: {
  credito: CreditoDaFicha;
  salvar: (campos: Record<string, unknown>) => Promise<void>;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const temLimite = credito.limiteCents !== null;
  const cor =
    credito.percentualUsado >= 100 ? "bg-red-500" : credito.percentualUsado >= 70 ? "bg-amber-500" : "bg-emerald-500";

  async function gravar() {
    if (texto === null) return;
    const valor = lerLimite(texto);
    if (valor === undefined) return setErro("valor inválido — use números, como 1500 ou 1.500,00");
    setErro(null);
    if (valor !== credito.limiteCents) await salvar({ limiteCreditoCents: valor });
    setTexto(null);
  }

  return (
    <section className="rounded-md border border-neutral-200 p-3 text-sm flex flex-col gap-2" aria-label="Linha de crédito">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-neutral-700">Linha de crédito</h3>
        {credito.vencidoCents > 0 && (
          <span className="text-[10px] font-medium rounded-full bg-red-100 text-red-700 px-2 py-0.5">
            {brl(credito.vencidoCents)} em atraso
          </span>
        )}
      </div>

      {temLimite ? (
        <>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={credito.percentualUsado}
            aria-label="Limite usado"
            className="h-2 rounded-full bg-neutral-200 overflow-hidden"
          >
            <div className={`h-full ${cor}`} style={{ width: `${credito.percentualUsado}%` }} />
          </div>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-neutral-500">Limite</dt>
              <dd className="font-semibold tabular-nums">{brl(credito.limiteCents!)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Usado</dt>
              <dd className="font-semibold tabular-nums">{brl(credito.usadoCents)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Disponível</dt>
              <dd className={`font-semibold tabular-nums ${credito.disponivelCents === 0 ? "text-red-700" : ""}`}>
                {brl(credito.disponivelCents ?? 0)}
              </dd>
            </div>
          </dl>
          {credito.usadoCents > credito.limiteCents! && (
            <p className="text-xs text-red-700">O cliente já deve mais do que o limite. Venda a prazo ainda fecha, mas com aviso.</p>
          )}
        </>
      ) : (
        <p className="text-xs text-neutral-500">
          Sem limite definido
          {credito.usadoCents > 0 ? ` — deve ${brl(credito.usadoCents)} em parcelas` : ""}. Enquanto não houver limite, venda a prazo fica
          bloqueada para quem tem parcela em aberto.
        </p>
      )}

      {credito.podeEditar && (
        <label className="text-xs">
          <span className="block font-medium text-neutral-700">{temLimite ? "Alterar limite (R$)" : "Definir limite (R$)"}</span>
          <input
            value={texto ?? (credito.limiteCents !== null ? (credito.limiteCents / 100).toFixed(2).replace(".", ",") : "")}
            onChange={(e) => setTexto(e.target.value)}
            onBlur={gravar}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            inputMode="decimal"
            placeholder="Em branco = sem limite"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-surface px-2 py-1.5 text-sm tabular-nums"
          />
        </label>
      )}
      {erro && (
        <p role="alert" className="text-xs text-red-700">
          {erro}
        </p>
      )}
    </section>
  );
}
