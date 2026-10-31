import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, lerJson, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { associarSchema } from "@/lib/sdr/esquemas";

type Contexto = { params: { id: string } };

/** Associa empresas a esta campanha. A qualificação pelo ICP dela roda na fila. */
export async function POST(req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const corpo = await lerJson(req);
  if (!corpo.ok) return corpo.resposta;
  const parsed = associarSchema.safeParse(corpo.dados);
  if (!parsed.success) return dadosInvalidos();
  try {
    const r = await acesso.sdr.empresas.associarACampanha(params.id, parsed.data.empresaIds);
    await logAudit({ actor: acesso.user, action: "sdr.empresas.associadas", metadata: { campanhaId: params.id, empresas: r.empresas } });
    return NextResponse.json(r, { status: 202 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
