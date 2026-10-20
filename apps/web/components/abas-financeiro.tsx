import Link from "next/link";
import { recursosDoUsuario } from "@/lib/plano";

type Aba = "receber" | "pagar" | "caixa" | "estoque";

const ABAS: { id: Aba; href: string; rotulo: string }[] = [
  { id: "receber", href: "/receber", rotulo: "A receber" },
  { id: "pagar", href: "/pagar", rotulo: "A pagar" },
  { id: "caixa", href: "/caixa", rotulo: "Caixa" },
  { id: "estoque", href: "/estoque", rotulo: "Estoque" },
];

/**
 * Cabeçalho do Financeiro com as abas do topo (um item só no menu, pedido do
 * Felipe em 11/10). Estoque só aparece para quem tem Pedidos — é dele que
 * saem as movimentações.
 */
export async function AbasFinanceiro({ atual, user }: { atual: Aba; user: { tenantId: string; role: string } }) {
  const recursos = await recursosDoUsuario(user);
  const comEstoque = user.role === "SUPERADMIN" || recursos.has("PEDIDOS");
  const comContas = user.role === "SUPERADMIN" || recursos.has("CONTAS_RECEBER");
  const visiveis = ABAS.filter((a) => (a.id === "estoque" ? comEstoque : comContas));

  return (
    <div className="flex items-center gap-4 mb-6">
      <h1 className="text-lg font-semibold">Financeiro</h1>
      <nav className="flex gap-1 text-sm">
        {visiveis.map((a) =>
          a.id === atual ? (
            <span key={a.id} className="rounded-md bg-accent/10 px-3 py-1 font-medium text-accent">
              {a.rotulo}
            </span>
          ) : (
            <Link key={a.id} href={a.href} className="rounded-md px-3 py-1 text-neutral-500 hover:text-neutral-800">
              {a.rotulo}
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
