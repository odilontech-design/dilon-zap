import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/ponto-db";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { usuarioAtual } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Selfie da marcação: o administrador da empresa ou o próprio colaborador. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const u = await usuarioAtual();
  if (!u) return new NextResponse("não autenticado", { status: 401 });

  const m = await prisma.marcacao.findFirst({
    where: {
      id: params.id,
      empresaId: u.empresaId,
      ...(u.papel === "ADMIN" ? {} : { colaboradorId: u.colaboradorId ?? "—" }),
    },
    select: { fotoChave: true, foto: true },
  });
  if (!m?.fotoChave) return new NextResponse("sem foto", { status: 404 });

  if (m.foto) {
    return new NextResponse(new Uint8Array(m.foto.bytes), {
      headers: { "Content-Type": m.foto.mime, "Cache-Control": "private, max-age=3600" },
    });
  }
  return NextResponse.redirect(await getMediaReadUrl(m.fotoChave, 300));
}
