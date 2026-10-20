import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { esquecerSuspensao } from "@/lib/suspensao";

const schema = z.object({ suspender: z.boolean() });

/**
 * Suspende ou reativa o acesso da empresa (falta de pagamento). Nada é
 * apagado e o WhatsApp segue conectado; só a área logada some para quem não é
 * SUPERADMIN. Reativar é imediato.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id }, select: { id: true, name: true, suspensoEm: true } });
  if (!tenant) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  // A empresa do próprio superadmin (Dilon Tech) não se suspende: o resto da
  // equipe dela perderia o acesso por um clique.
  if (parsed.data.suspender && tenant.id === admin.tenantId) {
    return NextResponse.json({ error: "não dá para suspender a própria empresa" }, { status: 400 });
  }

  const suspensoEm = parsed.data.suspender ? (tenant.suspensoEm ?? new Date()) : null;
  await prisma.tenant.update({ where: { id: tenant.id }, data: { suspensoEm } });
  esquecerSuspensao(tenant.id);

  await logAudit({
    actor: admin,
    action: parsed.data.suspender ? "tenant.suspender" : "tenant.reativar",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { suspensoEm },
  });

  return NextResponse.json({ suspensoEm });
}
