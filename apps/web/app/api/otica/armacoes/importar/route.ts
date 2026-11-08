import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { ehGerencia } from "@/lib/papeis";
import { importarArmacoes } from "@/lib/otica-estoque";
import { lerListaDeArmacoes } from "@/lib/otica-regras";
import { importarArmacoesSchema } from "@/lib/otica-schemas";

/**
 * Importa a lista de armações colada da planilha. Em dois tempos: primeiro
 * `simular: true` mostra quantas entram, quantas já existiam e quais linhas
 * têm problema; só depois, com `simular: false`, grava. Linha ruim não impede
 * as boas. Só a gestão importa.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "OTICA");
  if (bloqueio) return bloqueio;
  if (!ehGerencia(user.role)) return NextResponse.json({ error: "só a gestão importa a lista de armações" }, { status: 403 });

  const parsed = importarArmacoesSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { linhas, erros } = lerListaDeArmacoes(parsed.data.texto);
  if (linhas.length === 0) return NextResponse.json({ error: erros[0]?.erro ?? "nenhuma armação para importar", erros }, { status: 400 });
  const r = await importarArmacoes(user.tenantId, linhas, user.id, parsed.data.simular);
  return NextResponse.json({ ...r, lidas: linhas.length, erros });
}
