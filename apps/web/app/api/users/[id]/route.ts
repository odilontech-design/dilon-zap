import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { vagaDeAtendente } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { impedimentoParaAlterarStatus, liberarConversasDe } from "@/lib/user-status";

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    role: z.enum(["OWNER", "AGENT", "FINANCEIRO"]).optional(),
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

  const impedimento = await impedimentoParaAlterarStatus(alvo, ativo ?? true, role === "AGENT", user.id);
  if (impedimento) return NextResponse.json({ error: impedimento }, { status: 400 });

  // Reativar ocupa vaga igual a cadastrar. Sem conferir aqui, desativar e
  // reativar viraria o atalho pra furar o limite do plano — o cadastro novo
  // estaria barrado, e a reativação passaria por baixo.
  const reativando = ativo === true && alvo.deactivatedAt !== null;
  if (reativando) {
    const vaga = await vagaDeAtendente(user.tenantId);
    if (!vaga.cabe) {
      return NextResponse.json(
        {
          error: `O plano ${vaga.plano} permite até ${vaga.limite} atendentes ativos, e a equipe já tem ${vaga.ativos}. Desative alguém antes de reativar, ou fale com a Dilon Tech para mudar de plano.`,
          limiteAtingido: true,
        },
        { status: 409 }
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

  const desatribuidas = ativo === false ? await liberarConversasDe(alvo.id, user.tenantId) : 0;

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
