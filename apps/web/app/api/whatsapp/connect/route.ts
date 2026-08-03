import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

// Fase 0: um número por tenant. Se já existe uma sessão que não está
// deslogada permanentemente, não cria outra — só devolve a existente.
export async function POST() {
  const user = await requireUser();

  const existing = await prisma.whatsAppSession.findFirst({
    where: { tenantId: user.tenantId, status: { not: "LOGGED_OUT" } },
  });
  if (existing) return NextResponse.json(existing);

  // Reconectar depois de um logout reaproveita a MESMA linha (reseta pra
  // PENDING_QR) em vez de criar outra — Conversation/Message ficam presos ao
  // sessionId pra sempre, então criar uma linha nova órfã o histórico
  // inteiro: a conversa antiga nunca mais recebe mensagem porque o worker só
  // mantém socket ativo pra sessão nova (bug real visto em produção).
  const previous = await prisma.whatsAppSession.findFirst({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "desc" },
  });

  const session = previous
    ? // Transação: se a limpeza das chaves de sinal for e o reset da sessão
      // não (ou vice-versa), sobra um estado inconsistente. Atômico junto.
      await prisma.$transaction(async (tx) => {
        // Credenciais antigas foram invalidadas pelo logout — precisa limpar
        // pra o worker gerar QR novo em vez de tentar reusar sessão morta.
        await tx.whatsAppSignalKey.deleteMany({ where: { sessionId: previous.id } });
        return tx.whatsAppSession.update({
          where: { id: previous.id },
          data: {
            status: "PENDING_QR",
            qrCode: null,
            authCreds: null,
            phoneNumber: null,
            lastError: null,
            lastConnectedAt: null,
          },
        });
      })
    : await prisma.whatsAppSession.create({
        data: { tenantId: user.tenantId, status: "PENDING_QR" },
      });

  await logAudit({
    actor: user,
    action: "whatsapp.connect_requested",
    metadata: { sessionId: session.id, reusedExistingSession: !!previous },
  });

  return NextResponse.json(session);
}
