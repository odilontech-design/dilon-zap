import { NextResponse } from "next/server";
import { z } from "zod";
import { equipe } from "@/lib/instagram-api";
import { responderNoInstagram } from "@/lib/instagram";

/** A equipe responde a conversa pelo Zap (até 24 h depois da última mensagem do cliente). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, bloqueio } = await equipe();
  if (bloqueio) return bloqueio;
  const parsed = z.object({ texto: z.string().trim().min(1).max(1000) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "escreva a mensagem (até 1000 caracteres)" }, { status: 400 });
  const r = await responderNoInstagram(user.tenantId, params.id, parsed.data.texto, user.id);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.erro, reconectar: r.reconectar ?? false }, { status: 422 });
}
