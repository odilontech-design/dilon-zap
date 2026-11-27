import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { fichaParaCliente } from "@/lib/veiculos-regras";
import { linkPublicoDoCarro } from "@/lib/vitrine";

/**
 * O texto pronto do carro (o mesmo que vai ao cliente pelo WhatsApp), o endereço na vitrine e os códigos das fotos:
 * alimenta "Copiar descritivo", "Compartilhar" e "Baixar fotos" do menu do carro. Só carros da loja da sessão.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  const v = await prisma.veiculo.findFirst({ where: { id: params.id, tenantId: user.tenantId }, include: { fotos: { orderBy: { ordem: "asc" }, select: { id: true } } } });
  if (!v) return NextResponse.json({ error: "veículo não encontrado" }, { status: 404 });
  const link = await linkPublicoDoCarro(user.tenantId, v);
  return NextResponse.json({ texto: fichaParaCliente(v) + (link ? `\n\n${link}` : ""), link, placa: v.placa, fotoIds: v.fotos.map((f) => f.id) });
}
