import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ErroDoControle, definirControleDeCarros, obterControleDeCarros } from "@dilon-zap/vendedor-ia";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";

/**
 * A faixa do Vendedor IA de carros no Inbox: ver quem atende, assumir (parar a IA), devolver à IA ou voltar ao automático.
 * Vale para quem atende pelo Inbox (o vendedor assume sem depender da gestão). O tenant é sempre o da sessão.
 */
function resposta(e: unknown) {
  if (e instanceof ErroDoControle) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError) return NextResponse.json({ error: "pedido inválido" }, { status: 400 });
  throw e;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VENDEDOR_IA");
  if (bloqueio) return bloqueio;
  try {
    return NextResponse.json(await obterControleDeCarros(user.tenantId, params.id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return resposta(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VENDEDOR_IA");
  if (bloqueio) return bloqueio;
  try {
    const corpo = await req.json().catch(() => null);
    const r = await definirControleDeCarros(user.tenantId, params.id, corpo, { id: user.id, name: user.name });
    await logAudit({ actor: user, action: "vendedor_ia.controle_da_conversa", metadata: { conversationId: params.id, acao: (corpo as { acao?: string } | null)?.acao, controle: r.controle, canceladas: r.canceladas } });
    return NextResponse.json(r);
  } catch (e) {
    return resposta(e);
  }
}
