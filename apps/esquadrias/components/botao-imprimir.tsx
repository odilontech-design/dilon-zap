"use client";

export function BotaoImprimir({ rotulo = "Imprimir" }: { rotulo?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="nao-imprimir rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
    >
      {rotulo}
    </button>
  );
}
