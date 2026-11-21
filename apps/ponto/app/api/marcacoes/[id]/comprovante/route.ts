import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/ponto-db";
import { usuarioAtual } from "@/lib/session";
import { comprovanteDe, comprovantePdf } from "@/lib/comprovante";

export const dynamic = "force-dynamic";

/**
 * Comprovante de registro de ponto em PDF assinado (Portaria 671, art. 80):
 * disponível ao trabalhador logo depois de cada marcação, sem pedido nem
 * autorização, e para extração das marcações passadas (no mínimo 48 horas;
 * aqui, todas). O administrador da empresa também acessa.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });
  const m = await prisma.marcacao.findFirst({
    where: {
      id: params.id,
      empresaId: u.empresaId,
      ...(u.papel === "ADMIN" ? {} : { colaboradorId: u.colaboradorId ?? "—" }),
    },
    select: { id: true },
  });
  if (!m) return new NextResponse("marcação não encontrada", { status: 404 });

  const c = await comprovanteDe(m.id);
  const { pdf } = await comprovantePdf(c);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprovante-nsr-${c.nsr}.pdf"`,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
