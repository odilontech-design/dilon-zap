import { NextResponse } from "next/server";
import { esquemaDaPrevia } from "@/lib/erp-contratacao";
import { contratacaoDisponivel, previaParaContratacao } from "@/lib/erp-contratacao-servico";
import { criarLimitador, enderecoDoPedido } from "@/lib/limite-de-pedidos";

/** Pública: o texto do termo (com as condições do plano) para a pessoa ler antes de aceitar. Não grava nada. */
const passouDoTeto = criarLimitador(40, 60 * 60 * 1000);

export async function POST(req: Request) {
  if (passouDoTeto(enderecoDoPedido(req))) return NextResponse.json({ error: "Muitas consultas. Tente de novo mais tarde." }, { status: 429 });
  if (!contratacaoDisponivel()) return NextResponse.json({ error: "A contratação online está indisponível no momento." }, { status: 503 });
  const v = esquemaDaPrevia.safeParse(await req.json().catch(() => null));
  if (!v.success) return NextResponse.json({ error: v.error.issues[0]?.message ?? "Confira os dados." }, { status: 400 });
  try {
    const { previa, condicoes } = await previaParaContratacao(v.data.plano, v.data.escritorioNome);
    return NextResponse.json({ titulo: previa.titulo, clausulas: previa.clausulas, hash: previa.hash, versao: previa.versao, condicoes });
  } catch {
    return NextResponse.json({ error: "Não conseguimos montar o termo agora. Tente em instantes." }, { status: 503 });
  }
}
