import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { slugUnico } from "@/lib/tenant-slug";

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

const patchSchema = z.object({ name: z.string().min(2).max(120) });

/**
 * Renomear a empresa.
 *
 * Nome errado na hora de cadastrar (typo, razão social trocada pelo nome
 * fantasia) era coisa que só saía do ar mexendo no banco. O slug acompanha o
 * nome porque ele é derivado dele e só aparece como identificação no painel
 * — nada de rota nem login depende dele, então recalcular não quebra sessão
 * de ninguém.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  const name = parsed.data.name.trim();
  const slug = await slugUnico(name, tenant.id);

  const atualizado = await prisma.tenant.update({
    where: { id: tenant.id },
    data: { name, slug },
    select: { id: true, name: true, slug: true },
  });

  await logAudit({
    actor: admin,
    action: "tenant.rename",
    targetTenantId: tenant.id,
    targetTenantName: atualizado.name,
    metadata: { de: tenant.name, para: atualizado.name, slugAnterior: tenant.slug, slug: atualizado.slug },
  });

  return NextResponse.json(atualizado);
}
