import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  sku: z.string().trim().max(40).optional(),
  categoria: z.string().trim().max(40).optional(),
  priceCents: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  if (user.role !== "OWNER") return NextResponse.json({ error: "sem permissão" }, { status: 403 });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Filtra pelo tenant junto com o id: sem isso, chutar um id alcançaria
  // produto de outra empresa.
  const alvo = await prisma.product.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!alvo) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { sku, categoria, ...resto } = parsed.data;

  try {
    const atualizado = await prisma.product.update({
      where: { id: alvo.id },
      data: {
        ...resto,
        ...(sku !== undefined ? { sku: sku || null } : {}),
        ...(categoria !== undefined ? { categoria: categoria || null } : {}),
      },
    });
    return NextResponse.json(atualizado);
  } catch (err: unknown) {
    if (typeof err === "object" && err && (err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "já existe um produto com esse nome ou código" }, { status: 409 });
    }
    throw err;
  }
}

/**
 * Não existe DELETE de propósito: desativar é o caminho.
 *
 * Assim que o pedido existir, apagar um produto faria os pedidos antigos
 * perderem o que foi vendido. Como a fase do pedido vem logo em seguida, já
 * nasce sem a porta que teríamos que fechar depois.
 */
