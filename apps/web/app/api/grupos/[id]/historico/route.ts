import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { fetchGroupHistory } from "@/lib/worker-client";

/**
 * POST /api/grupos/[id]/historico
 *
 * "Buscar histórico anterior" de um grupo. Grupo só passa a ter histórico
 * aqui a partir da ativação (ver registrarMensagemDeGrupo no worker); isto
 * pede ao WhatsApp o que veio antes.
 *
 * Um grupo por vez, sempre por ação de alguém — de propósito não existe
 * versão que varra todos os grupos: chamada concentrada contra o WhatsApp é
 * o que derruba número.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "GRUPOS");
  if (bloqueio) return bloqueio;

  // Confere que o grupo é do tenant de quem pediu antes de mandar o worker
  // falar com o WhatsApp por causa dele.
  const grupo = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId, grupo: true },
    select: { id: true },
  });
  if (!grupo) return NextResponse.json({ error: "grupo não encontrado" }, { status: 404 });

  const r = await fetchGroupHistory(user.tenantId, grupo.id);
  if (!r.ok) {
    return NextResponse.json({ error: r.reason ?? "não foi possível buscar agora" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
