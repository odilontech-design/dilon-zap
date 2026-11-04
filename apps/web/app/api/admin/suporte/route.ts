import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireSuperAdmin } from "@/lib/session";
import { naoLidasDoSuporte } from "@/lib/team-chat-leitura";
import { usuarioDeSuporte } from "@/lib/suporte-chat";

/**
 * GET /api/admin/suporte — a caixa de entrada do suporte, de todas as
 * empresas: as conversas diretas escritas a ele e o Geral de cada empresa.
 * Só o usuário de suporte; o conteúdo das conversas vem de
 * /api/team-chat/messages?empresa=...
 */
export async function GET() {
  const admin = await requireSuperAdmin();
  const suporte = await usuarioDeSuporte();
  if (!suporte || suporte.id !== admin.id) return NextResponse.json({ error: "sem acesso" }, { status: 403 });

  const [naoLidas, recentes, empresas, ultimoGeral] = await Promise.all([
    naoLidasDoSuporte(admin),
    // Últimas mensagens diretas que o suporte escreveu ou recebeu, de outras
    // empresas. O teto basta para montar a lista das conversas recentes.
    prisma.teamMessage.findMany({
      where: {
        tenantId: { not: admin.tenantId },
        OR: [{ destinatarioId: admin.id }, { authorId: admin.id, destinatarioId: { not: null } }],
      },
      orderBy: { createdAt: "desc" },
      take: 600,
      select: {
        tenantId: true,
        authorId: true,
        destinatarioId: true,
        body: true,
        mediaType: true,
        isDeleted: true,
        createdAt: true,
        author: { select: { name: true } },
        destinatario: { select: { name: true } },
      },
    }),
    prisma.tenant.findMany({
      where: { id: { not: admin.tenantId } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        users: { where: { deactivatedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } },
      },
    }),
    prisma.teamMessage.groupBy({
      by: ["tenantId"],
      where: { tenantId: { not: admin.tenantId }, setorId: null, destinatarioId: null, isDeleted: false },
      _max: { createdAt: true },
    }),
  ]);

  const nomeEmpresa = new Map(empresas.map((e) => [e.id, e.name]));

  // Uma linha por pessoa da empresa que conversa com o suporte.
  const porPessoa = new Map<
    string,
    { tenantId: string; empresa: string; userId: string; nome: string; ultima: string; deSuporte: boolean; em: string }
  >();
  for (const m of recentes) {
    const fala = m.authorId === admin.id;
    const userId = fala ? m.destinatarioId! : m.authorId;
    if (porPessoa.has(userId)) continue; // já veio a mais recente (ordem decrescente)
    porPessoa.set(userId, {
      tenantId: m.tenantId,
      empresa: nomeEmpresa.get(m.tenantId) ?? "",
      userId,
      nome: (fala ? m.destinatario?.name : m.author.name) ?? "",
      ultima: m.isDeleted ? "Mensagem apagada" : m.body || (m.mediaType ? "Anexo" : ""),
      deSuporte: fala,
      em: m.createdAt.toISOString(),
    });
  }

  const geralEm = new Map(ultimoGeral.map((g) => [g.tenantId, g._max.createdAt?.toISOString() ?? null]));

  return NextResponse.json({
    conversas: [...porPessoa.values()]
      .map((c) => ({ ...c, naoLidas: naoLidas.diretas[c.userId] ?? 0 }))
      .sort((a, b) => b.em.localeCompare(a.em)),
    empresas: empresas.map((e) => ({
      id: e.id,
      name: e.name,
      usuarios: e.users,
      geralEm: geralEm.get(e.id) ?? null,
      geralNaoLidas: naoLidas.geral[e.id] ?? 0,
    })),
    suporteId: suporte.id,
  });
}
