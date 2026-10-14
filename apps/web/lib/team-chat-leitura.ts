import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";
import { podeVerCanal } from "@/lib/team-chat";

/**
 * Mensagens novas do Chat da equipe, por pessoa. Cada canal guarda "lido até"
 * (TeamChatLeitura); o que chegou depois disso, de outra pessoa, é novo.
 *
 * Quem nunca abriu um canal conta só a última semana — sem isso, no primeiro
 * dia o menu acenderia com todo o histórico da empresa.
 */
const JANELA_SEM_LEITURA_MS = 7 * 86_400_000;

export function chaveDoCanal(setorId: string | null, comPessoaId: string | null): string {
  if (comPessoaId) return `dm:${comPessoaId}`;
  return setorId ? `setor:${setorId}` : "geral";
}

/** Marca o canal como lido agora (ao abrir e enquanto está aberto). */
export async function marcarCanalLido(userId: string, canal: string) {
  const agora = new Date();
  await prisma.teamChatLeitura.upsert({
    where: { userId_canal: { userId, canal } },
    create: { userId, canal, lidoAte: agora },
    update: { lidoAte: agora },
  });
}

export async function naoLidasDoChat(user: CurrentUser): Promise<{ total: number; porCanal: Record<string, number> }> {
  const desde = new Date(Date.now() - JANELA_SEM_LEITURA_MS);
  const [membros, leituras] = await Promise.all([
    prisma.setorMembro.findMany({ where: { userId: user.id }, select: { setorId: true } }),
    prisma.teamChatLeitura.findMany({ where: { userId: user.id }, select: { canal: true, lidoAte: true } }),
  ]);
  const meusSetores = membros.map((m) => m.setorId);
  const lidoAte = new Map(leituras.map((l) => [l.canal, l.lidoAte]));

  // Candidatas: da última semana (ou depois da leitura mais antiga, se for
  // mais recente que isso não importa — o filtro fino é por canal, abaixo).
  const candidatas = await prisma.teamMessage.findMany({
    where: {
      tenantId: user.tenantId,
      authorId: { not: user.id },
      isDeleted: false,
      createdAt: { gt: desde },
      OR: [{ destinatarioId: null }, { destinatarioId: user.id }],
    },
    select: { setorId: true, destinatarioId: true, authorId: true, createdAt: true },
  });

  const porCanal: Record<string, number> = {};
  let total = 0;
  for (const m of candidatas) {
    if (!m.destinatarioId && !podeVerCanal(user.role, meusSetores, m.setorId)) continue;
    const canal = chaveDoCanal(m.destinatarioId ? null : m.setorId, m.destinatarioId ? m.authorId : null);
    const corte = lidoAte.get(canal);
    if (corte && m.createdAt <= corte) continue;
    porCanal[canal] = (porCanal[canal] ?? 0) + 1;
    total++;
  }
  return { total, porCanal };
}
