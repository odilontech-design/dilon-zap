import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 50;

export async function GET(req: Request) {
  await requireSuperAdmin();

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") || undefined;
  const actorUserId = searchParams.get("userId") || undefined;
  const action = searchParams.get("action") || undefined;
  const from = searchParams.get("from") || undefined;
  const to = searchParams.get("to") || undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(tenantId ? { targetTenantId: tenantId } : {}),
    ...(actorUserId ? { actorUserId } : {}),
    ...(action ? { action } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
  };

  const [logs, total, actions, tenants] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.tenant.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    pageSize: PAGE_SIZE,
    actions: actions.map((a) => a.action),
    tenants,
  });
}
