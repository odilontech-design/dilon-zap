import { NextResponse } from "next/server";
import { z } from "zod";
import { lojaPublica } from "@/lib/vitrine";
import { podeEnviar, registrarLeadDoSite } from "@/lib/lead-site";

const corpo = z.object({
  nome: z.string().trim().min(2).max(80),
  telefone: z.string().trim().min(10).max(20),
  mensagem: z.string().trim().max(500).nullable().optional(),
  veiculoId: z.string().max(40).nullable().optional(),
  // Campo invisível: gente não preenche, robô preenche.
  site: z.string().max(200).optional(),
});

/** "Quero ser chamado" da vitrine pública. Sem login. */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja || !loja.formularioAtivo) return NextResponse.json({ error: "não encontrada" }, { status: 404 });

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "confira o nome e o WhatsApp" }, { status: 400 });
  const d = parsed.data;
  // Robô: finge que deu certo e não grava nada.
  if (d.site) return NextResponse.json({ ok: true });

  const digitos = d.telefone.replace(/\D/g, "");
  const telefone = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  if (telefone.length < 12 || telefone.length > 13) return NextResponse.json({ error: "WhatsApp inválido: use DDD + número" }, { status: 400 });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!podeEnviar([`ip:${ip}`, `tel:${telefone}`])) return NextResponse.json({ error: "muitos envios seguidos: tente mais tarde ou chame no WhatsApp" }, { status: 429 });

  await registrarLeadDoSite({ loja, nome: d.nome, telefone, mensagem: d.mensagem || null, veiculoId: d.veiculoId || null });
  return NextResponse.json({ ok: true });
}
