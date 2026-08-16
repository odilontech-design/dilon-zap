import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { setWhatsAppBlockStatus } from "@/lib/worker-client";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const block = await prisma.contactBlock.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!block) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Desfaz na conta do WhatsApp só se foi este bloqueio que fez lá. Sem essa
  // condição, desbloquear alguém aqui poderia desbloquear no WhatsApp da
  // empresa um número que alguém bloqueou pelo celular, por outro motivo —
  // mexer no aparelho de alguém sem ter sido pedido.
  let avisoWhatsApp: string | undefined;
  if (block.blockedOnWhatsApp) {
    const r = await setWhatsAppBlockStatus(user.tenantId, block.waJid, "unblock");
    if (!r.ok) avisoWhatsApp = r.reason ?? "não foi possível desbloquear no WhatsApp";
  }

  await prisma.contactBlock.delete({ where: { id: block.id } });
  await logAudit({
    actor: user,
    action: "contact.unblock",
    metadata: { waJid: block.waJid, eraBloqueadoNoWhatsApp: block.blockedOnWhatsApp },
  });
  return NextResponse.json({ ok: true, avisoWhatsApp });
}
