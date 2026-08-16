import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { upsertContactByPhone } from "@/lib/contact-server";

export async function GET() {
  const user = await requireUser();

  // select explícito: essa rota alimenta o Funil (poll) e a página de
  // Contatos, devolvendo a base inteira de contatos a cada consulta — cada
  // campo a mais aqui vira tráfego repetido o dia todo. Só entra o que as
  // duas telas leem de fato (ver o type Contact de cada uma).
  const contacts = await prisma.contact.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      waJid: true,
      phoneNumber: true,
      avatarUrl: true,
      lastStatusAt: true,
      stageId: true,
      dealValueCents: true,
      createdAt: true,
      // Só o booleano, não a data: a tela precisa saber "tem / não tem /
      // não checado", e a data só interessa quando alguém for investigar
      // um caso específico.
      hasWhatsapp: true,
      conversations: {
        select: { id: true, tags: true, assignedToId: true, status: true, closeReason: true },
        orderBy: { lastMessageAt: "desc" },
        take: 1,
      },
      stage: { select: { id: true, name: true, color: true, position: true } },
    },
  });

  // Contato não tem tag própria — usa as tags da conversa mais recente, que
  // é onde elas realmente vivem (ver /inbox). Também expõe essa conversa
  // (id + atendente) pro Funil linkar direto pro Inbox.
  const withTags = contacts.map(({ conversations, ...contact }) => ({
    ...contact,
    tags: conversations[0]?.tags ?? [],
    latestConversation: conversations[0] ? { id: conversations[0].id, assignedToId: conversations[0].assignedToId } : null,
    // Só quando a conversa está de fato fechada: o motivo sobrevive a uma
    // reabertura de propósito (é o registro do que aconteceu antes), mas
    // exibir "Sem interesse" num atendimento que voltou a ficar aberto
    // diria ao funil algo que não é mais verdade.
    ultimoMotivo:
      conversations[0]?.status === "RESOLVED" ? conversations[0].closeReason ?? null : null,
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
