import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

function generatePassword() {
  return randomBytes(9).toString("base64url");
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "usuário não encontrado" }, { status: 404 });

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  // Quem redefiniu viu a senha: vale só até a pessoa trocar no próximo acesso.
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash, senhaProvisoria: true } });

  await logAudit({
    actor: admin,
    action: "user.reset_password",
    targetTenantId: user.tenantId,
    metadata: { targetUserEmail: user.email },
  });

  return NextResponse.json({ email: user.email, password });
}
