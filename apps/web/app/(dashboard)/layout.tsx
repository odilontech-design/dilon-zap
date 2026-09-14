import { redirect } from "next/navigation";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { recursosDoTenant } from "@/lib/plano";
import { Sidebar } from "@/components/sidebar";
import { RecursosProvider } from "@/components/recursos-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role === "SUPERADMIN") redirect("/admin");

  // Senha provisória não abre o painel. Consulta o banco, e não o JWT, pra
  // valer na hora: a redefinição feita pelo responsável precisa pegar também
  // quem já estava logado, e o JWT só é reemitido no próximo login.
  const conta = await prisma.user.findUnique({ where: { id: user.id }, select: { senhaProvisoria: true } });
  if (conta?.senhaProvisoria) redirect("/trocar-senha");

  // Carregado uma vez aqui e distribuído pro menu e pras telas. Array, e não
  // Set, porque atravessa a fronteira servidor → cliente, que só aceita dado
  // serializável.
  const recursos = [...(await recursosDoTenant(user.tenantId))];

  return (
    <RecursosProvider recursos={recursos}>
      <div className="min-h-screen flex flex-col md:flex-row">
        <Sidebar name={user.name} role={user.role} recursos={recursos} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </RecursosProvider>
  );
}
