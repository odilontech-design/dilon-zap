import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { logAudit } from "@/lib/audit";
import { PORTAIS_DA_GRADE, atualizarAgora, gradeDePortais } from "@/lib/grade-portais";
import { anunciarNaOlx } from "@/lib/portais";
import { anunciarNaWebmotors } from "@/lib/portais-webmotors";
import { anunciarNaMobiauto } from "@/lib/portais-mobiauto";
import { anunciarNoNapista } from "@/lib/portais-napista";
import { anunciarNoMercadoLivre } from "@/lib/portais-mercadolivre";

/** Veículos > Anúncios: a grade de carros por portal. Só a gestão; a empresa vem da sessão. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  return NextResponse.json(await gradeDePortais(user.tenantId), { headers: { "Cache-Control": "no-store" } });
}

const corpo = z.object({ portal: z.enum(PORTAIS_DA_GRADE), veiculoIds: z.array(z.string()).min(1).max(500) });

/** "Publicar os que faltam" num portal: liga o anúncio dos carros pedidos (só os à venda desta loja) se a conta do portal está conectada. */
export async function POST(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const { portal } = parsed.data;

  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId: user.tenantId, portal } }, select: { status: true } });
  if (conta?.status !== "CONECTADA") return NextResponse.json({ error: "a conta deste portal não está conectada: conecte em Veículos > Portais" }, { status: 409 });

  // Os ids vêm do navegador: só valem carros à venda desta loja.
  const ids = (await prisma.veiculo.findMany({ where: { tenantId: user.tenantId, id: { in: parsed.data.veiculoIds }, status: "DISPONIVEL" }, select: { id: true } })).map((v) => v.id);
  if (!ids.length) return NextResponse.json({ error: "nenhum carro à venda entre os pedidos" }, { status: 400 });

  const r =
    portal === "WEBMOTORS" ? await anunciarNaWebmotors(user.tenantId, ids)
    : portal === "MOBIAUTO" ? await anunciarNaMobiauto(user.tenantId, ids)
    : portal === "NAPISTA" ? await anunciarNoNapista(user.tenantId, ids)
    : portal === "MERCADO_LIVRE" ? await anunciarNoMercadoLivre(user.tenantId, ids)
    : await anunciarNaOlx(user.tenantId, ids);
  await logAudit({ actor: user, action: "veiculos.anunciar_em_lote", metadata: { portal, pedidos: parsed.data.veiculoIds.length, aceitos: ids.length } });
  return NextResponse.json({ ok: true, pedidos: ids.length, ...r });
}

const corpoAtualizar = z.object({ portal: z.enum(PORTAIS_DA_GRADE) });

/** "Atualizar agora": reenvia já os anúncios deste portal que estão na fila ou com erro (o worker roda a cada minuto). */
export async function PUT(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpoAtualizar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const conta = await prisma.portalConta.findUnique({ where: { tenantId_portal: { tenantId: user.tenantId, portal: parsed.data.portal } }, select: { status: true } });
  if (conta?.status !== "CONECTADA") return NextResponse.json({ error: "a conta deste portal não está conectada: conecte em Veículos > Portais" }, { status: 409 });
  const r = await atualizarAgora(user.tenantId, parsed.data.portal);
  await logAudit({ actor: user, action: "veiculos.atualizar_anuncios", metadata: { portal: parsed.data.portal, reenviados: r.reenviados } });
  return NextResponse.json({ ok: true, ...r });
}
