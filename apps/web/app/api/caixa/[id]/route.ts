import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { guardaFinanceiro } from "@/lib/guarda-financeiro";
import { dadosDoCaixa, ErroDeCaixa, fecharCaixa, registrarMovimento } from "@/lib/caixa";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const dados = await dadosDoCaixa(user.tenantId, params.id);
  if (!dados) return NextResponse.json({ error: "caixa não encontrado" }, { status: 404 });
  return NextResponse.json(dados);
}

const schema = z.discriminatedUnion("acao", [
  z.object({
    acao: z.literal("movimento"),
    tipo: z.enum(["SUPRIMENTO", "SANGRIA", "DESPESA"]),
    valorCents: z.number().int().min(1).max(10_000_000_000),
    descricao: z.string().trim().min(1).max(200),
  }),
  z.object({
    acao: z.literal("fechar"),
    contadoDinheiroCents: z.number().int().min(0).max(10_000_000_000),
    observacao: z.string().trim().max(500).nullable().optional(),
  }),
]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    if (d.acao === "movimento") {
      const m = await registrarMovimento(user.tenantId, user.id, params.id, { tipo: d.tipo, valorCents: d.valorCents, descricao: d.descricao });
      await logAudit({ actor: user, action: `caixa.${d.tipo.toLowerCase()}`, metadata: { caixaId: params.id, valorCents: d.valorCents } });
      return NextResponse.json(m, { status: 201 });
    }
    const r = await fecharCaixa(user.tenantId, user.id, params.id, d.contadoDinheiroCents, d.observacao);
    await logAudit({ actor: user, action: "caixa.fechado", metadata: { caixaId: params.id, ...r } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroDeCaixa) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
