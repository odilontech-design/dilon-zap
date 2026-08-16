import { requireSuperAdmin } from "@/lib/session";
import { AdminSidebar } from "@/components/admin-sidebar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();

  return (
    // data-theme fixo em "light": o painel admin JÁ é escuro por desenho
    // próprio (bg-neutral-950, texto claro). Como a escala neutra agora vem
    // do tema, deixar o admin herdar o modo noite inverteria essas classes e
    // ele viraria claro. Prendendo a paleta original aqui, o alternador do
    // dashboard não tem como alcançar esta área.
    <div data-theme="light" className="min-h-screen flex flex-col md:flex-row bg-neutral-950">
      <AdminSidebar name={user.name} />
      <main className="flex-1 min-w-0 bg-neutral-950">{children}</main>
    </div>
  );
}
