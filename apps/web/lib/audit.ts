import { prisma } from "@dilon-zap/db";
import type { Prisma } from "@prisma/client";

type Actor = { id: string; name: string; email: string; tenantId: string };

/**
 * Registra uma ação no painel /admin. Denormalizado de propósito (ver
 * comentário no schema) — recebe o snapshot pronto em vez de IDs pra
 * resolver depois, então quem chama já precisa ter os dados do ator em mãos.
 */
export async function logAudit(params: {
  actor: Actor;
  action: string;
  targetTenantId?: string;
  targetTenantName?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const targetTenantId = params.targetTenantId ?? params.actor.tenantId;
    let targetTenantName = params.targetTenantName;
    if (!targetTenantName) {
      const tenant = await prisma.tenant.findUnique({ where: { id: targetTenantId }, select: { name: true } });
      targetTenantName = tenant?.name ?? "";
    }

    await prisma.auditLog.create({
      data: {
        actorUserId: params.actor.id,
        actorName: params.actor.name,
        actorEmail: params.actor.email,
        actorTenantId: params.actor.tenantId,
        targetTenantId,
        targetTenantName,
        action: params.action,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  } catch (err) {
    // Auditoria não pode derrubar a ação de verdade que o usuário tentou fazer.
    console.error("[audit] falha ao registrar log", err);
  }
}
