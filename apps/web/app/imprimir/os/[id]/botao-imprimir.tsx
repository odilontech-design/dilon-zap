"use client";

/** Botão de impressão. Some no papel. */
export function BotaoImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden fixed right-4 top-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow hover:opacity-90"
    >
      Imprimir
    </button>
  );
}
