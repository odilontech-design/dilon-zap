import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";
import { corrigirDataDaOSHistorica, ErroDeData } from "@/lib/otica-corrigir-data";

const schema = z.object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/**
 * Corrige a data de uma OS do papel. A leitura por IA às vezes erra o ano ou o mês do talão; aqui
 * a pessoa acerta em um passo e a OS, a parcela e o pagamento do Financeiro acompanham.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "informe a data no formato AAAA-MM-DD" }, { status: 400 });

  try {
    const r = await corrigirDataDaOSHistorica(user.tenantId, params.id, parsed.data.dia);
    await logAudit({ actor: user, action: "otica.os.data_corrigida", metadata: { numero: r.numero, de: r.de, para: r.para } });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof ErroDeData) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
