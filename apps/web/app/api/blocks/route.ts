import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { setWhatsAppBlockStatus } from "@/lib/worker-client";

export async function GET() {
  const user = await requireUser();

  const blocks = await prisma.contactBlock.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(blocks);
}

const bodySchema = z.object({
  waJid: z.string().min(3),
  reason: z.string().max(200).optional(),
  // Opt-in explícito: bloquear na plataforma esconde da caixa e é
  // reversível sem o cliente perceber. Bloquear na conta corta o contato com
  // a empresa inteira e aparece no celular de quem estiver com o aparelho —
  // não pode ser efeito colateral de um clique feito com outra intenção.
  noWhatsApp: z.boolean().optional(),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { waJid, reason, noWhatsApp } = parsed.data;

  // O bloqueio no WhatsApp vem ANTES de gravar: se o WhatsApp recusar,
  // gravar blockedOnWhatsApp=true criaria um registro dizendo que algo
  // aconteceu quando não aconteceu — e o desbloqueio depois tentaria
  // desfazer o que nunca foi feito.
  let bloqueadoNoWhatsApp = false;
  let avisoWhatsApp: string | undefined;
  if (noWhatsApp) {
    const r = await setWhatsAppBlockStatus(user.tenantId, waJid, "block");
    bloqueadoNoWhatsApp = r.ok;
    if (!r.ok) avisoWhatsApp = r.reason ?? "não foi possível bloquear no WhatsApp";
  }

  const block = await prisma.contactBlock.upsert({
    where: { tenantId_waJid: { tenantId: user.tenantId, waJid } },
    create: { tenantId: user.tenantId, waJid, reason, blockedOnWhatsApp: bloqueadoNoWhatsApp },
    // Só liga a flag, nunca desliga: se já estava bloqueado na conta e agora
    // alguém bloqueia de novo só na plataforma, o bloqueio da conta continua
    // valendo lá — apagar a flag faria o desbloqueio esquecer de desfazê-lo.
    update: { reason, ...(bloqueadoNoWhatsApp ? { blockedOnWhatsApp: true } : {}) },
  });

  await logAudit({
    actor: user,
    action: "contact.block",
    metadata: { waJid, reason, noWhatsApp: bloqueadoNoWhatsApp },
  });

  // 200 mesmo com aviso: o bloqueio da plataforma funcionou, e a tela conta
  // o que faltou em vez de fingir que deu tudo certo.
  return NextResponse.json({ ...block, avisoWhatsApp });
}
