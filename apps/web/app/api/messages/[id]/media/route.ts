import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";

// Nunca expomos a mediaKey nem as credenciais do R2 pro navegador — esse
// endpoint confere que a mensagem é do tenant logado e redireciona pra uma
// URL assinada de leitura, válida por 1h.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const message = await prisma.message.findFirst({
    where: { id: params.id, conversation: { tenantId: user.tenantId } },
    select: { mediaKey: true },
  });
  if (!message?.mediaKey) return NextResponse.json({ error: "not found" }, { status: 404 });

  const url = await getMediaReadUrl(message.mediaKey);
  return NextResponse.redirect(url);
}
