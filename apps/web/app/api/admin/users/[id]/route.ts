import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { impedimentoParaAlterarStatus, liberarConversasDe } from "@/lib/user-status";

const patchSchema = z.object({ ativo: z.boolean() });

/**
 * Ativar/desativar pelo painel da Dilon Tech.
 *
 * Existe além da tela da própria empresa porque a conta da Dilon Tech é
 * SUPERADMIN e não enxerga o painel de nenhum cliente — sem isto, desligar
 * alguém exigiria entrar com a senha do responsável da empresa.
 *
 * As travas são as mesmas da outra ponta (ver lib/user-status), com uma
 * diferença: não passamos `atorId`, porque o ator aqui não pertence à
 * empresa e a regra de "não mexa em si mesmo" não faz sentido. A trava do
 * último responsável ativo continua valendo — ela protege a empresa, não
 * quem clica.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const alvo = await prisma.user.findFirst({
    where: { id: params.id, role: { not: "SUPERADMIN" } },
    include: { tenant: { select: { id: true, name: true } } },
  });
  if (!alvo) return NextResponse.json({ error: "usuário não encontrado" }, { status: 404 });

  const impedimento = await impedimentoParaAlterarStatus(alvo, parsed.data.ativo, false);
  if (impedimento) return NextResponse.json({ error: impedimento }, { status: 400 });

  const atualizado = await prisma.user.update({
    where: { id: alvo.id },
    data: { deactivatedAt: parsed.data.ativo ? null : new Date() },
    select: { id: true, name: true, email: true, role: true, deactivatedAt: true },
  });

  const desatribuidas = parsed.data.ativo ? 0 : await liberarConversasDe(alvo.id, alvo.tenantId);

  await logAudit({
    actor: admin,
    action: parsed.data.ativo ? "user.reactivate" : "user.deactivate",
    targetTenantId: alvo.tenant.id,
    targetTenantName: alvo.tenant.name,
    metadata: { userId: alvo.id, name: alvo.name, email: alvo.email, conversasDesatribuidas: desatribuidas },
  });

  return NextResponse.json({ ...atualizado, desatribuidas });
}
