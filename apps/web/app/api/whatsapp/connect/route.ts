import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

// Fase 0: um número por tenant. Se já existe uma sessão que não está
// deslogada permanentemente, não cria outra — só devolve a existente.
export async function POST() {
  const user = await requireUser();

  const existing = await prisma.whatsAppSession.findFirst({
    where: { tenantId: user.tenantId, status: { not: "LOGGED_OUT" } },
  });
  if (existing) return NextResponse.json(existing);

  const session = await prisma.whatsAppSession.create({
    data: { tenantId: user.tenantId, status: "PENDING_QR" },
  });

  return NextResponse.json(session);
}
