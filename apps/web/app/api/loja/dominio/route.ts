import { NextResponse } from "next/server";
import { slugPorDominio } from "@/lib/vitrine";

/**
 * Qual loja é dona deste domínio. Quem pergunta é o middleware, a cada
 * visita a um domínio próprio (com cache curto lá). Só responde para vitrine
 * no ar: domínio desligado volta 404 e o middleware manda para o Zap.
 */
export async function GET(req: Request) {
  const host = new URL(req.url).searchParams.get("host") ?? "";
  const slug = await slugPorDominio(host);
  if (!slug) return NextResponse.json({ error: "domínio não cadastrado" }, { status: 404 });
  return NextResponse.json({ slug });
}
