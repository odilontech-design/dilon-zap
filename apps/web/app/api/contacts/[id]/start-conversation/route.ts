import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { conversationVisibilityWhere } from "@/lib/conversation-access";
import { numeroParaEnviar } from "@/lib/whatsapp-sessions";

// Fase 0/1: um número por tenant, então "iniciar conversa" sempre usa a
// sessão mais recente do tenant. Quando existir mais de um número, isso
// precisa virar uma escolha explícita na tela.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const contact = await prisma.contact.findFirst({
    where: { id: params.id, tenantId: user.tenantId },
  });
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Pela linha de QUEM está abrindo: numa empresa com número próprio por setor,
  // o financeiro fala pelo número do financeiro. Ver lib/whatsapp-sessions.
  const session = await numeroParaEnviar(user);
  if (!session) {
    return NextResponse.json({ error: "Nenhum número de WhatsApp conectado ainda." }, { status: 400 });
  }

  // Quem clica em "Nova conversa" está assumindo o contato ali na hora — sem
  // isso a conversa nascia sem dono (nem responsável, nem setor), e a
  // primeira resposta do cliente caía na regra "sem dono, URA sempre pode
  // falar": o menu de boas-vindas disparava do zero por cima de quem tinha
  // acabado de mandar a primeira mensagem. Foi exatamente o que aconteceu com
  // o Igor e a Rose (#10374) — ele mandou "Boa tarde Rose!", e a resposta dela
  // reabriu a triagem inteira porque a conversa continuava sem dono.
  //
  // Setor junto quando a pessoa pertence a EXATAMENTE um — mesmo critério do
  // PATCH de conversa (ver #9871): em 0 ou 2+ setores não dá pra adivinhar
  // qual valeria, e errar é pior que deixar sem setor.
  const setoresDoAgente = await prisma.setorMembro.findMany({
    where: { userId: user.id },
    select: { setorId: true },
  });
  const setorId = setoresDoAgente.length === 1 ? setoresDoAgente[0].setorId : undefined;
  const agora = new Date();
  const dadosDeQuemAssume = {
    assignedToId: user.id,
    ...(setorId ? { setorId } : {}),
    assignedAt: agora,
    // Visto na hora: é a própria pessoa se atribuindo, não faz sentido um
    // aviso de "conversa transferida pra você" pra quem acabou de puxá-la.
    assignmentSeenAt: agora,
  };

  // upsert em vez de find-then-create: dois cliques rápidos em "iniciar
  // conversa" (ou um clique concorrente com uma mensagem chegando ao mesmo
  // tempo pelo worker) não podem criar duas conversas pro mesmo contato.
  //
  // No `update`, só quando NÃO existia dono — reabrir uma conversa antiga que
  // já está com outra pessoa (ou na fila de um setor) não pode arrancá-la de
  // quem já está cuidando só porque alguém clicou "Nova conversa" de novo.
  const conversation = await prisma.conversation.upsert({
    where: { contactId_sessionId: { contactId: contact.id, sessionId: session.id } },
    update: {},
    create: { tenantId: user.tenantId, contactId: contact.id, sessionId: session.id, ...dadosDeQuemAssume },
  });
  const assumida =
    conversation.assignedToId === null && conversation.setorId === null
      ? await prisma.conversation.update({ where: { id: conversation.id }, data: dadosDeQuemAssume })
      : conversation;

  // O upsert devolve a conversa que o contato já tinha, de quem quer que seja.
  // Se ela é de outro setor ou de outra pessoa, quem clicou não a enxerga, e a
  // tela abriria um 404 mudo (foi o que a Paola, do Administrativo, viu ao
  // iniciar conversa com um cliente cuja conversa antiga era do Fiscal).
  const visivel = await prisma.conversation.findFirst({
    where: { id: assumida.id, ...(await conversationVisibilityWhere(user)) },
    select: { id: true },
  });
  if (visivel) return NextResponse.json(assumida);

  const atual = await prisma.conversation.findUniqueOrThrow({
    where: { id: assumida.id },
    include: { assignedTo: { select: { name: true } }, setor: { select: { nome: true } } },
  });

  // Em atendimento com outra pessoa ou setor: não arranca de quem está
  // cuidando. Diz com quem está, que é o que a atendente precisa pra pedir a
  // transferência.
  if (atual.status !== "RESOLVED") {
    const com = [atual.assignedTo?.name, atual.setor?.nome && `setor ${atual.setor.nome}`]
      .filter(Boolean)
      .join(" · ");
    return NextResponse.json(
      {
        error: `Este cliente já está em atendimento${com ? ` (${com})` : ""}. Peça a quem está com a conversa para transferir pra você.`,
      },
      { status: 409 }
    );
  }

  // Encerrada: ninguém está cuidando dela. Quem pediu pra iniciar assume, igual
  // ao caso da conversa sem dono acima — reabre, atribui e, se a pessoa
  // pertence a um setor só, leva o setor junto (mesmo critério do PATCH).
  const reaberta = await prisma.$transaction(async (tx) => {
    const trocouSetor = setorId !== undefined && setorId !== atual.setorId;
    if (trocouSetor) {
      const setorNovo = await tx.setor.findUnique({ where: { id: setorId }, select: { nome: true } });
      await tx.transferenciaSetor.create({
        data: {
          conversationId: atual.id,
          deSetorNome: atual.setor?.nome ?? null,
          paraSetorId: setorId,
          paraSetorNome: setorNovo?.nome ?? null,
          motivo: `Conversa reaberta por ${user.name}`,
          porNome: user.name,
        },
      });
    }
    return tx.conversation.update({
      where: { id: atual.id },
      data: {
        status: "OPEN",
        closedAt: null,
        ...dadosDeQuemAssume,
        assignedById: null,
      },
    });
  });

  return NextResponse.json(reaberta);
}
