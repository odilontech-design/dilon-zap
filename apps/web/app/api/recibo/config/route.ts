import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { logAudit } from "@/lib/audit";

// Cabeçalho e rodapé do recibo impresso. Quem mexe é quem fecha pedido: o
// financeiro é quem está no balcão com a impressora e percebe primeiro que o
// telefone do papel está velho.
function podeEditar(role: string) {
  return role === "OWNER" || role === "FINANCEIRO" || role === "SUPERADMIN";
}

const campo = (max: number) => z.string().max(max).nullable();

const bodySchema = z.object({
  reciboNome: campo(120),
  reciboDocumento: campo(40),
  reciboEndereco: campo(200),
  reciboTelefone: campo(80),
  reciboRodape: campo(400),
  reciboLarguraMm: z.union([z.literal(58), z.literal(80)]),
});

const SELECAO = {
  name: true,
  reciboNome: true,
  reciboDocumento: true,
  reciboEndereco: true,
  reciboTelefone: true,
  reciboRodape: true,
  reciboLarguraMm: true,
} as const;

export async function GET() {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PEDIDOS");
  if (bloqueio) return bloqueio;

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: user.tenantId }, select: SELECAO });
  return NextResponse.json(tenant);
}

export async function PUT(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "PEDIDOS");
  if (bloqueio) return bloqueio;
  if (!podeEditar(user.role)) {
    return NextResponse.json({ error: "só o responsável ou o financeiro mudam o recibo" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // Campo apagado volta pra null: o recibo omite a linha, em vez de imprimir
  // uma linha em branco no cabeçalho.
  const limpo = (v: string | null) => v?.trim() || null;
  const d = parsed.data;

  const tenant = await prisma.tenant.update({
    where: { id: user.tenantId },
    data: {
      reciboNome: limpo(d.reciboNome),
      reciboDocumento: limpo(d.reciboDocumento),
      reciboEndereco: limpo(d.reciboEndereco),
      reciboTelefone: limpo(d.reciboTelefone),
      reciboRodape: limpo(d.reciboRodape),
      reciboLarguraMm: d.reciboLarguraMm,
    },
    select: SELECAO,
  });

  await logAudit({ actor: user, action: "recibo.config", metadata: { larguraMm: d.reciboLarguraMm } });

  return NextResponse.json(tenant);
}
