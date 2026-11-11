import { MenuAdmin } from "@/components/menu";
import { PLANOS } from "@/lib/planos";
import { requireAdmin } from "@/lib/session";

export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const u = await requireAdmin();
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <MenuAdmin
        nome={u.nome}
        empresa={u.empresa.nomeFantasia || u.empresa.razaoSocial}
        plano={PLANOS[u.empresa.plano].nome}
        temColaborador={Boolean(u.colaboradorId)}
      />
      <main className="flex-1 min-w-0 p-5 md:p-8">{children}</main>
    </div>
  );
}
