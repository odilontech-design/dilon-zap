import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { downloadMedia } from "@dilon-zap/storage";
import { requireUser } from "@/lib/session";

// Serve a foto de perfil guardada no nosso R2.
//
// Existe porque antes a tela apontava direto pra pps.whatsapp.net, e aquelas
// URLs expiram: a foto aparecia e sumia semanas depois sozinha.
//
// Devolve os bytes em vez de redirecionar pra uma URL assinada (que é o que
// a rota de mídia faz) por causa do volume: a lista de contatos mostra
// centenas de avatares de uma vez, e redirect não é cacheável — daria duas
// requisições por avatar em toda visita. Aqui a URL carrega ?v=<foto>, que
// muda quando a pessoa troca a foto, então o conteúdo desta URL nunca muda e
// pode ser cacheado pra sempre: o navegador baixa uma vez e para de pedir.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
    select: { avatarKey: true },
  });
  if (!contact?.avatarKey) return NextResponse.json({ error: "not found" }, { status: 404 });

  const buffer = await downloadMedia(contact.avatarKey);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/jpeg",
      // private: é foto de cliente de UM tenant, não pode ficar num cache
      // compartilhado no caminho. immutable: só vale porque o ?v= muda junto
      // com a foto — sem ele isso congelaria a foto antiga por um ano.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
