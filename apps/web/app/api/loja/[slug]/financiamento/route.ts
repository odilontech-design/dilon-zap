import { NextResponse } from "next/server";
import { z } from "zod";
import { lojaPublica } from "@/lib/vitrine";
import { podeEnviar, registrarFinanciamentoDoSite } from "@/lib/lead-site";
import { telefoneDoVisitante } from "@/lib/vitrine-formularios";

const corpo = z.object({
  nome: z.string().trim().min(2).max(80),
  telefone: z.string().trim().min(10).max(20),
  veiculoId: z.string().max(40).nullable().optional(),
  entradaReais: z.number().min(0).max(5_000_000).nullable().optional(),
  mensagem: z.string().trim().max(500).nullable().optional(),
  site: z.string().max(200).optional(),
});

/** "Financiamento" da vitrine pública: vira negociação no CRM, sem pedir CPF nem renda. Sem login. */
export async function POST(req: Request, { params }: { params: { slug: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja || !loja.formularioAtivo) return NextResponse.json({ error: "não encontrada" }, { status: 404 });

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "confira o nome e o WhatsApp" }, { status: 400 });
  const d = parsed.data;
  if (d.site) return NextResponse.json({ ok: true });

  const telefone = telefoneDoVisitante(d.telefone);
  if (!telefone) return NextResponse.json({ error: "WhatsApp inválido: use DDD + número" }, { status: 400 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!podeEnviar([`ip:${ip}`, `tel:${telefone}`])) return NextResponse.json({ error: "muitos envios seguidos: tente mais tarde ou chame no WhatsApp" }, { status: 429 });

  await registrarFinanciamentoDoSite({
    loja,
    nome: d.nome,
    telefone,
    veiculoId: d.veiculoId || null,
    entradaCents: d.entradaReais ? Math.round(d.entradaReais * 100) : null,
    mensagem: d.mensagem || null,
  });
  return NextResponse.json({ ok: true });
}
