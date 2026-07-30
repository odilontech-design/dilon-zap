import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";

// O parsing do CSV acontece no cliente (arquivo pode ter formatação regional
// estranha, mais fácil ajustar com feedback visual imediato) — aqui só recebe
// linhas já separadas em nome/telefone.
const bodySchema = z.object({
  rows: z.array(z.object({ name: z.string().optional(), phone: z.string() })).max(5000),
});

export async function POST(req: Request) {
  const user = await requireUser();
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of parsed.data.rows) {
    const digits = row.phone.replace(/\D/g, "");
    if (!digits) {
      skipped++;
      continue;
    }
    const waJid = `${digits}@s.whatsapp.net`;
    const name = row.name?.trim() || undefined;

    const existing = await prisma.contact.findUnique({
      where: { tenantId_waJid: { tenantId: user.tenantId, waJid } },
    });

    if (existing) {
      if (name && !existing.name) {
        await prisma.contact.update({ where: { id: existing.id }, data: { name } });
      }
      updated++;
    } else {
      await prisma.contact.create({ data: { tenantId: user.tenantId, waJid, name } });
      created++;
    }
  }

  return NextResponse.json({ created, updated, skipped });
}
