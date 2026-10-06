import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { disconnectWhatsApp } from "@/lib/worker-client";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export async function POST(req: Request) {
  const user = await requireUser();

  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };

  // Confere que a linha é desta empresa antes de mandar derrubar — sem isso,
  // um sessionId de outro tenant desconectaria o número de outro cliente.
  if (sessionId) {
    const existe = await prisma.whatsAppSession.findFirst({
      where: { id: sessionId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!existe) return NextResponse.json({ error: "número não encontrado" }, { status: 404 });
  }

  const result = await disconnectWhatsApp(user.tenantId, sessionId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? "não deu pra desconectar" }, { status: 502 });
  }

  await logAudit({ actor: user, action: "whatsapp.disconnect", metadata: { sessionId } });

  return NextResponse.json({ ok: true });
}
