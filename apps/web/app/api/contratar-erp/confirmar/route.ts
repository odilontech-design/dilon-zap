import { NextResponse } from "next/server";
import { z } from "zod";
import { confirmarContratacao, contratacaoDisponivel } from "@/lib/erp-contratacao-servico";
import { criarLimitador, enderecoDoPedido } from "@/lib/limite-de-pedidos";

const passouDoTeto = criarLimitador(20, 60 * 60 * 1000);

/** Pública: o token do e-mail é o segredo. A criação só acontece por POST (um GET de antivírus ou pré-visualização não cria nada). */
export async function POST(req: Request) {
  if (passouDoTeto(enderecoDoPedido(req))) return NextResponse.json({ error: "Muitas tentativas. Tente de novo mais tarde." }, { status: 429 });
  if (!contratacaoDisponivel()) return NextResponse.json({ error: "A contratação online está indisponível no momento." }, { status: 503 });
  const v = z.object({ token: z.string().min(20).max(100) }).safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: "Este link não é válido." }, { status: 400 });
  const r = await confirmarContratacao(v.data.token);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.status });
  return NextResponse.json(r);
}
