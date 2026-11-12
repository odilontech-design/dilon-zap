import { NextResponse } from "next/server";
import { prisma } from "@dilon-zap/db";
import { requireUser } from "@/lib/session";
import { exigirRecurso } from "@/lib/plano";
import { opcoesDoCatalogo, tokenOlx } from "@/lib/portais";

/**
 * Catálogo da OLX (marcas, modelos de uma marca, versões de um modelo), com
 * as opções mais parecidas com a ficha do carro primeiro.
 * ?veiculoId=...&marca=60&modelo=1205
 */
export async function GET(req: Request) {
  const user = await requireUser();
  const bloqueio = await exigirRecurso(user, "VEICULOS");
  if (bloqueio) return bloqueio;
  const q = new URL(req.url).searchParams;
  const marca = q.get("marca") ?? undefined;
  const modelo = q.get("modelo") ?? undefined;
  if ((marca && !/^\d+$/.test(marca)) || (modelo && !/^\d+$/.test(modelo))) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const token = await tokenOlx(user.tenantId);
  if (!token) return NextResponse.json({ error: "conecte a conta da OLX primeiro" }, { status: 409 });
  const v = q.get("veiculoId")
    ? await prisma.veiculo.findFirst({ where: { id: q.get("veiculoId")!, tenantId: user.tenantId }, select: { marca: true, modelo: true, versao: true } })
    : null;
  const procurado = !marca ? v?.marca : !modelo ? v?.modelo : v?.versao;
  try {
    return NextResponse.json({ opcoes: await opcoesDoCatalogo(token, { marca, modelo }, procurado ?? null) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "falha ao consultar a OLX" }, { status: 502 });
  }
}
