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
    include: {
      conversations: {
        select: { id: true, tags: true, status: true, assignedToId: true },
        orderBy: { lastMessageAt: "desc" },
        take: 1,
      },
      stage: { select: { id: true, name: true, color: true } },
    },
  });

  // Contato não tem tag própria — usa as tags da conversa mais recente, que
  // é onde elas realmente vivem (ver /inbox). Também expõe essa conversa
  // (id + atendente) pro Funil linkar direto pro Inbox.
  const withTags = contacts.map(({ conversations, ...contact }) => ({
    ...contact,
    tags: conversations[0]?.tags ?? [],
    latestConversation: conversations[0] ? { id: conversations[0].id, assignedToId: conversations[0].assignedToId } : null,
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
