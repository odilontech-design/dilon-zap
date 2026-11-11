import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { TIPO_FIPE, anos, marcas, modelos, preco } from "@/lib/fipe";
import { respostaDeErro } from "@/lib/veiculos-api";

/**
 * Consulta em cascata da tabela FIPE para o formulário:
 *   ?tipo=CARRO                                 → marcas
 *   ?tipo=CARRO&marca=59                        → modelos
 *   ?tipo=CARRO&marca=59&modelo=5940            → anos
 *   ?tipo=CARRO&marca=59&modelo=5940&ano=2022-1 → preço e código FIPE
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;

  const p = new URL(req.url).searchParams;
  const tipo = TIPO_FIPE[(p.get("tipo") ?? "CARRO") as keyof typeof TIPO_FIPE];
  if (!tipo) return NextResponse.json({ error: "tipo inválido" }, { status: 400 });
  const marca = p.get("marca");
  const modelo = p.get("modelo");
  const ano = p.get("ano");
  try {
    if (marca && modelo && ano) return NextResponse.json(await preco(tipo, marca, modelo, ano));
    if (marca && modelo) return NextResponse.json(await anos(tipo, marca, modelo));
    if (marca) return NextResponse.json(await modelos(tipo, marca));
    return NextResponse.json(await marcas(tipo));
  } catch (e) {
    return respostaDeErro(e);
  }
}
