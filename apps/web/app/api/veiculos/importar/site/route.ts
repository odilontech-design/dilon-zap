import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { ErroImportacaoSite, importarDoSite } from "@/lib/importar-site-estoque";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

const corpo = z.object({ endereco: z.string().trim().min(3).max(300), simular: z.boolean() });

/**
 * Traz o estoque do site atual da loja. Em dois tempos: `simular: true` mostra
 * o que entraria; `simular: false` grava os carros (em preparação, sem ir à
 * vitrine) e deixa as fotos na fila de download. Só a gestão.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "informe o endereço do site" }, { status: 400 });

  try {
    const r = await importarDoSite({ tenantId: user.tenantId, userId: user.id, endereco: parsed.data.endereco, simular: parsed.data.simular });
    if (!parsed.data.simular) await logAudit({ actor: user, action: "veiculos.importar-site", metadata: { site: r.site, criados: r.criados, fotos: r.fotos } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroImportacaoSite) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
