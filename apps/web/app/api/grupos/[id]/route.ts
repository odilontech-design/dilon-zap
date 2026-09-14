import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";

const bodySchema = z.object({ ativo: z.boolean() });

/**
 * Ativa ou desativa o acompanhamento de um grupo.
 *
 * Qualquer pessoa da equipe pode — é a equipe que sabe quais grupos são de
 * cliente. Fica no registro de auditoria quem ativou, porque ativar faz o
 * grupo inteiro passar a ser gravado.
 *
 * Desativar não apaga nada: as mensagens já gravadas continuam, só as novas
 * deixam de entrar. Apagar histórico por um clique de "não acompanhar mais"
 * seria perder conversa de cliente que ninguém pediu pra perder.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "GRUPOS");
  if (bloqueio) return bloqueio;

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const grupo = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId, grupo: true },
    select: { id: true, name: true, grupoAtivadoEm: true },
  });
  if (!grupo) return NextResponse.json({ error: "grupo não encontrado" }, { status: 404 });

  if (parsed.data.ativo) {
    const sessao = await prisma.whatsAppSession.findFirst({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!sessao) {
      return NextResponse.json({ error: "conecte o número antes de ativar grupos" }, { status: 400 });
    }

    // A conversa nasce junto com a ativação: sem ela o grupo só apareceria na
    // lista depois da primeira mensagem, e quem acabou de ativar acharia que
    // não funcionou.
    await prisma.$transaction([
      prisma.contact.update({
        where: { id: grupo.id },
        data: { grupoAtivadoEm: grupo.grupoAtivadoEm ?? new Date() },
      }),
      prisma.conversation.upsert({
        where: { contactId_sessionId: { contactId: grupo.id, sessionId: sessao.id } },
        create: { tenantId: user.tenantId, sessionId: sessao.id, contactId: grupo.id, status: "OPEN" },
        update: {},
      }),
    ]);
  } else {
    await prisma.contact.update({ where: { id: grupo.id }, data: { grupoAtivadoEm: null } });
  }

  await logAudit({
    actor: user,
    action: parsed.data.ativo ? "grupo.ativar" : "grupo.desativar",
    metadata: { contactId: grupo.id, nome: grupo.name },
  });

  return NextResponse.json({ ok: true });
}
