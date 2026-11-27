import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { fichaParaCliente } from "@/lib/veiculos-regras";
import { linkPublicoDoCarro } from "@/lib/vitrine";
import { montarCardDoStory } from "@/lib/story-card";

/**
 * O texto pronto do carro (o mesmo que vai ao cliente pelo WhatsApp), o endereço na vitrine, os códigos das fotos e o
 * cartão do story: alimenta "Copiar descritivo", "Compartilhar", "Baixar fotos" e "Criar story" do menu do carro. O story
 * segue o que a loja esconde do público (preço e km). Só carros da loja da sessão.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  const v = await prisma.veiculo.findFirst({ where: { id: params.id, tenantId: user.tenantId }, include: { fotos: { orderBy: { ordem: "asc" }, select: { id: true } } } });
  if (!v) return NextResponse.json({ error: "veículo não encontrado" }, { status: 404 });
  const [link, loja] = await Promise.all([
    linkPublicoDoCarro(user.tenantId, v),
    prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { name: true, veiculosConfig: { select: { nomeLoja: true, ocultarPrecoNoSite: true, ocultarKmNoSite: true } } } }),
  ]);
  const story = montarCardDoStory(v, { nome: loja?.veiculosConfig?.nomeLoja || loja?.name || "", ocultarPrecoNoSite: loja?.veiculosConfig?.ocultarPrecoNoSite, ocultarKmNoSite: loja?.veiculosConfig?.ocultarKmNoSite }, link);
  return NextResponse.json({ texto: fichaParaCliente(v) + (link ? `\n\n${link}` : ""), link, placa: v.placa, fotoIds: v.fotos.map((f) => f.id), story });
}
