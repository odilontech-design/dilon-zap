import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { upsertContactByPhone } from "@/lib/contact-server";

export async function GET() {
  const user = await requireUser();

  const contacts = await prisma.contact.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    include: { conversations: { select: { tags: true } } },
  });

  // Contato não tem tag própria — agrega as tags de todas as conversas dele,
  // que é onde elas realmente vivem (ver /inbox).
  const withTags = contacts.map(({ conversations, ...contact }) => ({
    ...contact,
    tags: Array.from(new Set(conversations.flatMap((c) => c.tags))),
  }));

  return NextResponse.json(withTags);
}

const createSchema = z.object({
  name: z.string().max(120).optional(),
  phone: z.string().min(8).max(20),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const digits = parsed.data.phone.replace(/\D/g, "");
  if (!digits) return NextResponse.json({ error: "telefone inválido" }, { status: 400 });

  const { contact } = await upsertContactByPhone(user.tenantId, digits, parsed.data.name);

  return NextResponse.json(contact);
}
