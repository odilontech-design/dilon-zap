import Link from "next/link";

/**
 * Primitivas visuais. Existem pra que as ~15 telas do sistema não divirjam:
 * quando a mesma tabela é escrita à mão em cada painel, seis meses depois
 * cada uma tem um padding e um tom de borda diferente.
 */

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-neutral-200 bg-surface ${className}`}>{children}</div>;
}

export function TituloPagina({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900">{titulo}</h1>
        {descricao && <p className="text-sm text-neutral-500 mt-1 max-w-2xl">{descricao}</p>}
      </div>
      {acao}
    </div>
  );
}

export function Vazio({ titulo, descricao, acao }: { titulo: string; descricao?: string; acao?: React.ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <p className="text-neutral-900 font-medium">{titulo}</p>
      {descricao && <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">{descricao}</p>}
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}

const TONS = {
  neutro: "bg-neutral-100 text-neutral-700 border-neutral-200",
  verde: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
  azul: "bg-accent/10 text-accent border-accent/20",
  amarelo: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  vermelho: "bg-red-500/10 text-red-600 border-red-500/20",
} as const;

export type Tom = keyof typeof TONS;

export function Etiqueta({ children, tom = "neutro" }: { children: React.ReactNode; tom?: Tom }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONS[tom]}`}>{children}</span>;
}

export function Indicador({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  tom?: Tom;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">{rotulo}</p>
      <p className={`text-2xl font-semibold mt-1 ${tom === "vermelho" ? "text-red-600" : tom === "verde" ? "text-emerald-600" : "text-neutral-900"}`}>
        {valor}
      </p>
      {detalhe && <p className="text-xs text-neutral-500 mt-1">{detalhe}</p>}
    </Card>
  );
}

export function BotaoLink({ href, children, variante = "primario" }: { href: string; children: React.ReactNode; variante?: "primario" | "secundario" }) {
  const classe =
    variante === "primario"
      ? "bg-accent text-white hover:opacity-90"
      : "border border-neutral-300 text-neutral-700 hover:bg-neutral-100";
  return (
    <Link href={href} className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium ${classe}`}>
      {children}
    </Link>
  );
}

export function Tabela({ cabecalho, children }: { cabecalho: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
            {cabecalho.map((c, i) => (
              <th key={i} className="px-4 py-3 font-medium whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">{children}</tbody>
      </table>
    </div>
  );
}
