import { NextResponse } from "next/server";
import { slugPorDominio } from "@/lib/vitrine";

/**
 * O "ask" do Caddy: antes de emitir certificado para um domínio que chegou,
 * o Caddy pergunta aqui. 200 só para domínio cadastrado numa vitrine no ar;
 * sem isso, qualquer um apontaria um domínio para a VPS e faria o Caddy
 * pedir certificados à vontade (e esgotar o limite do Let's Encrypt).
 */
export async function GET(req: Request) {
  const dominio = new URL(req.url).searchParams.get("domain") ?? "";
  return (await slugPorDominio(dominio)) ? new NextResponse("ok") : new NextResponse("não", { status: 404 });
}
