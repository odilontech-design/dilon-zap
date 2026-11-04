import { redirect } from "next/navigation";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { ehGerencia } from "@/lib/papeis";
import { recursosDoUsuario } from "@/lib/plano";
import { AbasFinanceiro } from "@/components/abas-financeiro";
import { EstoquePanel } from "./estoque-panel";

export default async function EstoquePage() {
  const user = await requireUser();
  // Histórico do estoque é gestão, como lançar entrada e ajuste.
  if (!ehGerencia(user.role)) redirect("/painel");
  if (user.role !== "SUPERADMIN" && !(await recursosDoUsuario(user)).has("PEDIDOS")) redirect("/painel");

  const empresa = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true } });

  return (
    <div className="p-4 md:p-8">
      <AbasFinanceiro atual="estoque" user={user} />
      <EstoquePanel empresa={empresa?.name ?? ""} />
    </div>
  );
}
