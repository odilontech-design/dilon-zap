import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "AGENT" | "SUPERADMIN";
  tenantId: string;
};

/** Usar em Server Components/Route Handlers da área logada. Redireciona pra /login se não houver sessão. */
export async function requireUser(): Promise<CurrentUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user as CurrentUser | undefined;
  if (!user) redirect("/login");
  return user;
}

/**
 * Usar no que é do responsável pela conta: gestão de usuários, horário de
 * atendimento. Atendente enxerga, mas não altera.
 *
 * SUPERADMIN não passa de propósito — ele administra empresas pelo /admin, e
 * a gestão de usuários de uma empresa é da própria empresa.
 */
export async function requireOwner(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "OWNER") redirect("/painel");
  return user;
}

/** Usar nas rotas /admin e /api/admin/*. SUPERADMIN é o único papel com acesso cross-tenant. */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN") redirect("/painel");
  return user;
}
