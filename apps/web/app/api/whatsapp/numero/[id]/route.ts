import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

/**
 * Ajustes de UM número da empresa. Hoje: se ele responde sozinho ou não.
 *
 * Só o responsável. Desligar as automações de um número muda o que os clientes
 * da empresa recebem — o menu de triagem some daquela linha —, então não é
 * decisão de quem atende.
 */

const schema = z.object({
  semAutomacoes: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (user.role !== "OWNER" && user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "só o responsável muda isto" }, { status: 403 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });

  // O número tem que ser desta empresa: sem o filtro de tenant, qualquer
  // responsável calaria o robô de outra empresa conhecendo o id.
  const numero = await prisma.whatsAppSession.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { id: true, label: true, semAutomacoes: true },
  });
  if (!numero) return NextResponse.json({ error: "número não encontrado" }, { status: 404 });

  const dados = {
    ...(parsed.data.semAutomacoes !== undefined ? { semAutomacoes: parsed.data.semAutomacoes } : {}),
  };
  if (Object.keys(dados).length === 0) return NextResponse.json({ ok: true });

  await prisma.whatsAppSession.update({ where: { id: numero.id }, data: dados });

  await logAudit({
    actor: user,
    action: "whatsapp.numero_ajustado",
    metadata: { sessionId: numero.id, label: numero.label, antes: numero.semAutomacoes, ...dados },
  });

  return NextResponse.json({ ok: true });
}
