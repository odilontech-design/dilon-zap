import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { custoSchema } from "@/lib/veiculos-schemas";
import { ErroDeVeiculo, lancarCusto, prepararFinanceiro } from "@/lib/veiculos";
import { nomeDoVeiculo } from "@/lib/veiculos-regras";
import { SEM_PERMISSAO, respostaDeErro } from "@/lib/veiculos-api";

/** Anota um gasto no carro (oficina, despachante…), com a conta a pagar se pedida. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();

  const parsed = custoSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const d = parsed.data;

  try {
    await prepararFinanceiro(user.tenantId);
    const custo = await prisma.$transaction(async (tx) => {
      const v = await tx.veiculo.findFirst({
        where: { id: params.id, tenantId: user.tenantId },
        select: { id: true, marca: true, modelo: true, versao: true, anoFabricacao: true, anoModelo: true },
      });
      if (!v) throw new ErroDeVeiculo("veículo não encontrado", 404);
      return lancarCusto(tx, {
        tenantId: user.tenantId,
        veiculoId: v.id,
        nomeVeiculo: nomeDoVeiculo(v),
        tipo: d.tipo,
        descricao: d.descricao,
        valorCents: d.valorCents,
        data: d.data ? new Date(d.data) : undefined,
        pagar: d.pagar,
        userId: user.id,
      });
    });
    return NextResponse.json(custo, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
