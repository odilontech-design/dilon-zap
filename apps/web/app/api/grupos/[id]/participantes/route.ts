import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { refreshGroupParticipants } from "@/lib/worker-client";

async function grupoDoTenant(id: string, tenantId: string) {
  return prisma.contact.findFirst({ where: { id, tenantId, grupo: true }, select: { id: true } });
}

/**
 * GET /api/grupos/[id]/participantes — membros do grupo, com telefone quando
 * o WhatsApp informou. Lê do banco: é a foto da última atualização, não uma
 * consulta ao WhatsApp a cada abertura (isso viraria varredura).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "GRUPOS");
  if (bloqueio) return bloqueio;

  const grupo = await grupoDoTenant(params.id, user.tenantId);
  if (!grupo) return NextResponse.json({ error: "grupo não encontrado" }, { status: 404 });

  const participantes = await prisma.grupoParticipante.findMany({
    where: { grupoId: grupo.id },
    select: { jid: true, lid: true, telefone: true, admin: true, atualizadoEm: true },
  });

  // Nome de cada membro: o pushName da última mensagem que ele mandou no
  // grupo. É o único nome que temos — os dados do grupo não trazem nome.
  const lids = participantes.map((p) => p.lid ?? p.jid);
  const ultimas = await prisma.message.findMany({
    where: { conversation: { contactId: grupo.id }, autorJid: { in: lids }, autorNome: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { autorJid: true, autorNome: true },
  });
  const nomePorLid = new Map<string, string>();
  for (const m of ultimas) if (m.autorJid && !nomePorLid.has(m.autorJid)) nomePorLid.set(m.autorJid, m.autorNome!);

  const lista = participantes
    .map((p) => ({
      jid: p.jid,
      telefone: p.telefone,
      admin: p.admin,
      nome: nomePorLid.get(p.lid ?? p.jid) ?? null,
    }))
    // Quem já falou (tem nome) primeiro, depois admins, depois o resto.
    .sort((a, b) => Number(!!b.nome) - Number(!!a.nome) || Number(b.admin) - Number(a.admin));

  const atualizadoEm = participantes.reduce<Date | null>(
    (maior, p) => (!maior || p.atualizadoEm > maior ? p.atualizadoEm : maior),
    null
  );

  return NextResponse.json({ participantes: lista, atualizadoEm });
}

/**
 * POST /api/grupos/[id]/participantes — pede a lista atual ao WhatsApp. Um
 * grupo por clique; o worker trava cliques seguidos em vários grupos.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "GRUPOS");
  if (bloqueio) return bloqueio;

  const grupo = await grupoDoTenant(params.id, user.tenantId);
  if (!grupo) return NextResponse.json({ error: "grupo não encontrado" }, { status: 404 });

  const r = await refreshGroupParticipants(user.tenantId, grupo.id);
  if (!r.ok) return NextResponse.json({ error: r.reason ?? "não foi possível atualizar agora" }, { status: 409 });
  return NextResponse.json({ total: r.total ?? 0, comTelefone: r.comTelefone ?? 0 });
}
