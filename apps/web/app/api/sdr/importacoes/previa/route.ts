import { NextResponse } from "next/server";
import { dadosInvalidos, lerJson, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { previaSchema } from "@/lib/sdr/esquemas";

/** Mostra o que a importação faria. Não grava nada. Só quem pode importar vê a prévia. */
export async function POST(req: Request) {
  const acesso = await verificarAcessoSdr("escrever");
  if (!acesso.ok) return recusa(acesso);

  const corpo = await lerJson(req);
  if (!corpo.ok) return corpo.resposta;
  const parsed = previaSchema.safeParse(corpo.dados);
  if (!parsed.success) return dadosInvalidos();
  try {
    return NextResponse.json(await acesso.sdr.importacoes.previa(parsed.data.conteudo, parsed.data.mapeamento));
  } catch (e) {
    return respostaDeErro(e);
  }
}
