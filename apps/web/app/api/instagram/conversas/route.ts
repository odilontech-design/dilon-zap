import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { ehGerencia } from "@/lib/papeis";
import { equipe, urlBaseDaRequisicao } from "@/lib/instagram-api";
import { instagramConfigurado, urlDoWebhookInstagram } from "@/lib/instagram";

/** A caixa: a conta conectada e as conversas, a mais recente primeiro. */
export async function GET(req: Request) {
  const { user, bloqueio } = await equipe();
  if (bloqueio) return bloqueio;
  const [conta, conversas, naoLidas] = await Promise.all([
    prisma.instagramConta.findUnique({ where: { tenantId: user.tenantId }, select: { username: true, nome: true, status: true, erro: true, webhookEm: true, expiraEm: true, conectadaEm: true } }),
    prisma.instagramConversa.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { ultimaMensagemEm: "desc" },
      take: 100,
      select: { id: true, nome: true, username: true, ultimoTexto: true, ultimaMensagemEm: true, ultimaEntradaEm: true, naoLidas: true, respondidaEm: true, telefone: true, negociacaoId: true },
    }),
    prisma.instagramConversa.aggregate({ where: { tenantId: user.tenantId }, _sum: { naoLidas: true } }),
  ]);
  return NextResponse.json({
    gerencia: ehGerencia(user.role),
    configurada: instagramConfigurado(),
    webhook: ehGerencia(user.role) ? urlDoWebhookInstagram(urlBaseDaRequisicao(req)) : null,
    conta,
    naoLidas: naoLidas._sum.naoLidas ?? 0,
    conversas,
  });
}
