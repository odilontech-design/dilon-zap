import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { logAudit } from "@/lib/audit";
import { duplicarVeiculo } from "@/lib/veiculos";
import { SEM_PERMISSAO, respostaDeErro } from "@/lib/veiculos-api";

/** "Duplicar cadastro": cria uma ficha nova com os dados do modelo (sem placa, km, fotos nem custos). Só a gestão, só carros da loja. */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return SEM_PERMISSAO();
  try {
    const novo = await duplicarVeiculo({ tenantId: user.tenantId, userId: user.id, veiculoId: params.id });
    await logAudit({ actor: user, action: "veiculo.duplicar", metadata: { veiculoId: novo.id, deId: params.id } });
    return NextResponse.json(novo, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
