import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { dadosDoSite, painelDoSite, salvarDestaques, salvarPaginas } from "@/lib/meu-site";
import { linkFacebook, linkInstagram } from "@/lib/vitrine-aparencia";

/** "Meu site": o painel (como o site está) e os dados das abas Banners, Destaques e Páginas. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const [painel, dados] = await Promise.all([painelDoSite(user.tenantId), dadosDoSite(user.tenantId)]);
  return NextResponse.json({ painel, ...dados });
}

const corpo = z.object({
  destaques: z.array(z.string().max(40)).max(20).optional(),
  ofertaVeiculoId: z.string().max(40).nullable().optional(),
  quemSomosTitulo: z.string().max(200).nullable().optional(),
  quemSomosTexto: z.string().max(6000).nullable().optional(),
  instagram: z.string().max(100).nullable().optional(),
  facebook: z.string().max(150).nullable().optional(),
});

/** Salva destaques e oferta, ou as páginas (Quem somos e redes sociais). */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const d = parsed.data;
  if (d.instagram && !linkInstagram(d.instagram)) return NextResponse.json({ error: "Instagram inválido: use @usuario ou o endereço do perfil" }, { status: 400 });
  if (d.facebook && !linkFacebook(d.facebook)) return NextResponse.json({ error: "Facebook inválido: use o nome da página ou o endereço dela" }, { status: 400 });
  if (d.destaques !== undefined || d.ofertaVeiculoId !== undefined) {
    const atual = await dadosDoSite(user.tenantId);
    await salvarDestaques(user.tenantId, d.destaques ?? atual.destaques, d.ofertaVeiculoId);
    await logAudit({ actor: user, action: "site.destaques" });
  }
  if (d.quemSomosTitulo !== undefined || d.quemSomosTexto !== undefined || d.instagram !== undefined || d.facebook !== undefined) {
    await salvarPaginas(user.tenantId, d);
    await logAudit({ actor: user, action: "site.paginas" });
  }
  return NextResponse.json({ ok: true });
}
