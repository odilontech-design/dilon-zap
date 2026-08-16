import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";

// Mesmo desenho da importação de contatos: o CSV é lido no navegador (onde
// dá pra mostrar erro de formatação na hora) e aqui chegam linhas já
// separadas.
const bodySchema = z.object({
  rows: z
    .array(
      z.object({
        name: z.string(),
        sku: z.string().optional(),
        categoria: z.string().optional(),
        priceCents: z.number().int().min(0),
      })
    )
    .max(2000),
});

export async function POST(req: Request) {
  const user = await requireUser();
  // Mesma permissão do cadastro manual: Responsável e Financeiro.
  if (user.role !== "OWNER" && user.role !== "FINANCEIRO") {
    return NextResponse.json({ error: "sem permissão" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const linha of parsed.data.rows) {
    const name = linha.name.trim();
    if (!name) {
      ignorados++;
      continue;
    }

    // Reimportar a mesma planilha ATUALIZA em vez de duplicar ou explodir.
    // É o caso normal: a Believe muda preço na planilha e importa de novo.
    // Casar pelo nome porque nem todo produto tem código.
    try {
      const existente = await prisma.product.findFirst({
        where: { tenantId: user.tenantId, name },
        select: { id: true },
      });

      if (existente) {
        await prisma.product.update({
          where: { id: existente.id },
          data: {
            priceCents: linha.priceCents,
            ...(linha.sku?.trim() ? { sku: linha.sku.trim() } : {}),
            ...(linha.categoria?.trim() ? { categoria: linha.categoria.trim() } : {}),
          },
        });
        atualizados++;
      } else {
        await prisma.product.create({
          data: {
            tenantId: user.tenantId,
            name,
            sku: linha.sku?.trim() || null,
            categoria: linha.categoria?.trim() || null,
            priceCents: linha.priceCents,
          },
        });
        criados++;
      }
    } catch {
      // Uma linha ruim (código repetido em duas linhas da planilha, por
      // exemplo) não pode abortar a importação inteira e deixar metade
      // dentro sem ninguém saber qual metade.
      ignorados++;
    }
  }

  await logAudit({
    actor: user,
    action: "product.import",
    metadata: { criados, atualizados, ignorados, total: parsed.data.rows.length },
  });

  return NextResponse.json({ criados, atualizados, ignorados });
}
