import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, lerJson, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { supressaoSchema } from "@/lib/sdr/esquemas";

export async function GET() {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  return NextResponse.json({ supressoes: await acesso.sdr.supressoes.listar(), podeEscrever: acesso.podeEscrever });
}

export async function POST(req: Request) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const corpo = await lerJson(req);
  if (!corpo.ok) return corpo.resposta;
  const parsed = supressaoSchema.safeParse(corpo.dados);
  if (!parsed.success) return dadosInvalidos();
  try {
    const s = await acesso.sdr.supressoes.criar(parsed.data, acesso.user);
    // O valor (e-mail, telefone) não vai para o log de auditoria: só o id e o tipo.
    await logAudit({ actor: acesso.user, action: "sdr.supressao.criada", metadata: { supressaoId: s.id, tipo: s.tipo, motivo: s.motivo } });
    return NextResponse.json(s, { status: 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
