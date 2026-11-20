import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { credencialConfere, lerLead } from "@dilon-zap/portais";
import { segredoDosPortais } from "@/lib/portais";
import { registrarLeadDoPortal } from "@/lib/lead-portal";

/**
 * Endereço que a OLX chama a cada contato de comprador (um por loja: o token
 * na URL identifica a empresa). Sem login, como todo webhook: a defesa é o
 * token da URL mais a credencial que registramos na OLX junto com ele, enviada
 * no header Authorization. A OLX dá 5 segundos e não reenvia: responde rápido
 * e só diz 2xx quando o lead está guardado.
 */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  const segredo = segredoDosPortais();
  if (!segredo) return NextResponse.json({ error: "indisponível" }, { status: 503 });
  const conta = await prisma.portalConta.findUnique({ where: { leadToken: params.token }, select: { tenantId: true, status: true } });
  if (!conta || conta.status === "DESCONECTADA") return NextResponse.json({ error: "não encontrado" }, { status: 404 });
  if (!credencialConfere(req.headers.get("authorization"), params.token, segredo)) return NextResponse.json({ error: "não autorizado" }, { status: 401 });

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }
  const lido = lerLead(corpo);
  if (!lido.ok) return NextResponse.json({ error: lido.erro }, { status: 400 });

  try {
    const r = await registrarLeadDoPortal(conta.tenantId, lido.lead);
    // responseId: o recibo que a OLX recomenda devolver, para ela conferir a entrega.
    return NextResponse.json({ ok: true, responseId: lido.lead.chave, duplicado: r.duplicado });
  } catch (e) {
    console.error("[portais] lead da OLX não registrado:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "falha ao registrar" }, { status: 500 });
  }
}
