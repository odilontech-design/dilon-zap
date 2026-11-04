import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { pendenciaDoContato } from "@/lib/contas-receber";
import { podeVerPendencia } from "@/lib/plano";

/**
 * Quanto o cliente deve em parcelas em aberto. Aberto a quem atende, de
 * propósito: a consultora que monta o pedido precisa saber que a venda a prazo
 * vai ser bloqueada antes de prometer ao cliente.
 *
 * ?excluirPedido=<id> deixa de fora o próprio pedido (ao fechá-lo).
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const contato = await prisma.contact.findFirst({ where: { id: params.id, tenantId: user.tenantId }, select: { id: true } });
  if (!contato) return NextResponse.json({ error: "contato não encontrado" }, { status: 404 });

  // Atendente da empresa que reservou isso à gerência não fica sabendo.
  if (!(await podeVerPendencia(user))) return NextResponse.json({ error: "sem acesso" }, { status: 403 });

  const excluir = new URL(req.url).searchParams.get("excluirPedido") ?? undefined;
  return NextResponse.json(await pendenciaDoContato(user.tenantId, contato.id, excluir));
}
