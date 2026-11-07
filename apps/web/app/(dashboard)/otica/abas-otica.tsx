import Link from "next/link";
import { ehGerencia } from "@/lib/papeis";

type Aba = "os" | "configuracoes";

/** Cabeçalho da Ótica. Configurações só para a gestão, como as rotas. */
export function AbasOtica({ atual, role }: { atual: Aba; role: string }) {
  const abas: { id: Aba; href: string; rotulo: string }[] = [
    { id: "os", href: "/otica", rotulo: "Ordens de serviço" },
    ...(ehGerencia(role) ? [{ id: "configuracoes" as Aba, href: "/otica/configuracoes", rotulo: "Laboratórios e avisos" }] : []),
  ];
  return (
    <div className="flex items-center gap-x-4 gap-y-2 mb-6 flex-wrap">
      <h1 className="text-lg font-semibold">Ótica</h1>
      <nav className="flex flex-wrap gap-1 text-sm">
        {abas.map((a) =>
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
