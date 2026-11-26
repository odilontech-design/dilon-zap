import { NextResponse } from "next/server";
import { gestaoDosPortais } from "@/lib/portais-api";
import { detalheDoAnuncioNapista } from "@/lib/portais-napista";

/** Confere no NaPista como está o anúncio de um carro (só leitura). Só a gestão, sempre da loja da sessão. */
export async function GET(req: Request) {
  const { user, bloqueio } = await gestaoDosPortais();
  if (bloqueio) return bloqueio;
  const veiculoId = new URL(req.url).searchParams.get("veiculoId") ?? "";
  if (!veiculoId) return NextResponse.json({ error: "diga o carro" }, { status: 400 });
  try {
    return NextResponse.json(await detalheDoAnuncioNapista(user.tenantId, veiculoId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "o NaPista não respondeu" }, { status: 502 });
  }
}
