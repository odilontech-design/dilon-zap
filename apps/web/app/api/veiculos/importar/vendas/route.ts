import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";
import { ErroXlsx, lerXlsx } from "@/lib/xlsx-leitor";
import { importarVendas } from "@/lib/importar-vendas";

export const maxDuration = 300;

const corpo = z.object({ arquivoBase64: z.string().min(100).max(14_000_000), simular: z.boolean() });

/**
 * Importa a planilha de controle de vendas (.xlsx, uma aba por mês) como vendas concluídas, com o
 * comprador (CPF, RG e endereço) no contato. Em dois tempos: `simular` só conta; gravar cria.
 * Idempotente. Só a gestão, sempre na empresa da sessão.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "envie a planilha de controle de vendas (.xlsx)" }, { status: 400 });
  try {
    const abas = lerXlsx(Buffer.from(parsed.data.arquivoBase64, "base64"));
    const r = await importarVendas({ tenantId: user.tenantId, userId: user.id, abas, simular: parsed.data.simular });
    if (!parsed.data.simular) await logAudit({ actor: user, action: "veiculos.importar-vendas", metadata: { importadas: r.importadas, linhas: r.linhas, falhas: r.falhas.length } });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroXlsx) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
