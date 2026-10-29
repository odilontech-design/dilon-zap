"use client";

import { centsToBRL } from "@/lib/billing";
import { reaisParaCentavos } from "@/app/(dashboard)/funil/tipos";

export type ParteDaEntrada = { vencimento: string; valor: string };

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const reais = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * Converte as partes digitadas no que a API espera. Sem partes (entrada
 * inteira), devolve entradas: undefined. Com partes, elas precisam somar a
 * entrada — senão o erro diz quanto falta ou sobra.
 */
export function entradasDoPlano(partes: ParteDaEntrada[] | null, entradaCents: number): { entradas?: { vencimento: string; valorCents: number }[]; erro: string | null } {
  if (!partes) return { erro: null };
  const lista = partes.map((p) => ({ vencimento: p.vencimento, valorCents: reaisParaCentavos(p.valor) ?? -1 }));
  if (lista.some((p) => p.valorCents <= 0)) return { erro: "toda parte da entrada precisa de valor" };
  if (lista.some((p) => !/^\d{4}-\d{2}-\d{2}$/.test(p.vencimento))) return { erro: "toda parte da entrada precisa de data" };
  const soma = lista.reduce((s, p) => s + p.valorCents, 0);
  if (soma !== entradaCents) {
    const dif = entradaCents - soma;
    return { erro: dif > 0 ? `faltam ${centsToBRL(dif)} nas partes da entrada` : `as partes passam ${centsToBRL(-dif)} da entrada` };
  }
  return { entradas: lista, erro: null };
}

/**
 * Entrada em partes (reunião Believe, 29/10 — caso da Kat): a entrada
 * combinada era R$ 200, a cliente deu R$ 50 e paga o resto da entrada depois.
 * Cada parte vira uma parcela de entrada com a própria data; as parcelas
 * normais seguem iguais, sem distorcer o valor delas.
 */
export function DividirEntrada({
  entradaCents,
  diaInicial,
  partes,
  onChange,
}: {
  entradaCents: number;
  /** Data da primeira parte (normalmente hoje). */
  diaInicial: string;
  partes: ParteDaEntrada[] | null;
  onChange: (p: ParteDaEntrada[] | null) => void;
}) {
  if (entradaCents <= 0) return null;
  const campo = "rounded-md border border-neutral-300 bg-surface px-2 py-1 text-sm";

  if (!partes) {
    return (
      <button
        type="button"
        onClick={() => {
          const primeira = Math.round(entradaCents / 2);
          onChange([
            { vencimento: diaInicial, valor: reais(primeira) },
            { vencimento: somarDias(diaInicial, 7), valor: reais(entradaCents - primeira) },
          ]);
        }}
        className="self-start text-xs text-accent hover:underline"
      >
        Dividir a entrada em partes
      </button>
    );
  }

  const { erro } = entradasDoPlano(partes, entradaCents);
  const trocar = (i: number, campo: Partial<ParteDaEntrada>) => onChange(partes.map((p, j) => (j === i ? { ...p, ...campo } : p)));

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-neutral-200 p-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-neutral-700">Entrada de {centsToBRL(entradaCents)} em partes</span>
        <button type="button" onClick={() => onChange(null)} className="text-neutral-500 hover:text-red-600">
          Não dividir
        </button>
      </div>
      {partes.map((p, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="w-14 text-neutral-500">Parte {i + 1}</span>
          <input
            value={p.valor}
            onChange={(e) => trocar(i, { valor: e.target.value })}
            inputMode="decimal"
            aria-label={`Valor da parte ${i + 1}`}
            className={`${campo} w-24 tabular-nums`}
          />
          <input type="date" value={p.vencimento} onChange={(e) => trocar(i, { vencimento: e.target.value })} aria-label={`Data da parte ${i + 1}`} className={campo} />
          {partes.length > 2 && (
            <button type="button" onClick={() => onChange(partes.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600" aria-label={`Remover parte ${i + 1}`}>
              ×
            </button>
          )}
        </div>
      ))}
      {partes.length < 12 && (
        <button
          type="button"
          onClick={() => onChange([...partes, { vencimento: somarDias(partes[partes.length - 1].vencimento || diaInicial, 7), valor: "" }])}
          className="self-start text-xs text-accent hover:underline"
        >
          + Parte
        </button>
      )}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
