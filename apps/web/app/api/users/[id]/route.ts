import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    role: z.enum(["OWNER", "AGENT"]).optional(),
    password: z.string().min(8).max(72).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "nada pra alterar" });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (user.role !== "OWNER") return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Busca dentro do tenant: sem isso um OWNER conseguiria alterar usuário de
  // outra empresa só chutando o id.
  const alvo = await prisma.user.findFirst({
    where: { id: params.id, tenantId: user.tenantId, role: { not: "SUPERADMIN" } },
  });
  if (!alvo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { name, role, password, ativo } = parsed.data;

  // Ninguém se desativa nem se rebaixa: os dois caminhos levam a uma empresa
  // sem responsável, e o único jeito de voltar seria pedir pro suporte.
  if (alvo.id === user.id && (ativo === false || role === "AGENT")) {
    return NextResponse.json(
      { error: "você não pode desativar nem rebaixar a própria conta" },
      { status: 400 }
    );
  }

  // Mesma proteção pro caso de dois responsáveis virarem zero: se este é o
  // último OWNER ativo, ele não pode sair de cena.
  if (alvo.role === "OWNER" && (ativo === false || role === "AGENT")) {
    const outrosDonos = await prisma.user.count({
      where: {
        tenantId: user.tenantId,
        role: "OWNER",
        deactivatedAt: null,
        id: { not: alvo.id },
      },
    });
    if (outrosDonos === 0) {
      return NextResponse.json(
        { error: "a empresa ficaria sem nenhum responsável ativo" },
        { status: 400 }
      );
    }
  }

  const atualizado = await prisma.user.update({
    where: { id: alvo.id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(role !== undefined ? { role } : {}),
      ...(password !== undefined ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      ...(ativo !== undefined ? { deactivatedAt: ativo ? null : new Date() } : {}),
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true, deactivatedAt: true },
  });

  // Desatribui o que estava na mão de quem saiu — senão as conversas dela
  // ficam num limbo: aparecem como "atribuídas" e ninguém assume porque
  // parecem já ter dono. O histórico de quem ENVIOU cada mensagem continua
  // intacto, que é o que não pode se perder.
  let desatribuidas = 0;
  if (ativo === false) {
    const r = await prisma.conversation.updateMany({
      where: { tenantId: user.tenantId, assignedToId: alvo.id, status: { not: "RESOLVED" } },
      data: { assignedToId: null },
    });
    desatribuidas = r.count;
  }

  await logAudit({
    actor: user,
    action: ativo === false ? "user.deactivate" : ativo === true ? "user.reactivate" : "user.update",
    metadata: {
      userId: alvo.id,
      name: atualizado.name,
      ...(role !== undefined ? { role } : {}),
      ...(password !== undefined ? { senhaRedefinida: true } : {}),
      ...(ativo === false ? { conversasDesatribuidas: desatribuidas } : {}),
    },
  });

  return NextResponse.json({ ...atualizado, desatribuidas });
}
