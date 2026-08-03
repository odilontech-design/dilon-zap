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

/** Usar nas rotas /admin e /api/admin/*. SUPERADMIN é o único papel com acesso cross-tenant. */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN") redirect("/painel");
  return user;
}
