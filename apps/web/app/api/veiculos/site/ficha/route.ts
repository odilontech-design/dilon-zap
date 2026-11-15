import { NextResponse } from "next/server";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { gestaoDosPortais as gestao } from "@/lib/portais-api";
import { fichaDaLoja, salvarConfigDaFicha } from "@/lib/ficha-financiamento";
import { configDaFicha } from "@/lib/ficha-campos";
import { prisma } from "@dilon-zap/db";

/** Meu site > Páginas > Financiamento: o que o cliente preenche no site. */
export async function GET() {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const cfg = await prisma.veiculosConfig.findUnique({ where: { tenantId: user.tenantId }, select: { fichaFinanciamento: true } });
  const { semChave } = await fichaDaLoja(user.tenantId);
  return NextResponse.json({ ...configDaFicha(cfg?.fichaFinanciamento), semChave });
}

const corpo = z.object({
  completa: z.boolean().optional(),
  endereco: z.boolean().optional(),
  profissional: z.boolean().optional(),
  conjuge: z.boolean().optional(),
  refPessoais: z.number().int().min(0).max(3).optional(),
  refBancarias: z.number().int().min(0).max(2).optional(),
  veiculo: z.boolean().optional(),
});

export async function PUT(req: Request) {
  const { user, bloqueio } = await gestao();
  if (bloqueio) return bloqueio;
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });
  const nova = await salvarConfigDaFicha(user.tenantId, parsed.data);
  await logAudit({ actor: user, action: "site.ficha", metadata: nova });
  return NextResponse.json(nova);
}
