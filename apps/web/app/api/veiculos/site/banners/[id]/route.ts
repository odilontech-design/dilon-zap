import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { editarBanner, excluirBanner } from "@/lib/meu-site";

const corpo = z.object({ titulo: z.string().max(120).nullable().optional(), link: z.string().max(500).nullable().optional(), ativo: z.boolean().optional(), mover: z.enum(["cima", "baixo"]).optional() });

/** Muda título, link, liga/desliga ou troca a posição do banner. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const r = await editarBanner(user.tenantId, params.id, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.erro === "banner não encontrado" ? 404 : 400 });
  await logAudit({ actor: user, action: "site.banner.editar" });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  if (!(await excluirBanner(user.tenantId, params.id))) return NextResponse.json({ error: "banner não encontrado" }, { status: 404 });
  await logAudit({ actor: user, action: "site.banner.excluir" });
  return NextResponse.json({ ok: true });
}
