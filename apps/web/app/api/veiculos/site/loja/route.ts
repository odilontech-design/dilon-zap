import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { dadosDaLoja, salvarAvancado, salvarDadosDaLoja, salvarExibicaoDoSite, salvarWhatsappDoSite } from "@/lib/dados-da-loja";

/** Meu site > Dados da loja, WhatsApp e Avançado. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await dadosDaLoja(user.tenantId));
}

const texto = (max: number) => z.string().max(max).nullable().optional();
const corpo = z.discriminatedUnion("secao", [
  z.object({
    secao: z.literal("dados"),
    cep: texto(12),
    logradouro: texto(200),
    bairro: texto(100),
    cidade: texto(100),
    uf: texto(2),
    telefones: z.array(z.object({ tipo: z.string().max(10), numero: z.string().max(25) })).max(5).optional(),
    mapaAtivo: z.boolean().optional(),
    ponto: texto(2000),
    horarioSemana: texto(80),
    horarioSabado: texto(80),
    horarioDomingo: texto(80),
  }),
  z.object({ secao: z.literal("exibicao"), ocultarPrecoNoSite: z.boolean().optional(), ocultarKmNoSite: z.boolean().optional() }),
  z.object({ secao: z.literal("whatsapp"), numero: texto(25), mensagem: texto(400) }),
  z.object({ secao: z.literal("avancado"), metaPixelId: texto(40), ga4Id: texto(40), googleAdsId: texto(40), gtmId: texto(40) }),
]);

export async function PUT(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const d = parsed.data;
  const r = d.secao === "dados" ? await salvarDadosDaLoja(user.tenantId, d) : d.secao === "exibicao" ? await salvarExibicaoDoSite(user.tenantId, d) : d.secao === "whatsapp" ? await salvarWhatsappDoSite(user.tenantId, d) : await salvarAvancado(user.tenantId, d);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  await logAudit({ actor: user, action: `site.${d.secao}` });
  return NextResponse.json({ ok: true });
}
