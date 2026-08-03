import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { upsertContactByPhone } from "@/lib/contact-server";
import { logAudit } from "@/lib/audit";

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

    const { created: wasCreated } = await upsertContactByPhone(
      user.tenantId,
      digits,
      row.name?.trim() || undefined
    );
    if (wasCreated) created++;
    else updated++;
  }

  await logAudit({ actor: user, action: "contact.import", metadata: { created, updated, skipped, total: parsed.data.rows.length } });

  return NextResponse.json({ created, updated, skipped });
}
