import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { guardaFinanceiro, fimDoDiaBR, inicioDoDiaBR, parseDia } from "@/lib/guarda-financeiro";
import { relatorioPorCategoria } from "@/lib/categorias-financeiras";

/** Relatório por categoria do plano de contas. ?de=YYYY-MM-DD&ate=YYYY-MM-DD */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await guardaFinanceiro(user);
  if (bloqueio) return bloqueio;

  const q = new URL(req.url).searchParams;
  const de = q.get("de");
  const ate = q.get("ate");
  const instanteDe = inicioDoDiaBR(de);
  const instanteAte = fimDoDiaBR(ate);
  const diaDe = parseDia(de);
  const diaAte = parseDia(ate);
  if (!instanteDe || !instanteAte || !diaDe || !diaAte) return NextResponse.json({ error: "informe o período" }, { status: 400 });
  if (diaDe > diaAte) return NextResponse.json({ error: "a data inicial é depois da final" }, { status: 400 });
  if (diaAte.getTime() - diaDe.getTime() > 400 * 86_400_000) return NextResponse.json({ error: "período máximo de 13 meses" }, { status: 400 });

  return NextResponse.json(await relatorioPorCategoria(user.tenantId, { instanteDe, instanteAte, diaDe, diaAte }));
}
