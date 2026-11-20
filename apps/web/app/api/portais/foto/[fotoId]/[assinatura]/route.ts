import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { downloadMedia } from "@dilon-zap/storage";
import { fotoAssinadaValida } from "@dilon-zap/portais";
import { segredoDosPortais } from "@/lib/portais";

/**
 * Foto de carro para o portal baixar, sem login. O link é assinado (só o Zap
 * gera) e só vale para carro com anúncio ligado: tirou do portal ou vendeu,
 * o link para de responder. Entrega os bytes direto, sem redirecionar, porque
 * robô de portal nem sempre segue redirecionamento.
 */
export async function GET(_req: Request, { params }: { params: { fotoId: string; assinatura: string } }) {
  const segredo = segredoDosPortais();
  const assinatura = params.assinatura.replace(/\.jpe?g$/i, "");
  if (!segredo || !fotoAssinadaValida(params.fotoId, assinatura, segredo)) return new NextResponse("não encontrada", { status: 404 });
  const foto = await prisma.fotoVeiculo.findFirst({
    where: { id: params.fotoId, veiculo: { status: "DISPONIVEL", publicacoes: { some: { ativo: true } } } },
    select: { key: true },
  });
  if (!foto) return new NextResponse("não encontrada", { status: 404 });
  const bytes = await downloadMedia(foto.key).catch(() => null);
  if (!bytes) return new NextResponse("não encontrada", { status: 404 });
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  const webp = bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": png ? "image/png" : webp ? "image/webp" : "image/jpeg",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
