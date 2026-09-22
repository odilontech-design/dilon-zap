import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { filtrarHistoricoPorSetor } from "@/lib/historico-setor";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  // Confere que a conversa é do tenant logado (e visível pro papel dele)
  // antes de devolver qualquer coisa.
  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  const mensagensCruas = await prisma.message.findMany({
    where: { conversationId: params.id },
    orderBy: { createdAt: "asc" },
    include: {
      sender: { select: { name: true } },
      quotedMessage: {
        select: { id: true, body: true, direction: true, mediaType: true, isDeleted: true, autorNome: true, sender: { select: { name: true } } },
      },
      reactions: { select: { id: true, emoji: true, fromMe: true } },
    },
  });

  // Telefone de quem falou, em grupo. A mensagem chega com o autor em @lid —
  // sem número nenhum — e quem sabe o par @lid ↔ telefone são os membros do
  // grupo guardados em GrupoParticipante. Em conversa 1:1 a consulta volta
  // vazia e nada muda.
  const membros = await prisma.grupoParticipante.findMany({
    where: { grupoId: conversation.contactId, telefone: { not: null } },
    select: { jid: true, lid: true, telefone: true },
  });
  const telefonePorAutor = new Map<string, string>();
  for (const m of membros) {
    telefonePorAutor.set(m.jid, m.telefone!);
    if (m.lid) telefonePorAutor.set(m.lid, m.telefone!);
  }
  const mensagens = mensagensCruas.map((m) => ({
    ...m,
    autorTelefone: m.autorJid ? (telefonePorAutor.get(m.autorJid) ?? null) : null,
  }));

  // Encaminhamentos de setor com o motivo escrito por quem encaminhou. Vão
  // pra todo mundo, isolamento ligado ou não: saber que a conversa mudou de
  // mão, e por quê, é contexto útil pra qualquer um que abra o atendimento.
  const transferencias = await prisma.transferenciaSetor.findMany({
    where: { conversationId: params.id },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      criadoEm: true,
      deSetorNome: true,
      paraSetorNome: true,
      motivo: true,
      porNome: true,
    },
  });

  // Isolamento de histórico entre setores: recurso ligado por empresa (hoje só
  // a Guttierres), e o Responsável sempre vê tudo — a barreira é só entre
  // setores/atendentes. Ver Tenant.isolarHistoricoPorSetor no schema.
  //
  // Ser o responsável ATUAL não abre o histórico. Já abriu, e foi justamente
  // isso que furou o isolamento no teste do Carlos: transferir pro
  // Departamento Pessoal atribuindo ao Gabriel fazia dele o responsável, e o
  // histórico do Fiscal aparecia inteiro pra ele. Quem recebe a conversa
  // recebe o motivo da transferência — não o que foi conversado no outro
  // setor.
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: user.tenantId },
    select: { isolarHistoricoPorSetor: true },
  });
  const semRestricao =
    !tenant.isolarHistoricoPorSetor || user.role === "OWNER" || user.role === "SUPERADMIN";
  if (semRestricao) {
    return NextResponse.json({ mensagens, marcadores: transferencias, historicoOculto: false });
  }

  const meusSetores = await prisma.setorMembro.findMany({
    where: { userId: user.id },
    select: { setorId: true },
  });

  const { visiveis, escondeu } = filtrarHistoricoPorSetor(
    mensagens,
    new Set(meusSetores.map((m) => m.setorId))
  );

  return NextResponse.json({
    mensagens: visiveis,
    marcadores: transferencias,
    historicoOculto: escondeu,
  });
}
