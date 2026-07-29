import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const bodySchema = z.object({
  pipelineStage: z.enum(["NOVO_LEAD", "EM_CONTATO", "PROPOSTA_ENVIADA", "FECHADO", "PERDIDO"]),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const updated = await prisma.contact.update({
    where: { id: contact.id },
    data: { pipelineStage: parsed.data.pipelineStage },
  });

  return NextResponse.json(updated);
}
