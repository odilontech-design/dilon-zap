import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { completarEstoque } from "@/lib/veiculos-completar";
import { SEM_PERMISSAO } from "@/lib/veiculos-api";

const corpo = z.object({
  itens: z
    .array(
      z.object({
        id: z.string(),
        km: z.number().int().min(0).max(2_000_000).optional(),
        precoCents: z.number().int().min(1).max(100_000_000_00).optional(),
      }),
    )
    .min(1)
    .max(300),
  /** Depois de salvar, coloca à venda os carros em preparação que ficaram com preço e km. */
  colocarAVenda: z.boolean().optional(),
});

/**
 * Preenche km e preço de vários carros de uma vez (a tela "Completar"). Km
 * informada (inclusive 0) marca o carro como "km informada", o que libera a
 * vitrine e os portais; preço e km passam pelo histórico do carro.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  const parsed = corpo.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const { salvos, colocados, pulados } = await completarEstoque(user.tenantId, user.id, parsed.data.itens, !!parsed.data.colocarAVenda);
  await logAudit({ actor: user, action: "veiculo.completar-lote", metadata: { salvos, colocados } });
  return NextResponse.json({ salvos, colocados, pulados });
}
