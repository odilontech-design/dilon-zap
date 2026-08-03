import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function generatePassword() {
  return randomBytes(9).toString("base64url"); // 12 chars, sem confundir com telefone/ID
}

export async function GET() {
  await requireSuperAdmin();

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, contacts: true, conversations: true } },
      sessions: { select: { id: true, label: true, phoneNumber: true, status: true, lastConnectedAt: true } },
      subscription: true,
      invoices: { where: { status: "PENDING" }, select: { id: true, dueDate: true }, orderBy: { dueDate: "asc" }, take: 1 },
    },
  });

  return NextResponse.json(tenants);
}

const createSchema = z.object({
  tenantName: z.string().min(2).max(120),
  ownerName: z.string().min(2).max(120),
  ownerEmail: z.string().email(),
  whatsappLabel: z.string().max(60).optional(),
});

export async function POST(req: Request) {
  const admin = await requireSuperAdmin();
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { tenantName, ownerName, ownerEmail, whatsappLabel } = parsed.data;

  const email = ownerEmail.toLowerCase().trim();
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return NextResponse.json({ error: "já existe um usuário com esse e-mail" }, { status: 409 });

  let slug = slugify(tenantName) || "tenant";
  let attempt = 0;
  while (await prisma.tenant.findUnique({ where: { slug } })) {
    attempt++;
    slug = `${slugify(tenantName)}-${attempt}`;
  }

  const password = generatePassword();
  const passwordHash = await bcrypt.hash(password, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug,
      users: { create: { name: ownerName, email, passwordHash, role: "OWNER" } },
      sessions: { create: { label: whatsappLabel?.trim() || "Principal" } },
    },
    include: { users: true, sessions: true },
  });

  await logAudit({
    actor: admin,
    action: "tenant.create",
    targetTenantId: tenant.id,
    targetTenantName: tenant.name,
    metadata: { ownerEmail: email, whatsappLabel: whatsappLabel?.trim() || null },
  });

  return NextResponse.json({ tenant, ownerEmail: email, ownerPassword: password });
}
