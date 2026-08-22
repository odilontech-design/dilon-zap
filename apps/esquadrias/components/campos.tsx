"use client";

/** Campos de formulário. Mesma razão do ui.tsx: consistência entre telas. */

export function Campo({
  rotulo,
  ajuda,
  children,
  className = "",
}: {
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-neutral-700 mb-1.5">{rotulo}</span>
      {children}
      {ajuda && <span className="block text-xs text-neutral-500 mt-1">{ajuda}</span>}
    </label>
  );
}

const BASE =
  "w-full rounded-lg border border-neutral-300 bg-surface px-3 py-2 text-sm text-neutral-900 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

export function Entrada(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${BASE} ${props.className ?? ""}`} />;
}

export function Selecao(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${BASE} ${props.className ?? ""}`} />;
}

export function AreaTexto(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${BASE} ${props.className ?? ""}`} />;
}

export function Botao({
  variante = "primario",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: "primario" | "secundario" | "perigo" }) {
  const classe =
    variante === "primario"
      ? "bg-accent text-white hover:opacity-90"
      : variante === "perigo"
        ? "border border-red-300 text-red-600 hover:bg-red-500/10"
        : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100";
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${classe} ${props.className ?? ""}`}
    />
  );
}

/**
 * Campo de dinheiro. Guarda centavos inteiros no estado e mostra o texto que
 * a pessoa está digitando — converter a cada tecla faria "1," virar "1,00" no
 * meio da digitação e o cursor pular.
 */
export function EntradaMoeda({
  valorCentavos,
  onChange,
  ...props
}: { valorCentavos: number; onChange: (centavos: number) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value">) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-500">R$</span>
      <input
        {...props}
        inputMode="decimal"
        defaultValue={(valorCentavos / 100).toFixed(2).replace(".", ",")}
        onBlur={(e) => {
          const limpo = e.target.value.replace(/[^\d,.-]/g, "");
          const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
          const numero = Number(normalizado);
          const centavos = Number.isFinite(numero) ? Math.round(numero * 100) : 0;
          e.target.value = (centavos / 100).toFixed(2).replace(".", ",");
          onChange(centavos);
        }}
        className={`${BASE} pl-9`}
      />
    </div>
  );
}
