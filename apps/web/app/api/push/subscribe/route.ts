import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const bodySchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

/**
 * POST /api/push/subscribe — este aparelho passa a receber notificação.
 *
 * upsert pelo endpoint: o navegador devolve o MESMO endpoint enquanto a
 * instalação viver, então permitir de novo (ou recarregar a página) não
 * multiplica linhas. Se o endpoint já era de outra pessoa — celular
 * emprestado, mesma máquina com outro login — ele passa pra quem está logado
 * agora, senão o aviso iria pro dono antigo.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "inscrição inválida" }, { status: 400 });

  const { endpoint, keys } = parsed.data;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth },
  });

  return NextResponse.json({ ok: true });
}

/** DELETE — este aparelho para de receber. */
export async function DELETE(req: Request) {
  await requireUser();
  const { endpoint } = (await req.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint é obrigatório" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
