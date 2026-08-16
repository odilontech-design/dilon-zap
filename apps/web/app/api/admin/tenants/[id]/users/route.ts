import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

function generatePassword() {
  return randomBytes(9).toString("base64url");
}

const createSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(["OWNER", "AGENT", "FINANCEIRO"]).default("AGENT"),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const admin = await requireSuperAdmin();
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: params.id } });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "já existe um usuário com esse e-mail" }, { status: 409 });

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: { tenantId: tenant.id, name: parsed.data.name, email, passwordHash, role: parsed.data.role },
  });

  await logAudit({
    actor: admin,
    action: "user.create",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { createdUserEmail: email, role: parsed.data.role },
  });

  return NextResponse.json({ user, password });
}
