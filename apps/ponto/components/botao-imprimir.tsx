"use client";

export function BotaoImprimir() {
  return (
    <button onClick={() => window.print()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
      Imprimir
    </button>
  );
}
