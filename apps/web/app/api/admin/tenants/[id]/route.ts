import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireSuperAdmin();

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      // Campos explícitos: sem o select, o include devolvia o registro
      // inteiro — passwordHash junto — e o hash bcrypt de cada usuário ia
      // parar no navegador, no cache e na aba de rede. Só SUPERADMIN vê esta
      // tela, mas isso não é motivo pra mandar hash de senha pro cliente.
      users: {
        select: { id: true, name: true, email: true, role: true, createdAt: true, deactivatedAt: true },
        orderBy: { createdAt: "asc" },
      },
      sessions: { orderBy: { createdAt: "desc" } },
      subscription: true,
      invoices: { orderBy: { dueDate: "desc" }, take: 24 },
      _count: { select: { contacts: true, conversations: true } },
    },
  });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });

  const recentAudit = await prisma.auditLog.findMany({
    where: { targetTenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ tenant, recentAudit });
}
