import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { logAudit } from "@/lib/audit";
import { ErroDeNegocio, criarNegociacao } from "@/lib/negociacoes";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { NOME_DO_FUNIL_DO_SDR, converterEmNegociacao } from "@/lib/sdr/converter";

/**
 * Passa uma empresa com interesse para o CRM, no funil "Prospecção ativa". Uma ação humana por empresa: cria o
 * contato (sem consultar o WhatsApp) e uma negociação, e guarda o vínculo no SDR. Repetir devolve a mesma negociação.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);
  try {
    const r = await converterEmNegociacao({ acesso, empresaId: params.id, prisma, criarNegociacao });
    if (!r.jaExistia) await logAudit({ actor: acesso.user, action: "sdr.convertida.crm", metadata: { empresaId: params.id, negociacaoId: r.negociacaoId, funil: NOME_DO_FUNIL_DO_SDR } });
    return NextResponse.json(r, { status: r.jaExistia ? 200 : 201 });
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    return respostaDeErro(e);
  }
}
