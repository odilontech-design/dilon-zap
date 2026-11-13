import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { conectarWebmotors, soDigitosCnpj } from "@/lib/portais-webmotors";

const corpo = z.object({ cnpj: z.string().trim().min(11).max(20), email: z.string().trim().email().max(200), senha: z.string().min(1).max(200) });

/** Entra na Webmotors com o CNPJ, e-mail e senha do sistema de revendedores e guarda a conta (cifrada). */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão conecta portais" }, { status: 403 });
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success || soDigitosCnpj(parsed.data.cnpj).length !== 14) return NextResponse.json({ error: "informe CNPJ (14 dígitos), e-mail e senha" }, { status: 400 });
  const r = await conectarWebmotors(user.tenantId, parsed.data);
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 422 });
  await logAudit({ actor: user, action: "portais.webmotors.conectar" });
  return NextResponse.json({ ok: true, modalidades: r.modalidades });
}
