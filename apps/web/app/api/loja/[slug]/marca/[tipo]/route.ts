import { NextResponse } from "next/server";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { imagemDaMarca } from "@/lib/vitrine";

/** Logo ou banner da vitrine, sem login. Só responde com a vitrine no ar e a imagem cadastrada. */
export async function GET(_req: Request, { params }: { params: { slug: string; tipo: string } }) {
  if (params.tipo !== "logo" && params.tipo !== "banner") return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const key = await imagemDaMarca(params.slug, params.tipo);
  if (!key) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const res = NextResponse.redirect(await getMediaReadUrl(key, 3600));
  res.headers.set("Cache-Control", "public, max-age=600");
  return res;
}
