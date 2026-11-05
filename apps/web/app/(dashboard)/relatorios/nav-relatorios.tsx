import Link from "next/link";

type Aba = "atendimento" | "crm" | "comissao";

/**
 * Abas dos relatórios. Atendimento e Comissão são de todos (a comissão mostra
 * só a linha de quem olha); o CRM mostra o desempenho de cada pessoa e fica
 * com a gestão.
 */
export function NavRelatorios({ ativa, gestao }: { ativa: Aba; gestao: boolean }) {
  const abas: { id: Aba; href: string; rotulo: string }[] = [
    { id: "atendimento", href: "/relatorios", rotulo: "Atendimento" },
    ...(gestao ? [{ id: "crm" as const, href: "/relatorios/crm", rotulo: "CRM" }] : []),
    { id: "comissao", href: "/relatorios/comissao", rotulo: "Comissão" },
  ];
  return (
    <nav className="flex gap-1 text-sm">
      {abas.map((a) =>
        a.id === ativa ? (
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
  );
}
