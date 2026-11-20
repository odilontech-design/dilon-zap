import { NextResponse } from "next/server";
import { z } from "zod";
import { lojaPublica } from "@/lib/vitrine";
import { podeEnviar, registrarAvaliacaoDoSite } from "@/lib/lead-site";
import { telefoneDoVisitante } from "@/lib/vitrine-formularios";

const corpo = z.object({
  nome: z.string().trim().min(2).max(80),
  telefone: z.string().trim().min(10).max(20),
  marca: z.string().trim().min(2).max(40),
  modelo: z.string().trim().min(1).max(60),
  ano: z.number().int().min(1950).max(new Date().getFullYear() + 1).nullable().optional(),
  km: z.number().int().min(0).max(3_000_000).nullable().optional(),
  mensagem: z.string().trim().max(500).nullable().optional(),
  // Campo invisível: gente não preenche, robô preenche.
  site: z.string().max(200).optional(),
});

/** "Venda seu carro" da vitrine pública: vira negociação de avaliação no CRM. Sem login. */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja || !loja.formularioAtivo) return NextResponse.json({ error: "não encontrada" }, { status: 404 });

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "confira o nome, o WhatsApp e os dados do carro" }, { status: 400 });
  const d = parsed.data;
  if (d.site) return NextResponse.json({ ok: true }); // robô: finge que deu certo

  const telefone = telefoneDoVisitante(d.telefone);
  if (!telefone) return NextResponse.json({ error: "WhatsApp inválido: use DDD + número" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!podeEnviar([`ip:${ip}`, `tel:${telefone}`])) return NextResponse.json({ error: "muitos envios seguidos: tente mais tarde ou chame no WhatsApp" }, { status: 429 });

  await registrarAvaliacaoDoSite({ loja, nome: d.nome, telefone, marca: d.marca, modelo: d.modelo, ano: d.ano ?? null, km: d.km ?? null, mensagem: d.mensagem || null });
  return NextResponse.json({ ok: true });
}
