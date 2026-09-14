import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { problemaNaSenha, SENHA_MAXIMO } from "@/lib/senha";

const corpoSchema = z.object({
  senhaAtual: z.string().min(1).max(SENHA_MAXIMO),
  novaSenha: z.string().max(200),
});

/**
 * Troca da própria senha.
 *
 * Pede a senha atual mesmo com a pessoa logada: uma sessão esquecida aberta no
 * computador do consultório não pode virar troca de senha por quem passou na
 * frente — e troca de senha é justamente o que tiraria o dono da própria conta.
 */
export async function POST(req: Request) {
  const user = await requireUser();

  const parsed = corpoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "preencha a senha atual e a nova" }, { status: 400 });
  const { senhaAtual, novaSenha } = parsed.data;

  const conta = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!conta) return NextResponse.json({ error: "conta não encontrada" }, { status: 404 });

  if (!(await bcrypt.compare(senhaAtual, conta.passwordHash))) {
    return NextResponse.json({ error: "a senha atual não confere" }, { status: 400 });
  }

  const problema = problemaNaSenha(novaSenha, senhaAtual);
  if (problema) return NextResponse.json({ error: problema }, { status: 400 });

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(novaSenha, 10), senhaProvisoria: false },
  });

  await logAudit({ actor: user, action: "user.password.change" });

  return NextResponse.json({ ok: true });
}
