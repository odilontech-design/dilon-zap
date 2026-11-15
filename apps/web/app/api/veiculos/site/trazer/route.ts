import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { trazerDoSite } from "@/lib/trazer-do-site";

export const maxDuration = 120;

const corpo = z.object({ endereco: z.string().max(300).nullable().optional(), substituir: z.boolean().optional() });

/** "Trazer do site atual": copia banners, últimas ofertas e Quem somos do site que a loja já tem. */
export async function POST(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const r = await trazerDoSite(user.tenantId, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  const { banners, ofertas, quemSomos } = r.resultado;
  if (banners.trazidos || ofertas.aplicadas || quemSomos.aplicado) await logAudit({ actor: user, action: "site.trazer", metadata: { endereco: r.resultado.endereco, banners: banners.trazidos, ofertas: ofertas.aplicadas ? ofertas.noZap : 0, quemSomos: quemSomos.aplicado } });
  return NextResponse.json(r.resultado);
}
