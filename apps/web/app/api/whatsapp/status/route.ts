import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

/**
 * Todos os números da empresa, do mais antigo pro mais novo.
 *
 * Lista e não um só: a empresa pode ter uma linha por setor (ver
 * WhatsAppSession.setorId). Devolver "o mais recente" escondia da tela as
 * outras linhas e, pior, trocava o número mostrado no dia em que alguém
 * conectasse a segunda.
 */
export async function GET() {
  const user = await requireUser();

  const numeros = await prisma.whatsAppSession.findMany({
    where: { tenantId: user.tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      status: true,
      qrCode: true,
      phoneNumber: true,
      lastError: true,
      lastConnectedAt: true,
      semAutomacoes: true,
      setor: { select: { id: true, nome: true, cor: true } },
    },
  });

  return NextResponse.json(numeros);
}
