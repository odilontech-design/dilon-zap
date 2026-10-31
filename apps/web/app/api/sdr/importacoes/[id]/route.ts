import { NextResponse } from "next/server";
import { dadosInvalidos, recusa, respostaDeErro, verificarAcessoSdr } from "@/lib/sdr/acesso";
import { filtroLinhasSchema } from "@/lib/sdr/esquemas";

type Contexto = { params: { id: string } };

/** A importação, com o trabalho da fila e a página de linhas pedida (`?status=INVALIDA&pagina=2`). */
export async function GET(req: Request, { params }: Contexto) {
  const acesso = await verificarAcessoSdr("ler");
  if (!acesso.ok) return recusa(acesso);

  const filtro = filtroLinhasSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!filtro.success) return dadosInvalidos();
  try {
    const [importacao, linhas] = await Promise.all([acesso.sdr.importacoes.obter(params.id), acesso.sdr.importacoes.linhas(params.id, filtro.data)]);
    return NextResponse.json({ ...importacao, linhas, podeEscrever: acesso.podeEscrever });
  } catch (e) {
    return respostaDeErro(e);
  }
}
