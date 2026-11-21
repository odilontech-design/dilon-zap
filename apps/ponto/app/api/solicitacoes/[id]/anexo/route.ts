import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/ponto-db";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { usuarioAtual } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Anexo de uma solicitação (atestado): o administrador da empresa ou o próprio colaborador. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });

  const s = await prisma.solicitacao.findFirst({
    where: {
      id: params.id,
      empresaId: u.empresaId,
      ...(u.papel === "ADMIN" ? {} : { colaboradorId: u.colaboradorId ?? "—" }),
    },
    select: { anexoChave: true, anexoMime: true, anexoNome: true, anexo: true },
  });
  if (!s?.anexoChave) return new NextResponse("sem anexo", { status: 404 });

  if (s.anexo) {
    return new NextResponse(new Uint8Array(s.anexo.bytes), {
      headers: {
        "Content-Type": s.anexoMime ?? "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(s.anexoNome ?? "anexo")}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  }
  return NextResponse.redirect(await getMediaReadUrl(s.anexoChave, 300));
}
