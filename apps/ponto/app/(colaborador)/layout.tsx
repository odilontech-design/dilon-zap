import { BarraColaborador } from "@/components/menu";
import { requireColaborador } from "@/lib/session";
import { temRecurso } from "@/lib/planos";

export default async function LayoutColaborador({ children }: { children: React.ReactNode }) {
  const u = await requireColaborador();
  return (
    <div className="min-h-screen">
      <BarraColaborador nome={u.nome} empresa={u.empresa.nomeFantasia || u.empresa.razaoSocial} admin={u.papel === "ADMIN"} solicitacoes={temRecurso(u.empresa.plano, "SOLICITACOES")} />
      <main className="mx-auto max-w-2xl p-4">{children}</main>
    </div>
  );
}
