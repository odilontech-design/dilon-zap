import { NextResponse } from "next/server";
import { getMediaReadUrl } from "@dilon-zap/storage";
import { lojaPublica } from "@/lib/vitrine";
import { imagemDoBanner } from "@/lib/meu-site";

/** Imagem de um banner do site, sem login (`?celular=1` para a versão de celular, se houver). Só banner ativo de loja no ar. */
export async function GET(req: Request, { params }: { params: { slug: string; id: string } }) {
  const loja = await lojaPublica(params.slug);
  if (!loja) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const key = await imagemDoBanner(loja.tenantId, params.id, new URL(req.url).searchParams.get("celular") === "1");
  if (!key) return NextResponse.json({ error: "não encontrada" }, { status: 404 });
  const res = NextResponse.redirect(await getMediaReadUrl(key, 3600));
  res.headers.set("Cache-Control", "public, max-age=600");
  return res;
}
