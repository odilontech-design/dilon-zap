import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

const bodySchema = z
  .object({
    /** Conectar uma linha ADICIONAL, em vez de religar a que já existe. */
    novo: z.boolean().optional(),
    label: z.string().trim().min(1).max(40).optional(),
    /** Setor dono da linha nova. Null/ausente = linha geral da empresa. */
    setorId: z.string().nullable().optional(),
    /** Religar uma linha específica (quando a empresa tem mais de uma). */
    sessionId: z.string().optional(),
  })
  .optional();

/**
 * Conectar um número.
 *
 * Dois caminhos bem diferentes, e misturá-los já causou estrago em produção:
 *
 *  - RELIGAR uma linha existente reaproveita a MESMA linha do banco. Conversa
 *    e mensagem ficam presas ao sessionId pra sempre; criar uma linha nova
 *    orfanaria o histórico inteiro, porque o worker só mantém socket ativo
 *    pra sessão nova e a conversa antiga nunca mais receberia mensagem.
 *
 *  - ADICIONAR uma linha (`novo: true`) cria de fato outra sessão, com rótulo
 *    e, se a empresa quiser, um setor dono. É o caso da Guttierres, que
 *    separou uma linha só pro financeiro.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const corpo = parsed.data ?? {};

  if (corpo.novo) {
    if (user.role !== "OWNER" && user.role !== "SUPERADMIN") {
      return NextResponse.json({ error: "só o responsável conecta outro número" }, { status: 403 });
    }

    // Setor precisa ser desta empresa e estar ativo — número preso a um setor
    // desativado entregaria conversa numa fila que ninguém enxerga.
    if (corpo.setorId) {
      const setor = await prisma.setor.findFirst({
        where: { id: corpo.setorId, tenantId: user.tenantId, ativo: true },
        select: { id: true },
      });
      if (!setor) return NextResponse.json({ error: "setor inválido" }, { status: 400 });
    }

    const criada = await prisma.whatsAppSession.create({
      data: {
        tenantId: user.tenantId,
        status: "PENDING_QR",
        label: corpo.label?.trim() || "Novo número",
        setorId: corpo.setorId ?? null,
      },
    });
    await logAudit({
      actor: user,
      action: "whatsapp.numero_adicionado",
      metadata: { sessionId: criada.id, label: criada.label, setorId: criada.setorId },
    });
    return NextResponse.json(criada);
  }

  // A linha que a pessoa pediu pra religar, ou — quando a empresa só tem uma —
  // a que existir. Nunca "a mais recente" sem filtro: com duas linhas isso
  // religaria a errada.
  const alvo = corpo.sessionId
    ? await prisma.whatsAppSession.findFirst({
        where: { id: corpo.sessionId, tenantId: user.tenantId },
      })
    : await prisma.whatsAppSession.findFirst({
        where: { tenantId: user.tenantId },
        orderBy: { createdAt: "asc" },
      });

  if (alvo && alvo.status !== "LOGGED_OUT") return NextResponse.json(alvo);

  const session = alvo
    ? // Transação: se a limpeza das chaves de sinal for e o reset da sessão
      // não (ou vice-versa), sobra um estado inconsistente. Atômico junto.
      await prisma.$transaction(async (tx) => {
        // Credenciais antigas foram invalidadas pelo logout — precisa limpar
        // pra o worker gerar QR novo em vez de tentar reusar sessão morta.
        await tx.whatsAppSignalKey.deleteMany({ where: { sessionId: alvo.id } });
        return tx.whatsAppSession.update({
          where: { id: alvo.id },
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
    metadata: { sessionId: session.id, reusedExistingSession: !!alvo },
  });

  return NextResponse.json(session);
}
