import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { logAudit } from "@/lib/audit";
import { ErroDeNegocio, criarNegociacao } from "@/lib/negociacoes";
import { recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { NOME_DO_FUNIL_DO_SDR, converterEmNegociacao } from "@/lib/sdr/converter";

/**
 * Marca como oportunidade uma empresa com interesse registrado. A negociação em "Prospecção ativa" já nasce no primeiro
 * contato registrado; aqui ela é reaproveitada (ou criada, se faltar). Repetir devolve a mesma negociação.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);
  try {
    const r = await converterEmNegociacao({ acesso, empresaId: params.id, prisma, criarNegociacao });
    if (!r.jaExistia) await logAudit({ actor: acesso.user, action: "sdr.convertida.crm", metadata: { empresaId: params.id, negociacaoId: r.negociacaoId, funil: NOME_DO_FUNIL_DO_SDR } });
    return NextResponse.json(r, { status: r.criada ? 201 : 200 });
  } catch (e) {
    if (e instanceof ErroDeNegocio) return NextResponse.json({ error: e.message }, { status: e.status });
    return respostaDeErro(e);
  }
}
