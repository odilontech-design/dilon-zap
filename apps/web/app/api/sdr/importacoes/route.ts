import { NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { dadosInvalidos, lerJson, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { criarImportacaoSchema } from "@/lib/sdr/esquemas";

export async function GET() {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);
  return NextResponse.json({ importacoes: await acesso.sdr.importacoes.listar(), podeEscrever: acesso.podeEscrever });
}

/** Confirma a importação: o arquivo é lido de novo aqui, nada da prévia é confiado. O processamento vai para a fila. */
export async function POST(req: Request) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const corpo = await lerJson(req);
  if (!corpo.ok) return corpo.resposta;
  const parsed = criarImportacaoSchema.safeParse(corpo.dados);
  if (!parsed.success) return dadosInvalidos();
  try {
    const { importacao, duplicada } = await acesso.sdr.importacoes.criar(acesso.user, parsed.data);
    if (!duplicada) {
      await logAudit({
        actor: acesso.user,
        action: "sdr.importacao.criada",
        metadata: { importacaoId: importacao.id, linhas: importacao.totalLinhas, invalidas: importacao.invalidas, campanhaId: importacao.campanhaId },
      });
    }
    return NextResponse.json({ ...importacao, duplicada }, { status: duplicada ? 200 : 201 });
  } catch (e) {
    return respostaDeErro(e);
  }
}
