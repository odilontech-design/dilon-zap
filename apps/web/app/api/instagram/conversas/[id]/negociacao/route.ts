import { NextResponse } from "next/server";
import { z } from "zod";
import { equipe } from "@/lib/instagram-api";
import { criarNegociacaoDaConversa } from "@/lib/instagram";

/** Transforma a conversa em negociação no CRM, com o WhatsApp que o cliente passou. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, bloqueio } = await equipe();
  if (bloqueio) return bloqueio;
  const parsed = z.object({ telefone: z.string().trim().min(8).max(25) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "informe o WhatsApp do cliente com DDD" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, ...(await criarNegociacaoDaConversa(user.tenantId, params.id, parsed.data.telefone)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao criar a negociação" }, { status: 422 });
  }
}
