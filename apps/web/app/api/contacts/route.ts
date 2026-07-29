import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

export async function GET() {
  const user = await requireUser();

  const contacts = await prisma.contact.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(contacts);
}
