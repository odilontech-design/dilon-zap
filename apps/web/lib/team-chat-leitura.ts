import { prisma } from "@dilon-zap/db";
import type { CurrentUser } from "@/lib/session";
import { podeVerCanal } from "@/lib/team-chat";
import { usuarioDeSuporte } from "@/lib/suporte-chat";

/**
 * Mensagens novas do Chat da equipe, por pessoa. Cada canal guarda "lido até"
 * (TeamChatLeitura); o que chegou depois disso, de outra pessoa, é novo.
 *
 * Quem nunca abriu um canal conta só a última semana — sem isso, no primeiro
 * dia o menu acenderia com todo o histórico da empresa.
 */
const JANELA_SEM_LEITURA_MS = 7 * 86_400_000;

/**
 * `tenantExterno` só existe para o suporte lendo o Geral de OUTRA empresa:
 * "geral" é uma chave só por usuário, e sem a empresa na chave a leitura de
 * uma empresa apagaria o "não lido" de todas as outras.
 */
export function chaveDoCanal(setorId: string | null, comPessoaId: string | null, tenantExterno?: string | null): string {
  if (comPessoaId) return `dm:${comPessoaId}`;
  if (setorId) return `setor:${setorId}`;
  return tenantExterno ? `geral@${tenantExterno}` : "geral";
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

/**
 * O que chegou para o suporte vindo das empresas: conversas diretas escritas
 * a ele (que contam no menu) e mensagens novas no Geral de cada empresa (que
 * só aparecem dentro do painel — o Geral de cada empresa é conversa da equipe
 * dela, e não deve acender o menu a cada bom-dia).
 *
 * Sem "lido até", conta só o último mês das diretas e a última semana do Geral.
 */
export async function naoLidasDoSuporte(user: CurrentUser): Promise<{
  diretas: Record<string, number>; // por usuário que escreveu
  totalDiretas: number;
  geral: Record<string, number>; // por empresa
}> {
  const suporte = await usuarioDeSuporte();
  if (!suporte || user.id !== suporte.id) return { diretas: {}, totalDiretas: 0, geral: {} };

  const agora = Date.now();
  const leituras = await prisma.teamChatLeitura.findMany({ where: { userId: user.id }, select: { canal: true, lidoAte: true } });
  const lidoAte = new Map(leituras.map((l) => [l.canal, l.lidoAte]));

  const [diretas, geral] = await Promise.all([
    prisma.teamMessage.findMany({
      where: { destinatarioId: user.id, isDeleted: false, createdAt: { gt: new Date(agora - 30 * 86_400_000) } },
      select: { authorId: true, createdAt: true },
    }),
    prisma.teamMessage.findMany({
      where: {
        tenantId: { not: user.tenantId },
        setorId: null,
        destinatarioId: null,
        isDeleted: false,
        authorId: { not: user.id },
        createdAt: { gt: new Date(agora - JANELA_SEM_LEITURA_MS) },
      },
      select: { tenantId: true, createdAt: true },
    }),
  ]);

  const porUsuario: Record<string, number> = {};
  let totalDiretas = 0;
  for (const m of diretas) {
    const corte = lidoAte.get(`dm:${m.authorId}`);
    if (corte && m.createdAt <= corte) continue;
    porUsuario[m.authorId] = (porUsuario[m.authorId] ?? 0) + 1;
    totalDiretas++;
  }
  const porEmpresa: Record<string, number> = {};
  for (const m of geral) {
    const corte = lidoAte.get(`geral@${m.tenantId}`);
    if (corte && m.createdAt <= corte) continue;
    porEmpresa[m.tenantId] = (porEmpresa[m.tenantId] ?? 0) + 1;
  }
  return { diretas: porUsuario, totalDiretas, geral: porEmpresa };
}
