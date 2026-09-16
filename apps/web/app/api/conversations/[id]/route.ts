import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { encerrarCiclo } from "@/lib/atendimentos";
import { conversationVisibilityWhere } from "@/lib/conversation-access";

const bodySchema = z.object({
  status: z.enum(["OPEN", "PENDING", "RESOLVED"]).optional(),
  assignedToId: z.string().nullable().optional(),
  // Encaminhar pra outro setor (ou nulo, de volta pra fila geral). Distinto
  // de assignedToId: setor é fila de equipe, responsável é uma pessoa só.
  setorId: z.string().nullable().optional(),
  // O que o setor que recebe precisa saber. Obrigatório quando o setor muda
  // de verdade — ver TransferenciaSetor no schema.
  motivoTransferencia: z.string().trim().min(3).max(200).optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional(),
  closeReason: z.string().trim().min(1).max(60).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true } },
      setor: { select: { id: true, nome: true } },
    },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(conversation);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const conversation = await prisma.conversation.findFirst({
    where: { id: params.id, tenantId: user.tenantId, ...(await conversationVisibilityWhere(user)) },
  });
  if (!conversation) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Se atribuindo a alguém, confere que esse alguém é do mesmo tenant —
  // senão dá pra atribuir conversa da Believe pra um agente de outro negócio.
  let agente: { id: string; name: string } | null = null;
  if (parsed.data.assignedToId) {
    agente = await prisma.user.findFirst({
      where: { id: parsed.data.assignedToId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!agente) return NextResponse.json({ error: "agente inválido" }, { status: 400 });
  }

  // Mesma checagem pro setor — e só um setor ativo, que ainda aparece pra
  // alguém puxar. Encaminhar pra um desativado deixaria a conversa numa fila
  // que ninguém enxerga.
  if (parsed.data.setorId) {
    const setor = await prisma.setor.findFirst({
      where: { id: parsed.data.setorId, tenantId: user.tenantId, ativo: true },
    });
    if (!setor) return NextResponse.json({ error: "setor inválido" }, { status: 400 });
  }

  // Só conta como transferência de setor EXPLÍCITA quem veio do seletor de
  // setor — é o que zera o responsável e não credita "quem transferiu" (vira
  // fila, não um passe de mão em mão). O realinhamento automático logo
  // abaixo NÃO entra aqui, porque ali foi uma PESSOA que assumiu, só o setor
  // seguiu junto.
  const mudouSetorExplicitamente =
    parsed.data.setorId !== undefined && parsed.data.setorId !== conversation.setorId;

  // Encaminhar sem dizer do que se trata joga o cliente numa fila muda: o
  // setor que recebe não vê o histórico do setor anterior (ver
  // Tenant.isolarHistoricoPorSetor) e, sem o motivo, a única saída é pedir
  // pro cliente contar tudo de novo. Por isso é barrado aqui no servidor, e
  // não só no formulário.
  if (mudouSetorExplicitamente && !parsed.data.motivoTransferencia) {
    return NextResponse.json({ error: "informe o motivo da transferência" }, { status: 400 });
  }

  // motivoTransferencia vira registro próprio (TransferenciaSetor), não coluna
  // da conversa — por isso sai daqui antes de virar `data` do update.
  const { motivoTransferencia, ...campos } = parsed.data;
  const dados: typeof campos = { ...campos };

  // Encaminhar pra outro setor esvazia o responsável — vira a fila do setor,
  // do jeito que a URA já entrega (ver direcionarParaSetor no worker). Sem
  // isso a conversa continuaria só na vista de quem já era responsável, e
  // ninguém do setor novo a veria — o oposto do que transferir quer dizer.
  // Só não mexe se o mesmo pedido já estiver escolhendo alguém.
  if (mudouSetorExplicitamente && dados.assignedToId === undefined) {
    dados.assignedToId = null;
  }

  // Atribuir a uma pessoa sem trocar o setor junto foi o que deixou a
  // conversa #9871 desencontrada: o Gabriel (Departamento Pessoal) virou
  // responsável por uma conversa que continuava marcada Fiscal, e o
  // histórico dela sumiu atrás do isolamento por setor (ver
  // historico-setor.ts) — ele só via um aviso de encaminhamento na própria
  // conversa que era dele. Se a pessoa pertence a EXATAMENTE um setor,
  // diferente do atual, o setor muda junto. Pessoa em 0 ou 2+ setores não
  // mexe — não dá pra adivinhar qual valeria, e é melhor deixar como estava
  // do que trocar errado.
  if (parsed.data.assignedToId && dados.setorId === undefined) {
    const setoresDoAgente = await prisma.setorMembro.findMany({
      where: { userId: parsed.data.assignedToId },
      select: { setorId: true },
    });
    if (setoresDoAgente.length === 1 && setoresDoAgente[0].setorId !== conversation.setorId) {
      dados.setorId = setoresDoAgente[0].setorId;
    }
  }

  // Registro da troca de setor, com os nomes em foto (ver TransferenciaSetor
  // no schema). Cobre os dois caminhos: o seletor de setor, que traz o motivo
  // escrito à mão, e a atribuição a uma pessoa de outro setor, em que o setor
  // só seguiu quem assumiu — aí o próprio sistema escreve o motivo, porque
  // pedir um texto pra quem só puxou a conversa pra si seria atrito sem
  // ganho.
  const setorNovo = dados.setorId !== undefined ? dados.setorId : conversation.setorId;
  const mudouSetor = setorNovo !== conversation.setorId;
  let transferenciaParaGravar: {
    deSetorNome: string | null;
    paraSetorId: string | null;
    paraSetorNome: string | null;
    motivo: string;
    porNome: string;
  } | null = null;
  if (mudouSetor) {
    const envolvidos = [conversation.setorId, setorNovo].filter((s): s is string => s !== null);
    const nomes = new Map(
      (
        await prisma.setor.findMany({
          where: { id: { in: envolvidos } },
          select: { id: true, nome: true },
        })
      ).map((s) => [s.id, s.nome])
    );
    transferenciaParaGravar = {
      deSetorNome: conversation.setorId ? (nomes.get(conversation.setorId) ?? null) : null,
      paraSetorId: setorNovo,
      paraSetorNome: setorNovo ? (nomes.get(setorNovo) ?? null) : null,
      motivo: motivoTransferencia ?? `Assumida por ${agente?.name ?? user.name}`,
      porNome: user.name,
    };
  }

  // Transferência: só conta quando o responsável REALMENTE muda. Sem essa
  // comparação, salvar etiqueta ou status numa conversa já atribuída
  // reacenderia o aviso de "transferida pra você" do nada.
  const transferiu = dados.assignedToId !== undefined && dados.assignedToId !== conversation.assignedToId;

  // Fechando agora: carimba quando. Reabrindo: limpa o carimbo mas MANTÉM o
  // motivo, que é o registro do que aconteceu da vez anterior — apagar seria
  // perder informação que ninguém pediu pra perder.
  const fechando = parsed.data.status === "RESOLVED" && conversation.status !== "RESOLVED";
  const reabrindo =
    parsed.data.status !== undefined && parsed.data.status !== "RESOLVED" && conversation.status === "RESOLVED";

  const agora = new Date();

  // Fechar a conversa e gravar o ciclo de atendimento acontecem juntos ou não
  // acontecem. Separados, um erro entre os dois deixaria a conversa resolvida
  // sem o atendimento correspondente no histórico — um buraco silencioso que
  // só apareceria meses depois, quando alguém fosse contar atendimentos.
  const updated = await prisma.$transaction(async (tx) => {
    if (fechando) {
      await encerrarCiclo(tx, {
        conversationId: conversation.id,
        criadaEm: conversation.createdAt,
        motivo: parsed.data.closeReason ?? conversation.closeReason,
        encerradoById: user.id,
        encerradoEm: agora,
      });
    }

    if (transferenciaParaGravar) {
      await tx.transferenciaSetor.create({
        data: { conversationId: conversation.id, ...transferenciaParaGravar },
      });
    }

    return tx.conversation.update({
    where: { id: conversation.id },
    data: {
      ...dados,
      ...(fechando ? { closedAt: agora } : {}),
      ...(reabrindo ? { closedAt: null } : {}),
      ...(transferiu
        ? {
            assignedAt: dados.assignedToId ? new Date() : null,
            // Encaminhamento por setor não foi ninguém "passando" a conversa
            // pra uma pessoa — foi pra uma fila. Mesmo critério da URA: sem
            // assignedById aqui.
            assignedById: dados.assignedToId && !mudouSetorExplicitamente ? user.id : null,
            // Quem pega a conversa pra si não precisa ser avisado de que
            // pegou — já marca como visto pra não nascer um aviso inútil.
            assignmentSeenAt: dados.assignedToId === user.id ? new Date() : null,
          }
        : {}),
      },
    });
  });

  if (Object.keys(dados).length > 0) {
    await logAudit({
      actor: user,
      action: "conversation.update",
      metadata: { conversationId: conversation.id, ticketNumber: conversation.ticketNumber, changes: dados },
    });
  }

  return NextResponse.json(updated);
}
