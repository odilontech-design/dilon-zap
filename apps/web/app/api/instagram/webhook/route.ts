import { NextResponse } from "next/server";
import { respostaDeVerificacao } from "@dilon-zap/portais";
import { receberWebhookInstagram } from "@/lib/instagram";

export const runtime = "nodejs";

/** A Meta confere o endereço com um GET (hub.challenge) ao cadastrar o webhook. */
export async function GET(req: Request) {
  const desafio = respostaDeVerificacao(new URL(req.url).searchParams, process.env.INSTAGRAM_VERIFY_TOKEN);
  if (desafio === null) return new NextResponse("não autorizado", { status: 403 });
  return new NextResponse(desafio, { headers: { "Content-Type": "text/plain" } });
}

/**
 * Mensagens recebidas, assinadas pela Meta (X-Hub-Signature-256). Sem login:
 * a defesa é a assinatura. Responde 200 rápido; a Meta repete se der erro.
 */
export async function POST(req: Request) {
  const corpo = await req.text();
  try {
    const r = await receberWebhookInstagram(corpo, req.headers.get("x-hub-signature-256"));
    return NextResponse.json({ ok: r.status === 200 }, { status: r.status });
  } catch (e) {
    console.error("[instagram] webhook falhou:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "falha ao processar" }, { status: 500 });
  }
}
