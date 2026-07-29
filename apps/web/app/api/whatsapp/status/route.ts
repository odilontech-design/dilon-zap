import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();

  const session = await prisma.whatsAppSession.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      qrCode: true,
      phoneNumber: true,
      lastError: true,
      lastConnectedAt: true,
    },
  });

  return NextResponse.json(session);
}
